#![forbid(unsafe_code)]

mod manifest;

use std::collections::{BTreeMap, BTreeSet};

use ed25519_dalek::{Signature, Signer};
pub use ed25519_dalek::{SigningKey, VerifyingKey};
pub use manifest::{Category, Manifest, Permission, ProfileRole, WindowSize};
use rand_core::OsRng;
use sha2::{Digest, Sha256};
use thiserror::Error;

/// These bytes identify the format version and separate the signature domain.
const MAGIC: &[u8; 8] = b"EDUOS\0\x01\n";
const SIGNATURE_LENGTH: usize = 64;
const MAX_PACKAGE: usize = 64 * 1024 * 1024;
const MAX_RESOURCE: usize = 16 * 1024 * 1024;
const MAX_MANIFEST: usize = 32 * 1024;
const MAX_RESOURCES: usize = 1024;
const MAX_PATH: usize = 240;

pub type KeyId = [u8; 32];

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PackageError {
    #[error("Formato ou versão de pacote .eduos inválido.")]
    InvalidFormat,
    #[error("O pacote excede os limites de tamanho ou quantidade de arquivos.")]
    Limit,
    #[error("Manifesto inválido: {0}.")]
    Manifest(&'static str),
    #[error("Caminho de arquivo inválido no pacote.")]
    InvalidPath,
    #[error("Arquivos duplicados ou caminhos em conflito no pacote.")]
    PathCollision,
    #[error("O pacote .eduos não contém uma assinatura.")]
    MissingSignature,
    #[error("A chave usada para assinar este pacote não é confiável.")]
    UntrustedKey,
    #[error("Assinatura inválida. O manifesto ou o conteúdo pode ter sido alterado.")]
    InvalidSignature,
}

pub fn generate_signing_key() -> SigningKey {
    SigningKey::generate(&mut OsRng)
}

pub fn key_id(key: &VerifyingKey) -> KeyId {
    Sha256::digest(key.as_bytes()).into()
}

/// Public keys are added explicitly by the host. Packages carry no trust roots.
#[derive(Default)]
pub struct TrustedKeys(BTreeMap<KeyId, VerifyingKey>);

impl TrustedKeys {
    pub fn insert(&mut self, key: VerifyingKey) -> KeyId {
        let id = key_id(&key);
        self.0.insert(id, key);
        id
    }
}

/// A package whose signature, manifest and file table have been checked.
#[derive(Debug)]
pub struct VerifiedPackage<'a> {
    manifest: Manifest,
    signer: KeyId,
    resources: BTreeMap<&'a str, &'a [u8]>,
}

impl<'a> VerifiedPackage<'a> {
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    pub fn signer(&self) -> KeyId {
        self.signer
    }

    pub fn resource(&self, path: &str) -> Option<&'a [u8]> {
        self.resources.get(path).copied()
    }

    pub fn resources(&self) -> impl Iterator<Item = (&'a str, &'a [u8])> + '_ {
        self.resources.iter().map(|(&path, &bytes)| (path, bytes))
    }
}

pub fn sign_package(
    manifest: &Manifest,
    resources: &BTreeMap<String, Vec<u8>>,
    key: &SigningKey,
) -> Result<Vec<u8>, PackageError> {
    let (manifest_bytes, length) = validated_layout(manifest, resources)?;
    let mut bytes = Vec::with_capacity(length);
    bytes.extend_from_slice(MAGIC);
    bytes.extend_from_slice(&key_id(&key.verifying_key()));
    bytes.extend_from_slice(&(manifest_bytes.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&manifest_bytes);
    bytes.extend_from_slice(&(resources.len() as u16).to_le_bytes());
    for (path, data) in resources {
        bytes.extend_from_slice(&(path.len() as u16).to_le_bytes());
        bytes.extend_from_slice(path.as_bytes());
        bytes.extend_from_slice(&(data.len() as u32).to_le_bytes());
        bytes.extend_from_slice(data);
    }
    let signature = key.sign(&bytes);
    bytes.extend_from_slice(&signature.to_bytes());
    Ok(bytes)
}

pub fn validate_resources(
    manifest: &Manifest,
    resources: &BTreeMap<String, Vec<u8>>,
) -> Result<(), PackageError> {
    validated_layout(manifest, resources).map(|_| ())
}

fn validated_layout(
    manifest: &Manifest,
    resources: &BTreeMap<String, Vec<u8>>,
) -> Result<(Vec<u8>, usize), PackageError> {
    if resources.len() > MAX_RESOURCES {
        return Err(PackageError::Limit);
    }
    manifest.validate()?;
    validate_paths(resources.keys().map(String::as_str))?;
    manifest.validate_resources(|path| resources.contains_key(path))?;
    let manifest_bytes = serde_json::to_vec(manifest)
        .map_err(|_| PackageError::Manifest("não foi possível serializar o manifesto"))?;
    if manifest_bytes.len() > MAX_MANIFEST {
        return Err(PackageError::Limit);
    }
    let mut length = MAGIC.len() + 32 + 4 + manifest_bytes.len() + 2 + SIGNATURE_LENGTH;
    for (path, data) in resources {
        if data.len() > MAX_RESOURCE {
            return Err(PackageError::Limit);
        }
        length += 2 + path.len() + 4 + data.len();
        if length > MAX_PACKAGE {
            return Err(PackageError::Limit);
        }
    }
    Ok((manifest_bytes, length))
}

pub fn verify_package<'a>(
    bytes: &'a [u8],
    trusted: &TrustedKeys,
) -> Result<VerifiedPackage<'a>, PackageError> {
    if bytes.len() > MAX_PACKAGE {
        return Err(PackageError::Limit);
    }
    let mut cursor = Cursor { remaining: bytes };
    if &cursor.fixed::<8>()? != MAGIC {
        return Err(PackageError::InvalidFormat);
    }
    let signer = cursor.fixed::<32>()?;
    let manifest_length = cursor.u32()?;
    if manifest_length > MAX_MANIFEST {
        return Err(PackageError::Limit);
    }
    let manifest_bytes = cursor.take(manifest_length)?;
    let resource_count = cursor.u16()?;
    if resource_count > MAX_RESOURCES {
        return Err(PackageError::Limit);
    }
    let mut resources = BTreeMap::new();
    let mut previous = None;
    for _ in 0..resource_count {
        let path_length = cursor.u16()?;
        if path_length > MAX_PATH {
            return Err(PackageError::InvalidPath);
        }
        let path = std::str::from_utf8(cursor.take(path_length)?)
            .map_err(|_| PackageError::InvalidPath)?;
        if previous.is_some_and(|value| value >= path) {
            return Err(PackageError::PathCollision);
        }
        previous = Some(path);
        let length = cursor.u32()?;
        if length > MAX_RESOURCE {
            return Err(PackageError::Limit);
        }
        resources.insert(path, cursor.take(length)?);
    }
    if cursor.remaining.is_empty() {
        return Err(PackageError::MissingSignature);
    }
    if cursor.remaining.len() != SIGNATURE_LENGTH {
        return Err(PackageError::InvalidSignature);
    }
    let key = trusted.0.get(&signer).ok_or(PackageError::UntrustedKey)?;
    let signature = Signature::from_bytes(&cursor.fixed::<SIGNATURE_LENGTH>()?);
    key.verify_strict(&bytes[..bytes.len() - SIGNATURE_LENGTH], &signature)
        .map_err(|_| PackageError::InvalidSignature)?;

    let manifest = Manifest::from_json(manifest_bytes)?;
    validate_paths(resources.keys().copied())?;
    manifest.validate_resources(|path| resources.contains_key(path))?;
    Ok(VerifiedPackage {
        manifest,
        signer,
        resources,
    })
}

struct Cursor<'a> {
    remaining: &'a [u8],
}

impl<'a> Cursor<'a> {
    fn take(&mut self, length: usize) -> Result<&'a [u8], PackageError> {
        let (value, rest) = self
            .remaining
            .split_at_checked(length)
            .ok_or(PackageError::InvalidFormat)?;
        self.remaining = rest;
        Ok(value)
    }

    fn fixed<const N: usize>(&mut self) -> Result<[u8; N], PackageError> {
        self.take(N)?
            .try_into()
            .map_err(|_| PackageError::InvalidFormat)
    }

    fn u16(&mut self) -> Result<usize, PackageError> {
        Ok(u16::from_le_bytes(self.fixed()?).into())
    }

    fn u32(&mut self) -> Result<usize, PackageError> {
        Ok(u32::from_le_bytes(self.fixed()?) as usize)
    }
}

fn validate_paths<'a>(paths: impl IntoIterator<Item = &'a str>) -> Result<(), PackageError> {
    let mut files = BTreeSet::new();
    let mut directories = BTreeMap::new();
    for path in paths {
        validate_path(path)?;
        if !files.insert(path.to_ascii_lowercase()) {
            return Err(PackageError::PathCollision);
        }
        for (index, _) in path.match_indices('/') {
            let directory = &path[..index];
            let folded = directory.to_ascii_lowercase();
            if directories
                .insert(folded, directory)
                .is_some_and(|value| value != directory)
            {
                return Err(PackageError::PathCollision);
            }
        }
    }
    if files.iter().any(|path| directories.contains_key(path)) {
        return Err(PackageError::PathCollision);
    }
    Ok(())
}

fn validate_path(path: &str) -> Result<(), PackageError> {
    if path.is_empty() || path.len() > MAX_PATH {
        return Err(PackageError::InvalidPath);
    }
    for part in path.split('/') {
        if part.is_empty()
            || part.starts_with('.')
            || part.ends_with('.')
            || !part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
        {
            return Err(PackageError::InvalidPath);
        }
        let stem = part
            .split('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();
        if matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
            || ["com", "lpt"].iter().any(|prefix| {
                stem.strip_prefix(prefix).is_some_and(|suffix| {
                    suffix.len() == 1 && suffix.as_bytes()[0].is_ascii_digit()
                })
            })
        {
            return Err(PackageError::InvalidPath);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
