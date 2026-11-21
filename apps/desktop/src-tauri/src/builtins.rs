use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{NewWindowResponse, PermissionResponse},
    Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;

use crate::shop::{directory, local_path, read_limited, save_file};

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Operation {
    List,
    Create { name: String },
    Rename { original: String, name: String },
    Import,
    Export { name: String },
}

#[derive(Serialize)]
pub struct Entry {
    pub(crate) name: String,
    pub(crate) folder: bool,
}

pub(crate) fn safe_name(name: &str) -> Result<&str, String> {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let reserved = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || ["com", "lpt"].iter().any(|prefix| {
            stem.strip_prefix(prefix)
                .is_some_and(|suffix| suffix.len() == 1 && suffix.as_bytes()[0].is_ascii_digit())
        });
    if name.is_empty()
        || name.len() > 200
        || name == "."
        || name == ".."
        || name.starts_with(' ')
        || name.ends_with([' ', '.'])
        || name
            .chars()
            .any(|ch| ch.is_control() || "\\/:*?\"<>|".contains(ch))
        || reserved
    {
        Err("Use um nome de arquivo válido para Linux, Windows e macOS.".into())
    } else {
        Ok(name)
    }
}

pub(crate) fn profile_folder(root: PathBuf, profile: &str) -> Result<PathBuf, String> {
    if profile != "administrator"
        && !(profile.len() == 36
            && profile.bytes().enumerate().all(|(index, byte)| {
                if [8, 13, 18, 23].contains(&index) {
                    byte == b'-'
                } else {
                    byte.is_ascii_hexdigit()
                }
            }))
    {
        return Err("Perfil local inválido.".into());
    }
    let base = root
        .parent()
        .ok_or("Pasta de perfil indisponível.")?
        .join("arquivos");
    for path in [&base, &base.join(profile)] {
        if !path.exists() {
            fs::create_dir_all(path).map_err(|_| "Não foi possível criar a pasta do perfil.")?;
        }
        if !fs::symlink_metadata(path).is_ok_and(|details| details.is_dir()) {
            return Err("O armazenamento do perfil precisa ser uma pasta local.".into());
        }
    }
    Ok(base.join(profile))
}

fn list(folder: &Path) -> Result<Vec<Entry>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(folder).map_err(|_| "Não foi possível listar a pasta.")? {
        let entry = entry.map_err(|_| "Não foi possível ler um arquivo da pasta.")?;
        let kind = entry
            .file_type()
            .map_err(|_| "Não foi possível verificar o arquivo.")?;
        if kind.is_file() || kind.is_dir() {
            if let Some(name) = entry
                .file_name()
                .to_str()
                .filter(|name| safe_name(name).is_ok())
            {
                entries.push(Entry {
                    name: name.into(),
                    folder: kind.is_dir(),
                });
            }
        }
    }
    entries.sort_by_key(|entry| (!entry.folder, entry.name.to_lowercase()));
    Ok(entries)
}

#[tauri::command]
pub async fn builtin_files(
    window: WebviewWindow,
    profile: String,
    path: Vec<String>,
    action: Operation,
) -> Result<Vec<Entry>, String> {
    manage_files(
        &window,
        profile_folder(directory(&window)?, &profile)?,
        path,
        action,
    )
}

pub(crate) fn resolve_folder(mut folder: PathBuf, path: Vec<String>) -> Result<PathBuf, String> {
    if path.len() > 24 {
        return Err("A pasta está muito aninhada.".into());
    }
    for segment in path {
        folder.push(safe_name(&segment)?);
        if !fs::symlink_metadata(&folder).is_ok_and(|details| details.is_dir()) {
            return Err("A pasta do perfil não está disponível.".into());
        }
    }
    Ok(folder)
}

pub(crate) fn manage_files(
    window: &WebviewWindow,
    root: PathBuf,
    path: Vec<String>,
    action: Operation,
) -> Result<Vec<Entry>, String> {
    let folder = resolve_folder(root, path)?;
    match action {
        Operation::List => (),
        Operation::Create { name } => {
            fs::create_dir(folder.join(safe_name(&name)?))
                .map_err(|_| "O nome já existe ou a pasta não pôde ser criada.")?;
        }
        Operation::Rename { original, name } => {
            let source = folder.join(safe_name(&original)?);
            let destination = folder.join(safe_name(&name)?);
            if source != destination {
                let entry =
                    fs::symlink_metadata(&source).map_err(|_| "O item original não existe.")?;
                if !(entry.is_dir() || entry.is_file())
                    || fs::symlink_metadata(&destination).is_ok()
                {
                    return Err("O novo nome já existe ou o item não é suportado.".into());
                }
                fs::rename(source, destination).map_err(|_| "Não foi possível renomear o item.")?;
            }
        }
        Operation::Import => {
            if let Some(chosen) = window
                .dialog()
                .file()
                .set_parent(window)
                .blocking_pick_file()
            {
                let source = local_path(chosen)?;
                let name = safe_name(
                    source
                        .file_name()
                        .and_then(|value| value.to_str())
                        .ok_or("Nome de arquivo inválido.")?,
                )?;
                let data = read_limited(&source, 32 * 1024 * 1024)?;
                save_file(&folder.join(name), &data, false)?;
            }
        }
        Operation::Export { name } => {
            let name = safe_name(&name)?;
            let data = read_limited(&folder.join(name), 32 * 1024 * 1024)?;
            if let Some(chosen) = window
                .dialog()
                .file()
                .set_parent(window)
                .set_file_name(name)
                .blocking_save_file()
            {
                save_file(&local_path(chosen)?, &data, true)?;
            }
        }
    }
    list(&folder)
}

fn export(window: &WebviewWindow, name: &str, bytes: &[u8], limit: usize) -> Result<bool, String> {
    directory(window)?;
    if bytes.len() > limit {
        return Err("O arquivo excede o limite permitido.".into());
    }
    let Some(chosen) = window
        .dialog()
        .file()
        .set_parent(window)
        .set_file_name(safe_name(name)?)
        .blocking_save_file()
    else {
        return Ok(false);
    };
    save_file(&local_path(chosen)?, bytes, true)?;
    Ok(true)
}

#[tauri::command]
pub async fn builtin_save_text(
    window: WebviewWindow,
    name: String,
    text: String,
) -> Result<bool, String> {
    export(&window, &name, text.as_bytes(), 2 * 1024 * 1024)
}

#[tauri::command]
pub async fn builtin_save_binary(
    window: WebviewWindow,
    name: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    export(&window, &name, &bytes, 12 * 1024 * 1024)
}

#[derive(Default)]
pub struct MicrophoneGrant(std::sync::Mutex<Option<std::time::Instant>>);

impl MicrophoneGrant {
    pub fn take(&self) -> bool {
        self.0
            .lock()
            .ok()
            .and_then(|mut grant| grant.take())
            .is_some_and(|deadline| deadline > std::time::Instant::now())
    }
}

#[tauri::command]
pub fn builtin_microphone(
    window: WebviewWindow,
    grant: tauri::State<'_, MicrophoneGrant>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("O microfone está disponível somente no Gravador do EduOS.".into());
    }
    let mut current = grant
        .0
        .lock()
        .map_err(|_| "Não foi possível autorizar a gravação.")?;
    *current = Some(std::time::Instant::now() + std::time::Duration::from_secs(8));
    Ok(())
}

#[tauri::command]
pub async fn builtin_open_office(window: WebviewWindow, profile: String) -> Result<(), String> {
    // Validate the profile ID with the same storage rule used by other built-ins.
    let root = directory(&window)?;
    profile_folder(root.clone(), &profile)?;
    let office_dir = root
        .parent()
        .ok_or("Pasta de dados indisponível.")?
        .join("escola-office")
        .join(&profile);
    let label = format!("escola-office-{profile}");
    if let Some(existing) = window.get_webview_window(&label) {
        existing.unminimize().map_err(|error| error.to_string())?;
        return existing.set_focus().map_err(|error| error.to_string());
    }
    let original = window.url().map_err(|error| error.to_string())?;
    let builder = WebviewWindowBuilder::new(
        window.app_handle(),
        &label,
        WebviewUrl::App("escola-office/index.html".into()),
    )
    .title("Escola Office")
    .inner_size(1150.0, 760.0)
    .min_inner_size(760.0, 530.0)
    .on_navigation(move |target| {
        target.scheme() == original.scheme()
            && target.host_str() == original.host_str()
            && target.port() == original.port()
            && target.path() == "/escola-office/index.html"
    })
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .on_permission_request(|_, _| PermissionResponse::Deny)
    .data_directory(office_dir);
    #[cfg(target_os = "macos")]
    let builder = builder.data_store_identifier(office_store_id(&profile)?);
    builder
        .build()
        .map_err(|error| format!("Não foi possível abrir o Escola Office: {error}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn office_store_id(profile: &str) -> Result<[u8; 16], String> {
    if profile == "administrator" {
        return Ok(*b"eduos-office-v1!");
    }
    let packed = profile.replace('-', "");
    let mut result = [0u8; 16];
    for (index, byte) in result.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&packed[index * 2..index * 2 + 2], 16)
            .map_err(|_| "Perfil inválido.")?;
    }
    Ok(result)
}

#[tauri::command]
pub async fn builtin_close_office(window: WebviewWindow, profile: String) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Comando reservado à janela principal.".into());
    }
    if let Some(office) = window.get_webview_window(&format!("escola-office-{profile}")) {
        office.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_reject_path_components_and_reserved_devices() {
        for name in [
            "../segredo",
            "..",
            "outro/arquivo",
            "outro\\arquivo",
            "NUL.txt",
            "AUX",
            "prova.",
        ] {
            assert!(safe_name(name).is_err(), "{name}");
        }
        assert_eq!(
            safe_name("Material da aula.md").unwrap(),
            "Material da aula.md"
        );
    }

    #[test]
    fn separates_files_by_profile() {
        let directory = tempfile::tempdir().unwrap();
        let shop = directory.path().join("lojinha");
        let admin = profile_folder(shop.clone(), "administrator").unwrap();
        let student = profile_folder(shop.clone(), "ed000000-0000-4000-8000-000000000000").unwrap();
        fs::write(admin.join("notas.md"), b"administrador").unwrap();
        assert!(list(&student).unwrap().is_empty());
        assert!(profile_folder(shop, "../administrator").is_err());
    }
}
