use std::collections::BTreeMap;

use eduos_package::{generate_signing_key, sign_package, SigningKey, WindowSize};
use tempfile::tempdir;

use super::*;

const APP: &str = "br.eduos.calculadora";
const PASSWORD: &str = "frase de teste local";

fn sample(version: &str, key: &SigningKey) -> Vec<u8> {
    sign_package(
        &Manifest {
            id: APP.into(),
            name: "Calculadora".into(),
            version: version.into(),
            entry: "app.js".into(),
            profiles: vec![ProfileRole::Teacher, ProfileRole::Student],
            permissions: vec![Permission::ClipboardWrite],
            icon: "icon.png".into(),
            category: None,
            window: WindowSize {
                width: 400,
                height: 450,
            },
        },
        &BTreeMap::from([
            ("app.js".into(), b"const total = 7 * 6;".to_vec()),
            (
                "icon.png".into(),
                include_bytes!("../../../apps/desktop/src-tauri/icons/icon.png").to_vec(),
            ),
        ]),
        key,
    )
    .unwrap()
}

fn student_consent() -> Consent {
    Consent {
        profiles: BTreeSet::from([ProfileRole::Student]),
        permissions: BTreeSet::new(),
    }
}

fn teacher_consent() -> Consent {
    Consent {
        profiles: BTreeSet::from([ProfileRole::Teacher]),
        permissions: BTreeSet::from([Permission::ClipboardWrite]),
    }
}

fn install(
    store: &mut Store,
    version: &str,
    key: &SigningKey,
    consent: Consent,
) -> Result<InstalledApp, StoreError> {
    let candidate = store.prepare(sample(version, key))?;
    store.install(candidate, consent)
}

#[test]
fn installs_updates_reopens_reverts_and_removes() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("lojinha.sqlite3");
    let key = generate_signing_key();
    let mut store = Store::open(&path).unwrap();
    store.trust_key(key.verifying_key()).unwrap();
    let first = install(&mut store, "1.0.0", &key, student_consent()).unwrap();
    assert!(!first.can_revert);
    let second = install(&mut store, "2.0.0", &key, teacher_consent()).unwrap();
    assert!(second.can_revert);
    drop(store);

    let mut store = Store::open(&path).unwrap();
    let apps = store.installed().unwrap();
    assert_eq!(apps.len(), 1);
    assert_eq!(apps[0].manifest.version, "2.0.0");
    assert!(apps[0].trusted);
    assert!(matches!(
        store.package_for_profile(APP, ProfileRole::Student),
        Err(StoreError::Unavailable)
    ));
    assert_eq!(
        store
            .package_for_profile(APP, ProfileRole::Teacher)
            .unwrap()
            .1,
        sample("2.0.0", &key)
    );

    let restored = store.revert(APP).unwrap();
    assert_eq!(restored.manifest.version, "1.0.0");
    assert_eq!(restored.consent, student_consent());
    assert!(matches!(
        store.revert(APP),
        Err(StoreError::MissingPrevious)
    ));
    assert_eq!(
        store
            .package_for_profile(APP, ProfileRole::Student)
            .unwrap()
            .1,
        sample("1.0.0", &key)
    );
    store.remove(APP).unwrap();
    assert!(store.installed().unwrap().is_empty());
}

#[test]
fn failed_update_keeps_the_active_and_previous_versions() {
    let key = generate_signing_key();
    let unknown = generate_signing_key();
    let mut store = Store::open(":memory:").unwrap();
    store.trust_key(key.verifying_key()).unwrap();
    install(&mut store, "1.0.0", &key, student_consent()).unwrap();
    install(&mut store, "2.0.0", &key, student_consent()).unwrap();

    assert!(matches!(
        store.prepare(sample("3.0.0", &unknown)),
        Err(StoreError::Package(PackageError::UntrustedKey))
    ));
    let mut tampered = sample("3.0.0", &key);
    *tampered.last_mut().unwrap() ^= 1;
    assert!(matches!(
        store.prepare(tampered),
        Err(StoreError::Package(PackageError::InvalidSignature))
    ));

    store.trust_key(unknown.verifying_key()).unwrap();
    assert!(matches!(
        install(&mut store, "3.0.0", &unknown, student_consent()),
        Err(StoreError::PublisherChanged)
    ));
    assert!(matches!(
        install(&mut store, "2.0.0+new", &key, student_consent()),
        Err(StoreError::Version)
    ));
    let mut grant = student_consent();
    grant.permissions.insert(Permission::FileWrite);
    assert!(matches!(
        install(&mut store, "3.0.0", &key, grant),
        Err(StoreError::InvalidConsent)
    ));

    assert_eq!(store.installed().unwrap()[0].manifest.version, "2.0.0");
    assert_eq!(store.revert(APP).unwrap().manifest.version, "1.0.0");
}

#[test]
fn rechecks_trust_in_confirmation_rollback_and_launch() {
    let mut store = Store::open(":memory:").unwrap();
    let key = generate_signing_key();
    let signer = store.trust_key(key.verifying_key()).unwrap();
    install(&mut store, "1.0.0", &key, student_consent()).unwrap();
    install(&mut store, "2.0.0", &key, student_consent()).unwrap();
    let pending = store.prepare(sample("3.0.0", &key)).unwrap();
    assert!(store.revoke_key(signer).unwrap());
    assert!(matches!(
        store.install(pending, student_consent()),
        Err(StoreError::Package(PackageError::UntrustedKey))
    ));
    assert!(matches!(
        store.revert(APP),
        Err(StoreError::Package(PackageError::UntrustedKey))
    ));
    assert!(matches!(
        store.package_for_profile(APP, ProfileRole::Student),
        Err(StoreError::Package(PackageError::UntrustedKey))
    ));
    let current = store.installed().unwrap().remove(0);
    assert_eq!(current.manifest.version, "2.0.0");
    assert!(!current.trusted);
    assert!(current.can_revert);
}

#[test]
fn rejects_stale_confirmation_after_another_connection_installs() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("lojinha.sqlite3");
    let key = generate_signing_key();
    let mut first = Store::open(&path).unwrap();
    let mut second = Store::open(&path).unwrap();
    first.trust_key(key.verifying_key()).unwrap();
    install(&mut first, "1.0.0", &key, student_consent()).unwrap();
    let older = first.prepare(sample("2.0.0", &key)).unwrap();
    install(&mut second, "3.0.0", &key, student_consent()).unwrap();
    assert!(matches!(
        first.install(older, student_consent()),
        Err(StoreError::Version)
    ));
    assert_eq!(first.installed().unwrap()[0].manifest.version, "3.0.0");
    assert_eq!(first.revert(APP).unwrap().manifest.version, "1.0.0");
}

#[test]
fn a_database_write_failure_does_not_reorder_versions() {
    let mut store = Store::open(":memory:").unwrap();
    let key = generate_signing_key();
    store.trust_key(key.verifying_key()).unwrap();
    install(&mut store, "1.0.0", &key, student_consent()).unwrap();
    store.0.execute_batch(
        "CREATE TRIGGER reject_update BEFORE UPDATE ON apps BEGIN SELECT RAISE(ABORT, 'failure'); END;",
    ).unwrap();
    assert!(matches!(
        install(&mut store, "2.0.0", &key, student_consent()),
        Err(StoreError::Database(_))
    ));
    let apps = store.installed().unwrap();
    assert_eq!(apps[0].manifest.version, "1.0.0");
    assert!(!apps[0].can_revert);
}

#[test]
fn restores_password_protected_key_and_rejects_wrong_password_and_tampering() {
    let original = generate_signing_key();
    assert!(matches!(
        export_key(&original, "short"),
        Err(KeyBackupError::PasswordLength)
    ));
    let bytes = export_key(&original, PASSWORD).unwrap();
    assert!(!bytes
        .windows(32)
        .any(|window| window == original.to_bytes()));
    let restored = import_key(&bytes, PASSWORD).unwrap();
    assert_eq!(restored.verifying_key(), original.verifying_key());
    assert!(matches!(
        import_key(&bytes, "outra frase local"),
        Err(KeyBackupError::UnlockFailed)
    ));
    let mut changed = bytes;
    *changed.last_mut().unwrap() ^= 1;
    assert!(matches!(
        import_key(&changed, PASSWORD),
        Err(KeyBackupError::UnlockFailed)
    ));
    assert!(matches!(
        import_key(&changed[..20], PASSWORD),
        Err(KeyBackupError::InvalidFormat)
    ));
}

#[test]
fn publishes_for_a_role_and_rechecks_the_review_before_installing() {
    let mut store = Store::open(":memory:").unwrap();
    let key = generate_signing_key();
    store.trust_key(key.verifying_key()).unwrap();
    let first = store.prepare(sample("1.0.0", &key)).unwrap();
    store.publish(first, student_consent()).unwrap();
    assert!(store.installed().unwrap().is_empty());
    assert!(store
        .catalog(Some(ProfileRole::Teacher))
        .unwrap()
        .is_empty());
    assert!(matches!(
        store.install_published(APP, "1.0.0", ProfileRole::Teacher, student_consent()),
        Err(StoreError::Unavailable)
    ));
    let viewed = store.catalog(Some(ProfileRole::Student)).unwrap().remove(0);
    assert!(viewed.installable);
    let second = store.prepare(sample("2.0.0", &key)).unwrap();
    store.publish(second, student_consent()).unwrap();
    assert!(matches!(
        store.install_published(
            APP,
            &viewed.manifest.version,
            ProfileRole::Student,
            viewed.consent
        ),
        Err(StoreError::CatalogChanged)
    ));
    store
        .install_published(APP, "2.0.0", ProfileRole::Student, student_consent())
        .unwrap();
    let view = store.catalog(Some(ProfileRole::Student)).unwrap().remove(0);
    assert_eq!(view.installed_version.as_deref(), Some("2.0.0"));
    assert!(!view.installable);
    store.unpublish(APP).unwrap();
    assert!(store
        .catalog(Some(ProfileRole::Student))
        .unwrap()
        .is_empty());
    assert_eq!(store.installed().unwrap()[0].manifest.version, "2.0.0");
}

#[test]
fn migrates_a_v1_database_without_losing_installed_apps() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("lojinha.sqlite3");
    let key = generate_signing_key();
    let mut store = Store::open(&path).unwrap();
    store.trust_key(key.verifying_key()).unwrap();
    install(&mut store, "1.0.0", &key, student_consent()).unwrap();
    store
        .0
        .execute_batch("DROP TABLE catalog; PRAGMA user_version = 1;")
        .unwrap();
    drop(store);
    let mut store = Store::open(&path).unwrap();
    assert_eq!(store.installed().unwrap()[0].manifest.version, "1.0.0");
    let package = store.prepare(sample("1.0.0", &key)).unwrap();
    store.publish(package, student_consent()).unwrap();
    assert_eq!(store.catalog(None).unwrap().len(), 1);
}
