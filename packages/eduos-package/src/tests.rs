use super::*;

fn fixture() -> (Manifest, BTreeMap<String, Vec<u8>>, SigningKey, TrustedKeys) {
    let manifest = Manifest {
        id: "br.eduos.calculadora".into(),
        name: "Calculadora".into(),
        version: "1.0.0".into(),
        entry: "src/main.js".into(),
        profiles: vec![ProfileRole::Teacher, ProfileRole::Student],
        permissions: vec![Permission::ClipboardWrite],
        icon: "assets/icon.png".into(),
        category: None,
        window: WindowSize {
            width: 400,
            height: 500,
        },
    };
    let resources = BTreeMap::from([
        ("src/main.js".into(), b"const result = 6 * 7;".to_vec()),
        (
            "assets/icon.png".into(),
            include_bytes!("../../../apps/desktop/src-tauri/icons/icon.png").to_vec(),
        ),
    ]);
    let key = generate_signing_key();
    let mut trusted = TrustedKeys::default();
    trusted.insert(key.verifying_key());
    (manifest, resources, key, trusted)
}

fn alter(bytes: &mut [u8], text: &[u8]) {
    let index = bytes
        .windows(text.len())
        .position(|window| window == text)
        .unwrap();
    bytes[index] ^= 1;
}

#[test]
fn verifies_signed_package_and_exposes_only_verified_resources() {
    let (manifest, resources, key, trusted) = fixture();
    let bytes = sign_package(&manifest, &resources, &key).unwrap();
    let verified = verify_package(&bytes, &trusted).unwrap();
    assert_eq!(verified.manifest(), &manifest);
    assert_eq!(verified.signer(), key_id(&key.verifying_key()));
    assert_eq!(verified.resources().count(), 2);
    assert_eq!(
        verified.resource(&manifest.entry),
        Some(resources[&manifest.entry].as_slice())
    );
    assert_eq!(verified.resource("missing"), None);
    assert_eq!(bytes, sign_package(&manifest, &resources, &key).unwrap());
}

#[test]
fn rejects_unsigned_and_untrusted_packages_distinctly() {
    let (manifest, resources, key, trusted) = fixture();
    let bytes = sign_package(&manifest, &resources, &key).unwrap();

    let mut unrelated = TrustedKeys::default();
    unrelated.insert(generate_signing_key().verifying_key());
    assert_eq!(
        verify_package(&bytes, &unrelated).unwrap_err(),
        PackageError::UntrustedKey
    );
    assert_eq!(
        verify_package(&bytes[..bytes.len() - SIGNATURE_LENGTH], &trusted).unwrap_err(),
        PackageError::MissingSignature,
    );
}

#[test]
fn detects_altered_manifest_resource_path_and_content() {
    let (manifest, resources, key, trusted) = fixture();
    let bytes = sign_package(&manifest, &resources, &key).unwrap();
    for text in [b"Calculadora".as_slice(), b"src/main.js", b"const result"] {
        let mut modified = bytes.clone();
        // The manifest includes the entry path too. Modify its table entry here.
        if text == b"src/main.js" {
            let index = modified
                .windows(text.len())
                .rposition(|window| window == text)
                .unwrap();
            modified[index] ^= 1;
        } else {
            alter(&mut modified, text);
        }
        assert_eq!(
            verify_package(&modified, &trusted).unwrap_err(),
            PackageError::InvalidSignature
        );
    }
}

#[test]
fn rejects_truncated_or_extended_signatures() {
    let (manifest, resources, key, trusted) = fixture();
    let mut bytes = sign_package(&manifest, &resources, &key).unwrap();
    let last = bytes.pop().unwrap();
    assert_eq!(
        verify_package(&bytes, &trusted).unwrap_err(),
        PackageError::InvalidSignature
    );
    bytes.extend([last, 0]);
    assert_eq!(
        verify_package(&bytes, &trusted).unwrap_err(),
        PackageError::InvalidSignature
    );
}

#[test]
fn enforces_manifest_fields_and_resource_references() {
    let (mut manifest, mut resources, key, _) = fixture();
    manifest.version = "1.4".into();
    assert_eq!(
        sign_package(&manifest, &resources, &key).unwrap_err(),
        PackageError::Manifest("versão deve seguir SemVer")
    );
    manifest.version = "1.4.0".into();
    manifest.permissions.push(Permission::ClipboardWrite);
    assert_eq!(
        sign_package(&manifest, &resources, &key).unwrap_err(),
        PackageError::Manifest("há permissões repetidas")
    );
    manifest.permissions.clear();
    resources.remove(&manifest.icon);
    assert_eq!(
        sign_package(&manifest, &resources, &key).unwrap_err(),
        PackageError::Manifest("o ícone não está no pacote")
    );
}

#[test]
fn rejects_nonportable_paths_and_file_directory_conflicts() {
    let (manifest, resources, key, _) = fixture();
    for path in [
        "../escape",
        "src/../escape",
        "/abs",
        "C:/drive",
        "src\\main.js",
        "asset/NUL.txt",
        "asset/COM1",
        "file.",
    ] {
        let mut bad = resources.clone();
        bad.insert(path.into(), Vec::new());
        assert_eq!(
            sign_package(&manifest, &bad, &key).unwrap_err(),
            PackageError::InvalidPath,
            "{path}"
        );
    }
    for path in ["src/Main.js", "SRC/extra.js", "assets", "src/main.js/data"] {
        let mut bad = resources.clone();
        bad.insert(path.into(), Vec::new());
        assert_eq!(
            sign_package(&manifest, &bad, &key).unwrap_err(),
            PackageError::PathCollision,
            "{path}"
        );
    }
}

#[test]
fn rejects_malformed_payload_lengths_before_access() {
    let (manifest, resources, key, trusted) = fixture();
    let mut bytes = sign_package(&manifest, &resources, &key).unwrap();
    let length_start = MAGIC.len() + 32;
    bytes[length_start..length_start + 4].copy_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(
        verify_package(&bytes, &trusted).unwrap_err(),
        PackageError::Limit
    );
    assert_eq!(
        verify_package(&bytes[..10], &trusted).unwrap_err(),
        PackageError::InvalidFormat
    );
}

#[test]
fn rejects_even_trusted_packages_with_invalid_manifest() {
    let (manifest, resources, key, trusted) = fixture();
    let mut bytes = sign_package(&manifest, &resources, &key).unwrap();
    bytes.truncate(bytes.len() - SIGNATURE_LENGTH);
    let field = bytes
        .windows(6)
        .position(|bytes| bytes == b"\"name\"")
        .unwrap();
    bytes[field + 1..field + 5].copy_from_slice(b"nome");
    let signature = key.sign(&bytes);
    bytes.extend_from_slice(&signature.to_bytes());
    assert_eq!(
        verify_package(&bytes, &trusted).unwrap_err(),
        PackageError::Manifest("estrutura ou tipo de campo desconhecido"),
    );
}
