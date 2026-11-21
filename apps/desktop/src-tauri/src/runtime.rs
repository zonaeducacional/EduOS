use std::collections::{BTreeMap, BTreeSet};

use eduos_package::{Permission, ProfileRole};
use eduos_store::{InstalledApp, Store};
use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;
use wasmi::{Config, Engine, Linker, Module, Store as WasmStore, StoreLimitsBuilder};

use crate::shop::{directory, local_path, read_limited, save_file};

const MAX_MESSAGE: usize = 96 * 1024;
const MAX_TEXT: usize = 48 * 1024;
const MAX_MODULE: usize = 2 * 1024 * 1024;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Event {
    action: String,
    #[serde(default)]
    fields: BTreeMap<String, String>,
    #[serde(default)]
    state: serde_json::Value,
    #[serde(default)]
    text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct View {
    text: String,
    #[serde(default)]
    fields: Vec<Field>,
    #[serde(default)]
    buttons: Vec<Button>,
    #[serde(default)]
    state: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Field {
    id: String,
    label: String,
    #[serde(default)]
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Button {
    id: String,
    label: String,
    #[serde(default)]
    effect: Effect,
    #[serde(default)]
    text: String,
}

#[derive(Debug, Default, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Effect {
    #[default]
    None,
    ResourceRead,
    FileRead,
    FileWrite,
    ClipboardRead,
    ClipboardWrite,
    Notifications,
}

impl Effect {
    fn permission(self) -> Option<Permission> {
        match self {
            Self::None | Self::ResourceRead => None,
            Self::FileRead => Some(Permission::FileRead),
            Self::FileWrite => Some(Permission::FileWrite),
            Self::ClipboardRead => Some(Permission::ClipboardRead),
            Self::ClipboardWrite => Some(Permission::ClipboardWrite),
            Self::Notifications => Some(Permission::Notifications),
        }
    }
}

#[derive(Serialize)]
pub struct Response {
    view: View,
    permissions: BTreeSet<Permission>,
    notification: Option<String>,
}

fn execute(bytes: &[u8], event: &Event) -> Result<View, &'static str> {
    if bytes.len() > MAX_MODULE || !bytes.starts_with(b"\0asm") {
        return Err(
            "O ponto de entrada precisa ser um módulo WebAssembly compatível com a SDK EduOS.",
        );
    }
    let input = serde_json::to_vec(event).map_err(|_| "Evento inválido.")?;
    if input.len() > MAX_MESSAGE {
        return Err("O evento excede o limite de dados da SDK.");
    }
    let mut config = Config::default();
    config.consume_fuel(true).allow_start_fn(false);
    let engine = Engine::new(&config);
    let module = Module::new(&engine, bytes).map_err(|_| "Módulo WebAssembly inválido.")?;
    if module.imports().next().is_some() {
        return Err("O módulo solicita acesso a funções externas. Use somente a SDK EduOS.");
    }
    let limits = StoreLimitsBuilder::new()
        .memory_size(16 * 1024 * 1024)
        .table_elements(2048)
        .instances(1)
        .memories(1)
        .tables(1)
        .build();
    let mut vm = WasmStore::new(&engine, limits);
    vm.limiter(|limits| limits);
    vm.set_fuel(8_000_000)
        .map_err(|_| "Não foi possível iniciar a SDK.")?;
    let guest = Linker::new(&engine)
        .instantiate_and_start(&mut vm, &module)
        .map_err(|_| "O módulo excede os limites de execução.")?;
    let memory = guest
        .get_memory(&vm, "memory")
        .ok_or("A SDK requer a exportação memory.")?;
    let allocate = guest
        .get_typed_func::<i32, i32>(&vm, "eduos_alloc")
        .map_err(|_| "A SDK requer eduos_alloc.")?;
    let render = guest
        .get_typed_func::<(i32, i32), i64>(&vm, "eduos_render")
        .map_err(|_| "A SDK requer eduos_render.")?;
    let pointer = allocate
        .call(&mut vm, input.len() as i32)
        .map_err(|_| "Limite de execução atingido ao preparar o evento.")?;
    memory
        .write(&mut vm, pointer as u32 as usize, &input)
        .map_err(|_| "O módulo informou um endereço inválido.")?;
    let result = render
        .call(&mut vm, (pointer, input.len() as i32))
        .map_err(|_| {
            "O aplicativo foi interrompido por um erro ou por exceder os limites de execução."
        })? as u64;
    let length = result as u32 as usize;
    if length > MAX_MESSAGE {
        return Err("A tela do aplicativo excede o limite de dados.");
    }
    let mut output = vec![0; length];
    memory
        .read(&vm, (result >> 32) as usize, &mut output)
        .map_err(|_| "A tela do aplicativo não pôde ser lida.")?;
    let view: View =
        serde_json::from_slice(&output).map_err(|_| "O aplicativo retornou uma tela inválida.")?;
    let valid_id = |id: &str| {
        !id.is_empty()
            && id.len() <= 64
            && id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    };
    if view.fields.len() > 16
        || view.buttons.len() > 16
        || view.text.len() > MAX_TEXT
        || view.fields.iter().any(|field| {
            !valid_id(&field.id) || field.label.len() > 160 || field.value.len() > 4000
        })
        || view.buttons.iter().any(|button| {
            !valid_id(&button.id) || button.label.len() > 160 || button.text.len() > MAX_TEXT
        })
        || view
            .fields
            .iter()
            .map(|field| &field.id)
            .collect::<BTreeSet<_>>()
            .len()
            != view.fields.len()
        || view
            .buttons
            .iter()
            .map(|button| &button.id)
            .collect::<BTreeSet<_>>()
            .len()
            != view.buttons.len()
    {
        return Err("O aplicativo retornou controles fora dos limites da SDK.");
    }
    Ok(view)
}

#[tauri::command]
pub async fn runtime_list(
    window: WebviewWindow,
    profile: ProfileRole,
) -> Result<Vec<InstalledApp>, String> {
    let path = directory(&window)?.join("lojinha.sqlite3");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let store = Store::open(path).map_err(|error| error.to_string())?;
    Ok(store
        .installed()
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|entry| {
            entry.trusted
                && entry.consent.profiles.contains(&profile)
                && entry.manifest.entry.ends_with(".wasm")
        })
        .collect())
}

#[tauri::command]
pub async fn runtime_event(
    window: WebviewWindow,
    profile: ProfileRole,
    id: String,
    version: String,
    mut event: Event,
    effect: Effect,
    data: String,
) -> Result<Response, String> {
    if data.len() > MAX_TEXT || event.action.len() > 64 {
        return Err("Pedido fora dos limites da SDK.".into());
    }
    let path = directory(&window)?.join("lojinha.sqlite3");
    let mut store = Store::open(path).map_err(|error| error.to_string())?;
    let resource_path = matches!(effect, Effect::ResourceRead).then_some(data.as_str());
    let package = store
        .runtime_data(&id, profile, resource_path)
        .map_err(|error| error.to_string())?;
    let metadata = package.metadata;
    if metadata.manifest.version != version {
        return Err("A versão instalada mudou. Feche e reabra o aplicativo.".into());
    }
    let permissions = metadata.consent.permissions;
    if effect
        .permission()
        .is_some_and(|required| !permissions.contains(&required))
    {
        return Err("O administrador não concedeu esta permissão.".into());
    }
    let mut notification = None;
    event.text = match effect {
        Effect::None => None,
        Effect::ResourceRead => {
            let bytes = package.resource.ok_or("O recurso solicitado não existe.")?;
            if bytes.len() > MAX_TEXT {
                return Err("O recurso excede o limite de texto da SDK.".into());
            }
            Some(String::from_utf8(bytes).map_err(|_| "O recurso precisa ser um texto UTF-8.")?)
        }
        Effect::FileRead => {
            let path = window
                .dialog()
                .file()
                .set_parent(&window)
                .add_filter("Documento de texto", &["txt", "md", "csv", "json"])
                .blocking_pick_file();
            path.map(|path| {
                let bytes = read_limited(&local_path(path)?, MAX_TEXT)?;
                String::from_utf8(bytes)
                    .map_err(|_| "Escolha um arquivo de texto UTF-8.".to_string())
            })
            .transpose()?
        }
        Effect::FileWrite => {
            if let Some(path) = window
                .dialog()
                .file()
                .set_parent(&window)
                .add_filter("Documento de texto", &["txt"])
                .set_file_name("documento.txt")
                .blocking_save_file()
            {
                save_file(&local_path(path)?, data.as_bytes(), true)?;
            }
            None
        }
        Effect::ClipboardRead => {
            let mut clipboard = arboard::Clipboard::new()
                .map_err(|_| "A área de transferência está indisponível.")?;
            let text = clipboard
                .get_text()
                .map_err(|_| "A área de transferência não contém texto disponível.")?;
            if text.len() > MAX_TEXT {
                return Err("O texto na área de transferência excede o limite.".into());
            }
            Some(text)
        }
        Effect::ClipboardWrite => {
            let mut clipboard = arboard::Clipboard::new()
                .map_err(|_| "A área de transferência está indisponível.")?;
            clipboard
                .set_text(data)
                .map_err(|_| "Não foi possível copiar o texto.")?;
            #[cfg(target_os = "linux")]
            retain_clipboard(clipboard);
            None
        }
        Effect::Notifications => {
            notification = Some(data.chars().take(240).collect());
            None
        }
    };
    let view = execute(&package.entry, &event).map_err(str::to_string)?;
    Ok(Response {
        view,
        permissions,
        notification,
    })
}

#[cfg(target_os = "linux")]
fn retain_clipboard(clipboard: arboard::Clipboard) {
    static OWNER: std::sync::Mutex<Option<arboard::Clipboard>> = std::sync::Mutex::new(None);
    if let Ok(mut current) = OWNER.lock() {
        *current = Some(clipboard);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installs_and_executes_the_signed_demo_only_for_the_granted_profile() {
        use eduos_package::{generate_signing_key, sign_package, Manifest};
        use eduos_store::Consent;

        let entry = include_bytes!("../../../../examples/calculadora/pacote/calculadora.wasm");
        let manifest = Manifest::from_json(include_bytes!(
            "../../../../examples/calculadora/pacote/manifest.json"
        ))
        .unwrap();
        let files = BTreeMap::from([
            (manifest.entry.clone(), entry.to_vec()),
            (
                manifest.icon.clone(),
                include_bytes!("../../../../examples/calculadora/pacote/icon.png").to_vec(),
            ),
            ("recurso.txt".into(), b"Texto empacotado".to_vec()),
        ]);
        let key = generate_signing_key();
        let mut store = Store::open(":memory:").unwrap();
        store.trust_key(key.verifying_key()).unwrap();
        let prepared = store
            .prepare(sign_package(&manifest, &files, &key).unwrap())
            .unwrap();
        store
            .install(
                prepared,
                Consent {
                    profiles: BTreeSet::from([ProfileRole::Student]),
                    permissions: BTreeSet::new(),
                },
            )
            .unwrap();
        assert!(store
            .runtime_data(&manifest.id, ProfileRole::Teacher, None)
            .is_err());
        assert!(store
            .runtime_data(&manifest.id, ProfileRole::Student, Some("../arquivo.txt"))
            .is_err());
        let package = store
            .runtime_data(&manifest.id, ProfileRole::Student, Some("recurso.txt"))
            .unwrap();
        assert_eq!(
            package.resource.as_deref(),
            Some(b"Texto empacotado".as_slice())
        );
        assert!(package.metadata.consent.permissions.is_empty());
        let view = execute(
            &package.entry,
            &Event {
                action: "multiplicar".into(),
                fields: BTreeMap::from([
                    ("primeiro".into(), "6".into()),
                    ("segundo".into(), "7".into()),
                ]),
                ..Event::default()
            },
        )
        .unwrap();
        assert_eq!(view.text, "Resultado: 42");
        assert_eq!(
            view.buttons.last().unwrap().effect.permission(),
            Some(Permission::ClipboardWrite)
        );
    }

    #[test]
    fn verifies_and_runs_the_distributed_demo_packages() {
        use eduos_package::{PackageError, VerifyingKey};
        use eduos_store::{Consent, StoreError};

        let first = include_bytes!(
            "../../../../examples/calculadora/demonstracao/br.eduos.calculadora-demo-1.0.0.eduos"
        );
        let newer = include_bytes!(
            "../../../../examples/calculadora/demonstracao/br.eduos.calculadora-demo-1.1.0.eduos"
        );
        let public = include_bytes!(
            "../../../../examples/calculadora/demonstracao/calculadora-demonstracao.eduospub"
        );
        let mut store = Store::open(":memory:").unwrap();
        assert!(matches!(
            store.prepare(first.to_vec()),
            Err(StoreError::Package(PackageError::UntrustedKey))
        ));
        store
            .trust_key(VerifyingKey::from_bytes(public).unwrap())
            .unwrap();
        let consent = Consent {
            profiles: BTreeSet::from([ProfileRole::Student]),
            permissions: BTreeSet::new(),
        };
        let first = store.prepare(first.to_vec()).unwrap();
        let id = first.manifest().id.clone();
        store.install(first, consent.clone()).unwrap();
        let newer = store.prepare(newer.to_vec()).unwrap();
        assert_eq!(
            store.install(newer, consent).unwrap().manifest.version,
            "1.1.0"
        );
        assert_eq!(store.revert(&id).unwrap().manifest.version, "1.0.0");
        let module = store
            .runtime_data(&id, ProfileRole::Student, None)
            .unwrap()
            .entry;
        let view = execute(
            &module,
            &Event {
                action: "multiplicar".into(),
                fields: BTreeMap::from([
                    ("primeiro".into(), "6".into()),
                    ("segundo".into(), "7".into()),
                ]),
                ..Event::default()
            },
        )
        .unwrap();
        assert_eq!(view.text, "Resultado: 42");
    }

    #[test]
    fn rejects_host_imports() {
        let binary =
            wat::parse_str(r#"(module (import "wasi_snapshot_preview1" "sock_open" (func)))"#)
                .unwrap();
        assert!(execute(&binary, &Event::default())
            .unwrap_err()
            .contains("funções externas"));
    }

    #[test]
    fn halts_an_infinite_loop() {
        let binary = wat::parse_str(
            r#"(module
            (memory (export "memory") 1)
            (func (export "eduos_alloc") (param i32) (result i32) i32.const 0)
            (func (export "eduos_render") (param i32 i32) (result i64)
              (loop $forever br $forever) i64.const 0))"#,
        )
        .unwrap();
        assert!(execute(&binary, &Event::default())
            .unwrap_err()
            .contains("interrompido"));
    }
}
