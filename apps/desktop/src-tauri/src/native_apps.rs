use std::{collections::HashMap, process::Child, sync::Mutex};

use tauri::{State, WebviewWindow};

#[derive(Default)]
pub struct NativeApps(Mutex<HashMap<(String, String), Vec<Child>>>);

impl NativeApps {
    fn children(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<(String, String), Vec<Child>>>, String> {
        self.0.lock().map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub async fn native_app_open(
    window: WebviewWindow,
    profile: String,
    id: String,
    url: Option<String>,
    apps: State<'_, NativeApps>,
) -> Result<(), String> {
    let root = crate::shop::directory(&window)?;
    crate::builtins::profile_folder(root.clone(), &profile)?;
    let linux = cfg!(all(target_os = "linux", target_arch = "x86_64"));
    let windows = cfg!(all(target_os = "windows", target_arch = "x86_64"));
    let file = match id.as_str() {
        "mini-browser" if linux => Some("mini-navegador/mini-navegador"),
        "schedule" if linux => Some("vibelab-horario.AppImage"),
        "schedule" if windows => Some("vibelab-horario.exe"),
        "grade-management" if linux => Some("gestao-notas.AppImage"),
        "mini-browser" | "schedule" | "grade-management" => None,
        _ => return Err("Aplicativo nativo desconhecido.".into()),
    };
    if let Some(url) = &url {
        let address = tauri::Url::parse(url).map_err(|_| "Endereço inválido.")?;
        let local_preview = cfg!(debug_assertions)
            && address.scheme() == "http"
            && address.host_str() == Some("127.0.0.1");
        if id != "mini-browser"
            || (address.scheme() != "https" && !local_preview)
            || address.host_str().is_none()
            || !address.username().is_empty()
            || address.password().is_some()
        {
            return Err("Endereço da Lojinha inválido.".into());
        }
    }

    let Some(file) = file else {
        if let Some(url) = url {
            return open::that_detached(url).map_err(|error| error.to_string());
        }
        return Err("Aplicativo nativo indisponível para este sistema.".into());
    };

    let resources = if windows {
        "native-apps-windows"
    } else {
        "native-apps"
    };
    let binary = bundled_executable(&window, resources, file)?;
    let data = root
        .parent()
        .ok_or("Pasta de dados indisponível.")?
        .join(if id == "mini-browser" {
            "navegador"
        } else {
            "educacao"
        })
        .join(&profile)
        .join(&id);
    let config = data.join("config");
    let storage = data.join("dados");
    std::fs::create_dir_all(&config).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&storage).map_err(|error| error.to_string())?;
    let mut children = apps.children()?;
    let running = children.entry((profile, id)).or_default();
    running.retain_mut(|child| !matches!(child.try_wait(), Ok(Some(_))));
    if url.is_none() && !running.is_empty() {
        return Ok(());
    }
    let mut command = std::process::Command::new(&binary);
    if let Some(url) = url {
        command.arg(format!("--eduos-open={url}"));
    }
    if windows {
        command
            .arg(format!("--user-data-dir={}", config.display()))
            .env("APPDATA", &config)
            .env("LOCALAPPDATA", &storage);
    }
    let child = command
        .env_remove("APPIMAGE")
        .env_remove("APPDIR")
        .env_remove("ARGV0")
        .env_remove("OWD")
        .env_remove("ELECTRON_RUN_AS_NODE")
        .env("APPIMAGE_EXTRACT_AND_RUN", "1")
        .env("XDG_CONFIG_HOME", config)
        .env("XDG_DATA_HOME", storage)
        .current_dir(data)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|error| format!("Não foi possível iniciar o aplicativo: {error}"))?;
    running.push(child);
    Ok(())
}

fn bundled_executable(
    window: &WebviewWindow,
    resources: &str,
    file: &str,
) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let bundled = window
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join(resources)
        .join(file);
    if bundled.is_file() {
        return Ok(bundled);
    }
    #[cfg(debug_assertions)]
    {
        let staged = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(resources)
            .join(file);
        if staged.is_file() {
            return Ok(staged);
        }
    }
    Err("Aplicativo indisponível no instalador deste EduOS.".into())
}

#[tauri::command]
pub fn native_app_can_switch(
    window: WebviewWindow,
    profile: String,
    apps: State<'_, NativeApps>,
) -> Result<bool, String> {
    crate::shop::directory(&window)?;
    let mut children = apps.children()?;
    children.retain(|_, running| {
        running.retain_mut(|child| !matches!(child.try_wait(), Ok(Some(_))));
        !running.is_empty()
    });
    Ok(!children.keys().any(|(owner, _)| owner == &profile))
}
