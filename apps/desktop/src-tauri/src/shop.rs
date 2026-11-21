use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use eduos_package::{
    generate_signing_key, key_id, sign_package, Manifest, SigningKey, VerifyingKey,
};
use eduos_store::{export_key, import_key, Consent, InstalledApp, PreparedPackage, Store};
use serde::Serialize;
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, FilePath};
use zeroize::Zeroizing;

const MAX_PACKAGE: usize = 64 * 1024 * 1024;
const MAX_RESOURCE: usize = 16 * 1024 * 1024;
const MAX_SOURCE_ENTRIES: usize = 2048;

#[derive(Default)]
pub struct Shop(Mutex<Option<Session>>);

struct Session {
    token: String,
    signer: SigningKey,
    source: Option<Source>,
    candidate: Option<PreparedPackage>,
}

struct Source {
    manifest: Manifest,
    resources: BTreeMap<String, Vec<u8>>,
}

#[derive(Serialize)]
pub struct Unlocked {
    token: String,
    fingerprint: String,
}

#[derive(Serialize)]
pub struct Candidate {
    manifest: Manifest,
    fingerprint: String,
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::new(), |mut text, byte| {
        let _ = write!(text, "{byte:02x}");
        text
    })
}

fn error(value: impl std::fmt::Display) -> String {
    value.to_string()
}

fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("O Estúdio e a Lojinha só podem ser usados na janela principal.".into())
    }
}

pub(crate) fn directory(window: &WebviewWindow) -> Result<PathBuf, String> {
    main_window(window)?;
    let root = window
        .path()
        .app_local_data_dir()
        .map_err(error)?
        .join("lojinha");
    fs::create_dir_all(&root).map_err(|_| "Não foi possível criar a pasta local da Lojinha.")?;
    Ok(root)
}

fn access<'a>(shop: &'a Shop, token: &str) -> Result<MutexGuard<'a, Option<Session>>, String> {
    let state = shop
        .0
        .lock()
        .map_err(|_| "A sessão da Lojinha está indisponível.")?;
    if !state.as_ref().is_some_and(|item| item.token == token) {
        return Err("Desbloqueie o Estúdio e a Lojinha para continuar.".into());
    }
    Ok(state)
}

pub(crate) fn local_path(path: FilePath) -> Result<PathBuf, String> {
    path.into_path()
        .map_err(|_| "Escolha um arquivo no sistema de arquivos local.".into())
}

pub(crate) fn read_limited(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let kind = fs::symlink_metadata(path).map_err(|_| "Não foi possível abrir o arquivo local.")?;
    if !kind.is_file() {
        return Err("O recurso precisa ser um arquivo local comum.".into());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| "Não foi possível abrir o arquivo local.")?
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Não foi possível ler o arquivo local.")?;
    if bytes.len() > limit {
        return Err("O arquivo excede o limite aceito pelo EduOS.".into());
    }
    Ok(bytes)
}

pub(crate) fn save_file(path: &Path, bytes: &[u8], replace: bool) -> Result<(), String> {
    let write_error = "Não foi possível gravar o arquivo selecionado.";
    let parent = path.parent().ok_or(write_error)?;
    let mut staging = tempfile::NamedTempFile::new_in(parent).map_err(|_| write_error)?;
    staging.write_all(bytes).map_err(|_| write_error)?;
    staging.as_file().sync_all().map_err(|_| write_error)?;
    if replace {
        staging.persist(path).map_err(|_| write_error)?;
    } else {
        staging.persist_noclobber(path).map_err(|_| write_error)?;
    }
    Ok(())
}

fn collect_source(root: &Path) -> Result<Source, String> {
    let manifest = Manifest::from_json(&read_limited(&root.join("manifest.json"), 32 * 1024)?)
        .map_err(error)?;
    let mut pending = vec![root.to_path_buf()];
    let mut resources = BTreeMap::new();
    let mut total = 0usize;
    let mut entries = 0;
    while let Some(folder) = pending.pop() {
        for item in
            fs::read_dir(&folder).map_err(|_| "Não foi possível abrir a pasta do aplicativo.")?
        {
            entries += 1;
            if entries > MAX_SOURCE_ENTRIES {
                return Err("A pasta do aplicativo contém arquivos demais.".into());
            }
            let item = item.map_err(|_| "Não foi possível ler um recurso da pasta.")?;
            let path = item.path();
            let relative = path
                .strip_prefix(root)
                .map_err(error)?
                .components()
                .map(|part| {
                    part.as_os_str()
                        .to_str()
                        .ok_or("O caminho de um recurso não é portátil.")
                })
                .collect::<Result<Vec<_>, _>>()?
                .join("/");
            if relative == "manifest.json" {
                continue;
            }
            if relative.len() > 240 {
                return Err("O caminho de um recurso excede o limite portátil.".into());
            }
            let kind = item
                .file_type()
                .map_err(|_| "Não foi possível identificar um recurso da pasta.")?;
            if kind.is_dir() {
                pending.push(path);
            } else if kind.is_file() {
                let bytes = read_limited(&path, MAX_RESOURCE.min(MAX_PACKAGE - total))?;
                total += bytes.len();
                resources.insert(relative, bytes);
            } else {
                return Err("A pasta do aplicativo contém um link ou arquivo especial.".into());
            }
        }
    }
    Ok(Source {
        manifest,
        resources,
    })
}

#[tauri::command]
pub async fn shop_has_key(window: WebviewWindow) -> Result<bool, String> {
    Ok(directory(&window)?.join("estudio.eduoskey").exists())
}

#[tauri::command]
pub async fn shop_unlock(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    password: String,
    create: bool,
) -> Result<Unlocked, String> {
    let password = Zeroizing::new(password);
    let root = directory(&window)?;
    let path = root.join("estudio.eduoskey");
    let mut session = shop
        .0
        .lock()
        .map_err(|_| "A sessão da Lojinha está indisponível.")?;
    let signer = if create {
        if path.exists() {
            return Err("O Estúdio já possui uma chave. Desbloqueie com a senha existente.".into());
        }
        let signer = generate_signing_key();
        save_file(
            &path,
            &export_key(&signer, &password).map_err(error)?,
            false,
        )?;
        signer
    } else {
        import_key(&read_limited(&path, 128)?, &password).map_err(error)?
    };
    let token = hex(&generate_signing_key().to_bytes());
    let fingerprint = hex(&key_id(&signer.verifying_key()));
    *session = Some(Session {
        token: token.clone(),
        signer,
        source: None,
        candidate: None,
    });
    Ok(Unlocked { token, fingerprint })
}

#[tauri::command]
pub async fn shop_lock(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<(), String> {
    main_window(&window)?;
    *access(&shop, &token)? = None;
    Ok(())
}

#[tauri::command]
pub async fn studio_select(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<Option<Manifest>, String> {
    main_window(&window)?;
    access(&shop, &token)?.as_mut().unwrap().source = None;
    let Some(folder) = window
        .dialog()
        .file()
        .set_title("Selecione a pasta do aplicativo")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let source = collect_source(&local_path(folder)?)?;
    let manifest = source.manifest.clone();
    // The same validation used by signing checks local paths, references and size before review.
    eduos_package::validate_resources(&source.manifest, &source.resources).map_err(error)?;
    access(&shop, &token)?.as_mut().unwrap().source = Some(source);
    Ok(Some(manifest))
}

#[tauri::command]
pub async fn studio_sign(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<bool, String> {
    main_window(&window)?;
    let (name, bytes) = {
        let state = access(&shop, &token)?;
        let session = state.as_ref().unwrap();
        let source = session
            .source
            .as_ref()
            .ok_or("Importe primeiro a pasta do aplicativo.")?;
        (
            format!("{}-{}.eduos", source.manifest.id, source.manifest.version),
            sign_package(&source.manifest, &source.resources, &session.signer).map_err(error)?,
        )
    };
    let Some(target) = window
        .dialog()
        .file()
        .add_filter("Pacote EduOS", &["eduos"])
        .set_file_name(name)
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let _state = access(&shop, &token)?;
    save_file(&local_path(target)?, &bytes, true)?;
    Ok(true)
}

#[tauri::command]
pub async fn studio_export(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
    password: String,
) -> Result<bool, String> {
    main_window(&window)?;
    let password = Zeroizing::new(password);
    let bytes = {
        let state = access(&shop, &token)?;
        export_key(&state.as_ref().unwrap().signer, &password).map_err(error)?
    };
    let Some(target) = window
        .dialog()
        .file()
        .add_filter("Chave protegida do EduOS", &["eduoskey"])
        .set_file_name("estudio.eduoskey")
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let _state = access(&shop, &token)?;
    save_file(&local_path(target)?, &bytes, true)?;
    Ok(true)
}

#[tauri::command]
pub async fn shop_trust_local(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<(), String> {
    let state = access(&shop, &token)?;
    let store = Store::open(directory(&window)?.join("lojinha.sqlite3")).map_err(error)?;
    store
        .trust_key(state.as_ref().unwrap().signer.verifying_key())
        .map_err(error)?;
    Ok(())
}

#[tauri::command]
pub async fn shop_trust_file(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<Option<String>, String> {
    main_window(&window)?;
    drop(access(&shop, &token)?);
    let Some(file) = window
        .dialog()
        .file()
        .add_filter("Chave pública EduOS", &["eduospub"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let public: [u8; 32] = read_limited(&local_path(file)?, 32)?
        .try_into()
        .map_err(|_| "A chave pública deve ter 32 bytes.")?;
    let key = VerifyingKey::from_bytes(&public).map_err(|_| "A chave pública é inválida.")?;
    let _state = access(&shop, &token)?;
    let store = Store::open(directory(&window)?.join("lojinha.sqlite3")).map_err(error)?;
    Ok(Some(hex(&store.trust_key(key).map_err(error)?)))
}

#[tauri::command]
pub async fn studio_public(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<bool, String> {
    main_window(&window)?;
    let public = {
        let state = access(&shop, &token)?;
        state.as_ref().unwrap().signer.verifying_key()
    };
    let Some(target) = window
        .dialog()
        .file()
        .add_filter("Chave pública EduOS", &["eduospub"])
        .set_file_name("estudio.eduospub")
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let _state = access(&shop, &token)?;
    save_file(&local_path(target)?, public.as_bytes(), true)?;
    Ok(true)
}

#[tauri::command]
pub async fn shop_select(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<Option<Candidate>, String> {
    main_window(&window)?;
    access(&shop, &token)?.as_mut().unwrap().candidate = None;
    let Some(file) = window
        .dialog()
        .file()
        .add_filter("Pacote EduOS", &["eduos"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let bytes = read_limited(&local_path(file)?, MAX_PACKAGE)?;
    let mut state = access(&shop, &token)?;
    let store = Store::open(directory(&window)?.join("lojinha.sqlite3")).map_err(error)?;
    let candidate = store.prepare(bytes).map_err(error)?;
    let review = Candidate {
        manifest: candidate.manifest().clone(),
        fingerprint: hex(&candidate.signer()),
    };
    state.as_mut().unwrap().candidate = Some(candidate);
    Ok(Some(review))
}

#[tauri::command]
pub async fn shop_install(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
    consent: Consent,
) -> Result<InstalledApp, String> {
    let mut state = access(&shop, &token)?;
    let mut store = Store::open(directory(&window)?.join("lojinha.sqlite3")).map_err(error)?;
    let candidate = state
        .as_mut()
        .unwrap()
        .candidate
        .take()
        .ok_or("Selecione um pacote para revisar.")?;
    store.install(candidate, consent).map_err(error)
}

#[tauri::command]
pub async fn shop_list(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<Vec<InstalledApp>, String> {
    let _state = access(&shop, &token)?;
    Store::open(directory(&window)?.join("lojinha.sqlite3"))
        .and_then(|store| store.installed())
        .map_err(error)
}

#[tauri::command]
pub async fn shop_change(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
    id: String,
    revert: bool,
) -> Result<(), String> {
    let _state = access(&shop, &token)?;
    let mut store = Store::open(directory(&window)?.join("lojinha.sqlite3")).map_err(error)?;
    if revert {
        store.revert(&id).map_err(error)?;
    } else {
        store.remove(&id).map_err(error)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn shop_publish(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
    consent: Consent,
) -> Result<(), String> {
    let mut state = access(&shop, &token)?;
    let mut store = Store::open(directory(&window)?.join("lojinha.sqlite3")).map_err(error)?;
    let candidate = state
        .as_mut()
        .unwrap()
        .candidate
        .take()
        .ok_or("Selecione um pacote para publicar.")?;
    store.publish(candidate, consent).map_err(error)
}

#[tauri::command]
pub async fn shop_publications(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
) -> Result<Vec<eduos_store::CatalogEntry>, String> {
    let _state = access(&shop, &token)?;
    Store::open(directory(&window)?.join("lojinha.sqlite3"))
        .and_then(|store| store.catalog(None))
        .map_err(error)
}

#[tauri::command]
pub async fn shop_unpublish(
    window: WebviewWindow,
    shop: State<'_, Shop>,
    token: String,
    id: String,
) -> Result<(), String> {
    let _state = access(&shop, &token)?;
    Store::open(directory(&window)?.join("lojinha.sqlite3"))
        .and_then(|store| store.unpublish(&id))
        .map_err(error)
}

#[tauri::command]
pub async fn catalog_list(
    window: WebviewWindow,
    profile: eduos_package::ProfileRole,
) -> Result<Vec<eduos_store::CatalogEntry>, String> {
    let path = directory(&window)?.join("lojinha.sqlite3");
    if !path.exists() {
        return Ok(Vec::new());
    }
    Store::open(path)
        .and_then(|store| store.catalog(Some(profile)))
        .map_err(error)
}

#[tauri::command]
pub async fn catalog_install(
    window: WebviewWindow,
    id: String,
    version: String,
    profile: eduos_package::ProfileRole,
    consent: Consent,
) -> Result<(), String> {
    let mut store = Store::open(directory(&window)?.join("lojinha.sqlite3")).map_err(error)?;
    store
        .install_published(&id, &version, profile, consent)
        .map_err(error)?;
    Ok(())
}
