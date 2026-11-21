use std::{collections::HashSet, sync::Mutex};

use tauri::{
    webview::{NewWindowResponse, PermissionKind, PermissionResponse},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tiny_http::{Header, Method, Response, Server, StatusCode};

const APPS: [(&str, &str, u16); 6] = [
    ("notes", "Notes", 32161),
    ("email", "Email", 32162),
    ("photo-studio", "Photo Studio", 32163),
    ("video-studio", "Video Studio", 32164),
    ("audio-studio", "Audio Studio", 32165),
    ("music-studio", "Music Studio", 32166),
];

const OFFLINE_APPS: [(&str, &str, u16, &str); 3] = [
    ("biblioteca", "Biblioteca", 32167, "<title>Biblioteca"),
    (
        "jogo-dos-pontinhos",
        "Jogo dos Pontinhos",
        32168,
        "<title>Jogo dos Pontinhos",
    ),
    (
        "quadro-de-poesia",
        "Quadro Magnético de Poesia",
        32169,
        "<title>Quadro Magnético de Poesia",
    ),
];

const PUTER_CSP: &str = "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.puter.com; style-src 'self' 'unsafe-inline' https:; worker-src 'self' blob:; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; connect-src 'self' https: wss: blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const OFFLINE_CSP: &str = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

fn asset_directory(id: &str, offline: bool) -> String {
    if offline {
        id.into()
    } else {
        format!("puter/{id}")
    }
}

#[derive(Default)]
pub struct Servers(Mutex<HashSet<u16>>);

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name, value).expect("Cabeçalho HTTP válido")
}

fn asset_path(url: &str) -> Option<&str> {
    let (path, _) = url.split_once('?').unwrap_or((url, ""));
    let path = path.strip_prefix('/')?;
    let lower = path.to_ascii_lowercase();
    if path.contains('\\')
        || path.starts_with('/')
        || path.split('/').any(|segment| matches!(segment, "." | ".."))
        || ["%2e", "%2f", "%5c", "%00"]
            .iter()
            .any(|bad| lower.contains(bad))
    {
        return None;
    }
    Some(if path.is_empty() { "index.html" } else { path })
}

fn start_server(
    app: AppHandle,
    port: u16,
    id: &'static str,
    offline: bool,
    servers: &Servers,
) -> Result<(), String> {
    let mut running = servers.0.lock().map_err(|error| error.to_string())?;
    if running.contains(&port) {
        return Ok(());
    }
    let server = Server::http(("127.0.0.1", port))
        .map_err(|error| format!("A porta local do aplicativo está indisponível: {error}"))?;
    let expected_host = format!("localhost:{port}");
    let directory = asset_directory(id, offline);
    let csp = if offline { OFFLINE_CSP } else { PUTER_CSP };
    std::thread::Builder::new()
        .name(format!("bundled-{id}"))
        .spawn(move || {
            for request in server.incoming_requests() {
                let host_matches = request.headers().iter().any(|header| {
                    header.field.equiv("Host") && header.value.as_str() == expected_host
                });
                if !host_matches || !matches!(request.method(), Method::Get | Method::Head) {
                    let _ = request.respond(Response::empty(StatusCode(403)));
                    continue;
                }
                let asset = asset_path(request.url()).and_then(|path| {
                    let key = if offline {
                        if path != "index.html" {
                            return None;
                        }
                        format!("{directory}/{path}")
                    } else if path == "codigo-fonte.tar.gz" {
                        "puter/codigo-fonte.tar.gz".to_string()
                    } else {
                        format!("{directory}/{path}")
                    };
                    let asset = app.asset_resolver().get(key)?;
                    // The Tauri resolver falls back to the main index for missing assets.
                    if asset.mime_type == "text/html" && path != "index.html" {
                        return None;
                    }
                    Some(asset)
                });
                if let Some(asset) = asset {
                    let mut response = Response::from_data(asset.bytes)
                        .with_header(header("Content-Type", &asset.mime_type))
                        .with_header(header("X-Content-Type-Options", "nosniff"))
                        .with_header(header("Content-Security-Policy", csp));
                    if asset_path(request.url()) == Some("codigo-fonte.tar.gz") {
                        response.add_header(header(
                            "Content-Disposition",
                            "attachment; filename=eduos-puter-codigo-fonte.tar.gz",
                        ));
                    }
                    let _ = request.respond(response);
                } else {
                    let _ = request.respond(Response::empty(StatusCode(404)));
                }
            }
        })
        .map_err(|error| error.to_string())?;
    running.insert(port);
    Ok(())
}

fn auth_url(url: &Url) -> bool {
    url.as_str() == "about:blank"
        || (url.scheme() == "https"
            && url.port().is_none()
            && url
                .host_str()
                .is_some_and(|host| host == "puter.com" || host.ends_with(".puter.com")))
}

#[tauri::command]
pub async fn builtin_open_bundled(
    window: WebviewWindow,
    profile: String,
    id: String,
    servers: tauri::State<'_, Servers>,
) -> Result<(), String> {
    let offline_app = OFFLINE_APPS
        .iter()
        .copied()
        .find(|(app, _, _, _)| *app == id);
    let offline = offline_app.is_some();
    let (id, title, port, marker) = offline_app
        .or_else(|| {
            APPS.iter()
                .copied()
                .find(|(app, _, _)| id.strip_prefix("puter-") == Some(*app))
                .map(|(app, title, port)| (app, title, port, "js.puter.com"))
        })
        .ok_or("Aplicativo integrado desconhecido.")?;
    let root = crate::shop::directory(&window)?;
    crate::builtins::profile_folder(root.clone(), &profile)?;
    let profile_dir = root
        .parent()
        .ok_or("Pasta de dados indisponível.")?
        .join(if offline { id } else { "puter" })
        .join(&profile)
        .join(id);
    let app = window.app_handle();
    let label = format!("bundled-{profile}-{id}");
    if let Some(existing) = app.get_webview_window(&label) {
        existing.unminimize().map_err(|error| error.to_string())?;
        return existing.set_focus().map_err(|error| error.to_string());
    }
    let asset = app
        .asset_resolver()
        .get(format!("{}/index.html", asset_directory(id, offline)));
    let marker = marker.as_bytes();
    if !asset.is_some_and(|asset| asset.bytes.windows(marker.len()).any(|part| part == marker)) {
        return Err("Build dos aplicativos integrados indisponível. Execute pnpm build:factory antes de iniciar a versão de desenvolvimento.".into());
    }
    start_server(app.clone(), port, id, offline, &servers)?;

    let url =
        Url::parse(&format!("http://localhost:{port}/")).map_err(|error| error.to_string())?;
    let origin = url.origin();
    let app_for_popup = app.clone();
    let popup_prefix = format!("{label}-auth");
    let counter = std::sync::atomic::AtomicUsize::new(0);
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(title)
        .inner_size(1150.0, 760.0)
        .min_inner_size(640.0, 460.0)
        .data_directory(profile_dir)
        .on_navigation(move |url| url.origin() == origin)
        .on_new_window(move |url, features| {
            if offline || !auth_url(&url) {
                return NewWindowResponse::Deny;
            }
            let number = counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let label = format!("{popup_prefix}-{number}");
            let blank = WebviewUrl::External("about:blank".parse().expect("URL válida"));
            match WebviewWindowBuilder::new(&app_for_popup, label, blank)
                .window_features(features)
                .title("Puter")
                .on_navigation(auth_url)
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_permission_request(|_, _| PermissionResponse::Deny)
                .build()
            {
                Ok(window) => NewWindowResponse::Create { window },
                Err(_) => NewWindowResponse::Deny,
            }
        })
        .on_permission_request(move |_, permission| match permission {
            PermissionKind::Microphone
                if matches!(id, "audio-studio" | "music-studio" | "video-studio") =>
            {
                PermissionResponse::Default
            }
            _ => PermissionResponse::Deny,
        });
    let builder = if id == "biblioteca" {
        builder.disable_drag_drop_handler()
    } else {
        builder
    };
    #[cfg(target_os = "macos")]
    let builder = builder.data_store_identifier(crate::builtins::office_store_id(&profile)?);
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn builtin_close_bundled(window: WebviewWindow, profile: String) -> Result<(), String> {
    let root = crate::shop::directory(&window)?;
    crate::builtins::profile_folder(root, &profile)?;
    let prefix = format!("bundled-{profile}-");
    for (label, app) in window.app_handle().webview_windows() {
        if label.starts_with(&prefix) {
            app.destroy().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}
