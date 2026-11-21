use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Deserialize;
use tauri::{
    webview::{NewWindowResponse, PermissionResponse},
    Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::builtins::{manage_files, profile_folder, resolve_folder, safe_name, Entry, Operation};

const PREFIX: &str = "vibelab-";
static FILE_OPERATIONS: Mutex<()> = Mutex::new(());

fn is_vibelab_url(shell: &Url, target: &Url) -> bool {
    target.scheme() == shell.scheme()
        && target.host_str() == shell.host_str()
        && target.port() == shell.port()
        && target.path() == "/vibelab/index.html"
}

#[tauri::command]
pub async fn vibelab_open(window: WebviewWindow, profile: String) -> Result<(), String> {
    profile_folder(crate::shop::directory(&window)?, &profile)?;
    let label = format!("{PREFIX}{profile}");
    if let Some(existing) = window.get_webview_window(&label) {
        existing.unminimize().map_err(|error| error.to_string())?;
        return existing.set_focus().map_err(|error| error.to_string());
    }
    let shell_url = window.url().map_err(|error| error.to_string())?;
    WebviewWindowBuilder::new(
        window.app_handle(),
        label,
        WebviewUrl::App("vibelab/index.html".into()),
    )
    .title("VibeLab — Arquivos")
    .inner_size(1080.0, 720.0)
    .min_inner_size(760.0, 480.0)
    .on_navigation(move |target| is_vibelab_url(&shell_url, target))
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .on_permission_request(|_, _| PermissionResponse::Deny)
    .build()
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn vibelab_close(window: WebviewWindow, profile: String) -> Result<(), String> {
    crate::shop::directory(&window)?;
    if let Some(existing) = window.get_webview_window(&format!("{PREFIX}{profile}")) {
        existing.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn root(window: &WebviewWindow) -> Result<PathBuf, String> {
    let profile = window
        .label()
        .strip_prefix(PREFIX)
        .ok_or("Janela do VibeLab inválida.")?;
    profile_folder(
        window
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?
            .join("lojinha"),
        profile,
    )
}

#[tauri::command]
pub async fn vibelab_files(
    window: WebviewWindow,
    path: Vec<String>,
    action: Operation,
) -> Result<Vec<Entry>, String> {
    let _guard = FILE_OPERATIONS.lock().map_err(|error| error.to_string())?;
    manage_files(&window, root(&window)?, path, action)
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowAction {
    Minimize,
    ToggleMaximize,
    Close,
}

#[tauri::command]
pub fn vibelab_window(window: WebviewWindow, action: WindowAction) -> Result<(), String> {
    root(&window)?;
    match action {
        WindowAction::Minimize => window.minimize(),
        WindowAction::ToggleMaximize if window.is_maximized().unwrap_or(false) => {
            window.unmaximize()
        }
        WindowAction::ToggleMaximize => window.maximize(),
        WindowAction::Close => window.close(),
    }
    .map_err(|error| error.to_string())
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Transfer {
    Copy { destination: Vec<String> },
    Trash,
    PrepareTrash,
    Restore,
    Open,
}

fn entry(root: PathBuf, mut path: Vec<String>) -> Result<PathBuf, String> {
    let name = path.pop().ok_or("Selecione um arquivo ou pasta.")?;
    let item = resolve_folder(root, path)?.join(safe_name(&name)?);
    if !fs::symlink_metadata(&item).is_ok_and(|entry| entry.is_file() || entry.is_dir()) {
        return Err("O item não existe ou não pode ser gerenciado.".into());
    }
    Ok(item)
}

fn copy_item(source: &Path, destination: &Path) -> std::io::Result<()> {
    let ty = fs::symlink_metadata(source)?.file_type();
    if ty.is_file() {
        let mut input = fs::File::open(source)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)?;
        std::io::copy(&mut input, &mut output)?;
    } else if ty.is_dir() {
        fs::create_dir(destination)?;
        for item in fs::read_dir(source)? {
            let item = item?;
            copy_item(&item.path(), &destination.join(item.file_name()))?;
        }
    } else {
        return Err(std::io::Error::other("Tipo de arquivo não suportado."));
    }
    Ok(())
}

#[tauri::command]
pub async fn vibelab_transfer(
    window: WebviewWindow,
    path: Vec<String>,
    action: Transfer,
) -> Result<(), String> {
    let _guard = FILE_OPERATIONS.lock().map_err(|error| error.to_string())?;
    let root = root(&window)?;
    let trash = root.join(".lixeira");
    if matches!(action, Transfer::PrepareTrash) {
        fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
        return resolve_folder(root, vec![".lixeira".into()]).map(|_| ());
    }
    let source = entry(root.clone(), path)?;
    let name = source.file_name().ok_or("Nome de arquivo inválido.")?;
    if source == trash {
        return Err("Selecione um item da lixeira.".into());
    }
    match action {
        Transfer::Open => {
            let extension = source
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if !source.is_file()
                || !matches!(
                    extension.as_str(),
                    "txt"
                        | "md"
                        | "pdf"
                        | "docx"
                        | "odt"
                        | "xlsx"
                        | "ods"
                        | "pptx"
                        | "odp"
                        | "csv"
                        | "png"
                        | "jpg"
                        | "jpeg"
                        | "gif"
                        | "webp"
                        | "mp3"
                        | "wav"
                        | "ogg"
                        | "mp4"
                        | "webm"
                )
            {
                return Err("Use Exportar para este tipo de arquivo.".into());
            }
            open::that_detached(source).map_err(|error| error.to_string())
        }
        Transfer::Copy { destination } => {
            let folder = resolve_folder(root, destination)?;
            let target = folder.join(name);
            if folder.starts_with(&source) || fs::symlink_metadata(&target).is_ok() {
                return Err(
                    "Já existe um item com esse nome ou a pasta de destino está dentro da origem."
                        .into(),
                );
            }
            let staging = tempfile::tempdir_in(&folder).map_err(|error| error.to_string())?;
            let staged = staging.path().join(name);
            copy_item(&source, &staged).map_err(|error| error.to_string())?;
            if fs::symlink_metadata(&target).is_ok() {
                return Err("Já existe um item com esse nome.".into());
            }
            fs::rename(staged, target).map_err(|error| error.to_string())
        }
        Transfer::Trash => {
            if source.starts_with(&trash) {
                return Err("O item já está na lixeira.".into());
            }
            if !trash.exists() {
                fs::create_dir(&trash).map_err(|error| error.to_string())?;
            }
            if !fs::symlink_metadata(&trash).is_ok_and(|entry| entry.is_dir()) {
                return Err("A lixeira do perfil está indisponível.".into());
            }
            let destination = trash.join(name);
            if fs::symlink_metadata(&destination).is_ok() {
                return Err("Já existe um item com esse nome na lixeira.".into());
            }
            fs::rename(&source, destination).map_err(|error| error.to_string())
        }
        Transfer::Restore => {
            if source.parent() != Some(trash.as_path()) {
                return Err("Selecione um item da lixeira.".into());
            }
            let destination = root.join(name);
            if fs::symlink_metadata(&destination).is_ok() {
                return Err("Já existe um item com esse nome em Meus arquivos.".into());
            }
            fs::rename(&source, destination).map_err(|error| error.to_string())
        }
        Transfer::PrepareTrash => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permits_the_local_vibelab_document_on_each_desktop_scheme() {
        for base in [
            "tauri://localhost",
            "http://tauri.localhost",
            "http://127.0.0.1:1420",
        ] {
            let shell = Url::parse(&format!("{base}/")).unwrap();
            let vibelab = Url::parse(&format!("{base}/vibelab/index.html")).unwrap();
            assert!(is_vibelab_url(&shell, &vibelab));
            assert!(!is_vibelab_url(&shell, &shell));
            let external = Url::parse("https://example.com/vibelab/index.html").unwrap();
            assert!(!is_vibelab_url(&shell, &external));
        }
    }

    #[test]
    fn copies_profile_folders_and_rejects_relative_traversal() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().to_path_buf();
        let source = root.join("aulas");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("matematica.txt"), b"atividade").unwrap();
        assert!(entry(root.clone(), vec!["..".into(), "segredo".into()]).is_err());
        let copy = root.join("copia");
        copy_item(&source, &copy).unwrap();
        assert_eq!(fs::read(copy.join("matematica.txt")).unwrap(), b"atividade");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symbolic_links_in_profile_paths() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().to_path_buf();
        std::os::unix::fs::symlink(temp.path(), root.join("atalho")).unwrap();
        assert!(entry(root.clone(), vec!["atalho".into()]).is_err());
        assert!(resolve_folder(root, vec!["atalho".into()]).is_err());
    }
}
