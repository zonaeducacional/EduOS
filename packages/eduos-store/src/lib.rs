#![forbid(unsafe_code)]

mod key_backup;

pub use key_backup::{export_key, import_key, KeyBackupError};

use std::{collections::BTreeSet, path::Path, time::Duration};

use eduos_package::{
    key_id, verify_package, KeyId, Manifest, PackageError, Permission, ProfileRole, TrustedKeys,
    VerifyingKey,
};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use semver::Version;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error(transparent)]
    Package(#[from] PackageError),
    #[error("O armazenamento local da Lojinha não pôde concluir a operação.")]
    Database(#[from] rusqlite::Error),
    #[error("O registro local da Lojinha está inválido.")]
    InvalidRecord,
    #[error("A chave pública informada é inválida.")]
    InvalidKey,
    #[error("A versão do pacote precisa ser mais recente que a instalada.")]
    Version,
    #[error("A atualização precisa usar a mesma chave da versão instalada.")]
    PublisherChanged,
    #[error("As permissões ou os perfis escolhidos não constam no manifesto do pacote.")]
    InvalidConsent,
    #[error("Aplicativo não instalado.")]
    MissingApp,
    #[error("O recurso solicitado não existe no pacote do aplicativo.")]
    MissingResource,
    #[error("Não há uma versão anterior para reverter.")]
    MissingPrevious,
    #[error("O pacote publicado mudou. Atualize a vitrine antes de instalar.")]
    CatalogChanged,
    #[error("O conteúdo desta versão já foi publicado ou instalado. Use uma versão nova.")]
    VersionContentChanged,
    #[error("Este aplicativo não foi liberado para o perfil atual.")]
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Consent {
    pub profiles: BTreeSet<ProfileRole>,
    pub permissions: BTreeSet<Permission>,
}

impl Consent {
    fn validate(&self, manifest: &Manifest) -> Result<(), StoreError> {
        if self
            .profiles
            .iter()
            .all(|profile| manifest.profiles.contains(profile))
            && self
                .permissions
                .iter()
                .all(|permission| manifest.permissions.contains(permission))
        {
            Ok(())
        } else {
            Err(StoreError::InvalidConsent)
        }
    }
}

/// The bytes reviewed for confirmation are the same bytes installed.
#[derive(Debug)]
pub struct PreparedPackage {
    bytes: Vec<u8>,
    manifest: Manifest,
    signer: KeyId,
}

impl PreparedPackage {
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    pub fn signer(&self) -> KeyId {
        self.signer
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub manifest: Manifest,
    pub signer: KeyId,
    pub consent: Consent,
    pub can_revert: bool,
    pub trusted: bool,
}

#[derive(Debug, Serialize)]
pub struct CatalogEntry {
    pub manifest: Manifest,
    pub consent: Consent,
    pub installed_version: Option<String>,
    pub installable: bool,
}

pub struct RuntimeData {
    pub metadata: InstalledApp,
    pub entry: Vec<u8>,
    pub resource: Option<Vec<u8>>,
}

pub struct Store(Connection);

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", true)?;
        let schema = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let version: u32 = schema.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version > 2 {
            return Err(StoreError::InvalidRecord);
        }
        if version == 0 {
            schema.execute_batch(include_str!("schema.sql"))?;
        }
        if version < 2 {
            schema.execute_batch(include_str!("catalog.sql"))?;
        }
        schema.commit()?;
        Ok(Self(connection))
    }

    pub fn trust_key(&self, key: VerifyingKey) -> Result<KeyId, StoreError> {
        if key.is_weak() {
            return Err(StoreError::InvalidKey);
        }
        let id = key_id(&key);
        self.0.execute(
            "INSERT INTO trusted_keys(id, public_key) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
            params![id.as_slice(), key.as_bytes().as_slice()],
        )?;
        Ok(id)
    }

    pub fn revoke_key(&self, signer: KeyId) -> Result<bool, StoreError> {
        Ok(self.0.execute(
            "DELETE FROM trusted_keys WHERE id = ?1",
            [signer.as_slice()],
        )? > 0)
    }

    pub fn prepare(&self, bytes: Vec<u8>) -> Result<PreparedPackage, StoreError> {
        let verified = verify_package(&bytes, &trusted_keys(&self.0)?)?;
        let manifest = verified.manifest().clone();
        let signer = verified.signer();
        Ok(PreparedPackage {
            bytes,
            manifest,
            signer,
        })
    }

    pub fn install(
        &mut self,
        candidate: PreparedPackage,
        consent: Consent,
    ) -> Result<InstalledApp, StoreError> {
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let installed = install_checked(&tx, &candidate.bytes, consent)?;
        tx.commit()?;
        Ok(installed)
    }

    pub fn publish(
        &mut self,
        candidate: PreparedPackage,
        consent: Consent,
    ) -> Result<(), StoreError> {
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let verified = verify_package(&candidate.bytes, &trusted_keys(&tx)?)?;
        let manifest = verified.manifest();
        consent.validate(manifest)?;
        if consent.profiles.is_empty() {
            return Err(StoreError::InvalidConsent);
        }
        let signer = verified.signer();
        for sql in [
            "SELECT metadata, package = ?2 FROM catalog WHERE id = ?1",
            "SELECT active_metadata, active_package = ?2 FROM apps WHERE id = ?1",
        ] {
            let existing: Option<(String, bool)> = tx
                .query_row(sql, params![manifest.id, candidate.bytes], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })
                .optional()?;
            let Some((json, same_bytes)) = existing else {
                continue;
            };
            let existing = parse_metadata(&json)?;
            if existing.signer != signer {
                return Err(StoreError::PublisherChanged);
            }
            let order = version_compare(&manifest.version, &existing.manifest.version)?;
            if order.is_lt() {
                return Err(StoreError::Version);
            }
            if order.is_eq() && !same_bytes {
                return Err(StoreError::VersionContentChanged);
            }
        }
        let metadata = InstalledApp {
            manifest: manifest.clone(),
            signer,
            consent,
            can_revert: false,
            trusted: true,
        };
        let json = serde_json::to_string(&metadata).map_err(|_| StoreError::InvalidRecord)?;
        tx.execute(
            "INSERT INTO catalog(id, package, metadata) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET package = excluded.package, metadata = excluded.metadata",
            params![manifest.id, candidate.bytes, json],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn unpublish(&self, id: &str) -> Result<(), StoreError> {
        if self.0.execute("DELETE FROM catalog WHERE id = ?1", [id])? == 0 {
            return Err(StoreError::Unavailable);
        }
        Ok(())
    }

    /// A missing role lists every publication for the administration panel.
    pub fn catalog(&self, profile: Option<ProfileRole>) -> Result<Vec<CatalogEntry>, StoreError> {
        let keys = trusted_ids(&self.0)?;
        let mut statement = self.0.prepare(
            "SELECT catalog.metadata, apps.active_metadata FROM catalog
              LEFT JOIN apps ON apps.id = catalog.id ORDER BY catalog.id",
        )?;
        let mut rows = statement.query([])?;
        let mut entries = Vec::new();
        while let Some(row) = rows.next()? {
            let published = parse_metadata(&row.get::<_, String>(0)?)?;
            let trusted = keys.contains(&published.signer);
            if profile.is_some_and(|role| !trusted || !published.consent.profiles.contains(&role)) {
                continue;
            }
            let active = row
                .get::<_, Option<String>>(1)?
                .map(|value| parse_metadata(&value))
                .transpose()?;
            let installable = trusted
                && match active.as_ref() {
                    None => true,
                    Some(active) => {
                        published.signer == active.signer
                            && version_compare(
                                &published.manifest.version,
                                &active.manifest.version,
                            )?
                            .is_gt()
                    }
                };
            entries.push(CatalogEntry {
                manifest: published.manifest,
                consent: published.consent,
                installed_version: active.map(|item| item.manifest.version),
                installable,
            });
        }
        Ok(entries)
    }

    pub fn install_published(
        &mut self,
        id: &str,
        version: &str,
        profile: ProfileRole,
        approved: Consent,
    ) -> Result<InstalledApp, StoreError> {
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let published: Option<(Vec<u8>, String)> = tx
            .query_row(
                "SELECT package, metadata FROM catalog WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let (bytes, json) = published.ok_or(StoreError::Unavailable)?;
        let metadata = parse_metadata(&json)?;
        if !metadata.consent.profiles.contains(&profile) {
            return Err(StoreError::Unavailable);
        }
        if metadata.manifest.version != version || metadata.consent != approved {
            return Err(StoreError::CatalogChanged);
        }
        let verified = verify_package(&bytes, &trusted_keys(&tx)?)?;
        validate_metadata(id, &metadata, verified.manifest(), verified.signer())?;
        let installed = install_checked(&tx, &bytes, metadata.consent)?;
        tx.commit()?;
        Ok(installed)
    }

    pub fn revert(&mut self, id: &str) -> Result<InstalledApp, StoreError> {
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let row: Option<(Option<Vec<u8>>, Option<String>)> = tx
            .query_row(
                "SELECT previous_package, previous_metadata FROM apps WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let (bytes, json) = row.ok_or(StoreError::MissingApp)?;
        let (bytes, json) = bytes.zip(json).ok_or(StoreError::MissingPrevious)?;
        let verified = verify_package(&bytes, &trusted_keys(&tx)?)?;
        let mut previous = parse_metadata(&json)?;
        validate_metadata(id, &previous, verified.manifest(), verified.signer())?;
        previous.can_revert = false;
        previous.trusted = true;
        let json = serde_json::to_string(&previous).map_err(|_| StoreError::InvalidRecord)?;
        tx.execute(
            "UPDATE apps SET active_package = previous_package, active_metadata = ?2,
               previous_package = NULL, previous_metadata = NULL WHERE id = ?1",
            params![id, json],
        )?;
        tx.commit()?;
        Ok(previous)
    }

    pub fn remove(&self, id: &str) -> Result<(), StoreError> {
        if self.0.execute("DELETE FROM apps WHERE id = ?1", [id])? == 0 {
            return Err(StoreError::MissingApp);
        }
        Ok(())
    }

    pub fn installed(&self) -> Result<Vec<InstalledApp>, StoreError> {
        let keys = trusted_ids(&self.0)?;
        let mut statement = self.0.prepare(
            "SELECT active_metadata, previous_package IS NOT NULL FROM apps ORDER BY id",
        )?;
        let mut rows = statement.query([])?;
        let mut apps = Vec::new();
        while let Some(row) = rows.next()? {
            let json: String = row.get(0)?;
            let mut metadata = parse_metadata(&json)?;
            metadata.can_revert = row.get(1)?;
            metadata.trusted = keys.contains(&metadata.signer);
            apps.push(metadata);
        }
        Ok(apps)
    }

    pub fn runtime_data(
        &mut self,
        id: &str,
        profile: ProfileRole,
        resource: Option<&str>,
    ) -> Result<RuntimeData, StoreError> {
        let (metadata, bytes) = self.package_for_profile(id, profile)?;
        let verified = verify_package(&bytes, &trusted_keys(&self.0)?)?;
        let entry = verified
            .resource(&metadata.manifest.entry)
            .ok_or(StoreError::InvalidRecord)?;
        let resource = resource
            .map(|path| verified.resource(path).ok_or(StoreError::MissingResource))
            .transpose()?;
        Ok(RuntimeData {
            metadata,
            entry: entry.to_vec(),
            resource: resource.map(<[u8]>::to_vec),
        })
    }

    /// Re-checks the installed bytes and the current trust policy before handing an app to the host.
    pub fn package_for_profile(
        &mut self,
        id: &str,
        profile: ProfileRole,
    ) -> Result<(InstalledApp, Vec<u8>), StoreError> {
        let tx = self.0.transaction()?;
        let metadata = read_metadata(&tx, id)?.ok_or(StoreError::MissingApp)?;
        if !metadata.consent.profiles.contains(&profile) {
            return Err(StoreError::Unavailable);
        }
        let bytes: Vec<u8> = tx.query_row(
            "SELECT active_package FROM apps WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;
        let verified = verify_package(&bytes, &trusted_keys(&tx)?)?;
        validate_metadata(id, &metadata, verified.manifest(), verified.signer())?;
        Ok((metadata, bytes))
    }
}

fn version_compare(left: &str, right: &str) -> Result<std::cmp::Ordering, StoreError> {
    let left = Version::parse(left).map_err(|_| StoreError::InvalidRecord)?;
    let right = Version::parse(right).map_err(|_| StoreError::InvalidRecord)?;
    Ok(left.cmp_precedence(&right))
}

fn install_checked(
    connection: &Connection,
    bytes: &[u8],
    consent: Consent,
) -> Result<InstalledApp, StoreError> {
    let verified = verify_package(bytes, &trusted_keys(connection)?)?;
    let manifest = verified.manifest();
    let signer = verified.signer();
    consent.validate(manifest)?;
    let installed = read_metadata(connection, &manifest.id)?;
    if let Some(ref installed) = installed {
        if signer != installed.signer {
            return Err(StoreError::PublisherChanged);
        }
        let incoming = Version::parse(&manifest.version).map_err(|_| StoreError::InvalidRecord)?;
        let current =
            Version::parse(&installed.manifest.version).map_err(|_| StoreError::InvalidRecord)?;
        if incoming.cmp_precedence(&current).is_le() {
            return Err(StoreError::Version);
        }
    }
    let metadata = InstalledApp {
        manifest: manifest.clone(),
        signer,
        consent,
        can_revert: installed.is_some(),
        trusted: true,
    };
    let json = serde_json::to_string(&metadata).map_err(|_| StoreError::InvalidRecord)?;
    connection.execute(
            "INSERT INTO apps(id, active_package, active_metadata) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
               previous_package = apps.active_package, previous_metadata = apps.active_metadata,
               active_package = excluded.active_package, active_metadata = excluded.active_metadata",
            params![manifest.id, bytes, json],
        )?;
    Ok(metadata)
}

fn trusted_keys(connection: &Connection) -> Result<TrustedKeys, StoreError> {
    let mut statement = connection.prepare("SELECT id, public_key FROM trusted_keys")?;
    let mut rows = statement.query([])?;
    let mut keys = TrustedKeys::default();
    while let Some(row) = rows.next()? {
        let expected: KeyId = row.get(0)?;
        let public: [u8; 32] = row.get(1)?;
        let key = VerifyingKey::from_bytes(&public).map_err(|_| StoreError::InvalidKey)?;
        if key.is_weak() || keys.insert(key) != expected {
            return Err(StoreError::InvalidKey);
        }
    }
    Ok(keys)
}

fn trusted_ids(connection: &Connection) -> Result<BTreeSet<KeyId>, StoreError> {
    let mut statement = connection.prepare("SELECT id FROM trusted_keys")?;
    let keys = statement
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(keys)
}

fn parse_metadata(json: &str) -> Result<InstalledApp, StoreError> {
    serde_json::from_str(json).map_err(|_| StoreError::InvalidRecord)
}

fn read_metadata(connection: &Connection, id: &str) -> Result<Option<InstalledApp>, StoreError> {
    let row: Option<(String, bool)> = connection
        .query_row(
            "SELECT active_metadata, previous_package IS NOT NULL FROM apps WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    row.map(|(json, can_revert)| {
        let mut metadata = parse_metadata(&json)?;
        metadata.can_revert = can_revert;
        Ok(metadata)
    })
    .transpose()
}

fn validate_metadata(
    id: &str,
    stored: &InstalledApp,
    manifest: &Manifest,
    signer: KeyId,
) -> Result<(), StoreError> {
    if stored.manifest != *manifest || stored.signer != signer || id != manifest.id {
        return Err(StoreError::InvalidRecord);
    }
    stored.consent.validate(manifest)
}

#[cfg(test)]
mod tests;
