use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{validate_path, PackageError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub entry: String,
    pub profiles: Vec<ProfileRole>,
    pub permissions: Vec<Permission>,
    pub icon: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<Category>,
    pub window: WindowSize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Development,
    Education,
    Office,
    Graphics,
    Internet,
    Media,
    System,
    Utilities,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProfileRole {
    Administrator,
    Teacher,
    Student,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    FileRead,
    FileWrite,
    ClipboardRead,
    ClipboardWrite,
    Notifications,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WindowSize {
    pub width: u16,
    pub height: u16,
}

impl Manifest {
    pub fn from_json(bytes: &[u8]) -> Result<Self, PackageError> {
        if bytes.len() > crate::MAX_MANIFEST {
            return Err(PackageError::Limit);
        }
        let manifest: Self = serde_json::from_slice(bytes)
            .map_err(|_| PackageError::Manifest("estrutura ou tipo de campo desconhecido"))?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), PackageError> {
        let valid_segment = |segment: &str| {
            segment
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_lowercase)
                && !segment.ends_with('-')
                && segment
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        };
        if self.id.len() > 120 || !self.id.contains('.') || !self.id.split('.').all(valid_segment) {
            return Err(PackageError::Manifest(
                "ID deve usar segmentos de domínio reverso",
            ));
        }
        if self.name.trim().is_empty()
            || self.name.chars().count() > 80
            || self.name.chars().any(char::is_control)
        {
            return Err(PackageError::Manifest(
                "nome deve ter entre 1 e 80 caracteres",
            ));
        }
        if self.version.len() > 80 || semver::Version::parse(&self.version).is_err() {
            return Err(PackageError::Manifest("versão deve seguir SemVer"));
        }
        if self.profiles.is_empty() || has_duplicates(&self.profiles) {
            return Err(PackageError::Manifest("informe perfis elegíveis distintos"));
        }
        if has_duplicates(&self.permissions) {
            return Err(PackageError::Manifest("há permissões repetidas"));
        }
        if !(300..=4096).contains(&self.window.width) || !(235..=4096).contains(&self.window.height)
        {
            return Err(PackageError::Manifest(
                "dimensões iniciais da janela fora dos limites",
            ));
        }
        validate_path(&self.entry)
            .map_err(|_| PackageError::Manifest("ponto de entrada inválido"))?;
        validate_path(&self.icon)
            .map_err(|_| PackageError::Manifest("caminho do ícone inválido"))?;
        if !self.icon.rsplit_once('.').is_some_and(|(_, extension)| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png" | "jpeg" | "jpg" | "webp"
            )
        }) {
            return Err(PackageError::Manifest("use um ícone PNG, JPEG ou WebP"));
        }
        if self.entry == self.icon {
            return Err(PackageError::Manifest(
                "o ponto de entrada e o ícone devem ser arquivos distintos",
            ));
        }
        Ok(())
    }

    pub(crate) fn validate_resources(
        &self,
        contains: impl Fn(&str) -> bool,
    ) -> Result<(), PackageError> {
        if !contains(&self.entry) {
            return Err(PackageError::Manifest(
                "o ponto de entrada não está no pacote",
            ));
        }
        if !contains(&self.icon) {
            return Err(PackageError::Manifest("o ícone não está no pacote"));
        }
        Ok(())
    }
}

fn has_duplicates<T: Ord>(items: &[T]) -> bool {
    items.iter().collect::<BTreeSet<_>>().len() != items.len()
}
