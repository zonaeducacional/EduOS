use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use eduos_package::SigningKey;
use rand_core::{OsRng, RngCore};
use thiserror::Error;
use zeroize::Zeroizing;

const MAGIC: &[u8; 8] = b"EKEY\0\x01\r\n";
const SALT: usize = 16;
const NONCE: usize = 24;
const HEADER: usize = MAGIC.len() + SALT + NONCE;
const SIZE: usize = HEADER + 32 + 16;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum KeyBackupError {
    #[error("Use uma senha de exportação com pelo menos 12 caracteres e até 256 bytes.")]
    PasswordLength,
    #[error("Arquivo de chave incompatível com o EduOS.")]
    InvalidFormat,
    #[error("Senha incorreta ou arquivo de chave alterado.")]
    UnlockFailed,
    #[error("Não foi possível proteger a chave neste dispositivo.")]
    ProtectionFailed,
}

fn cipher(password: &str, salt: &[u8]) -> Result<XChaCha20Poly1305, KeyBackupError> {
    let params =
        Params::new(64 * 1024, 3, 1, Some(32)).map_err(|_| KeyBackupError::ProtectionFailed)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key_bytes = Zeroizing::new([0; 32]);
    argon
        .hash_password_into(password.as_bytes(), salt, &mut *key_bytes)
        .map_err(|_| KeyBackupError::ProtectionFailed)?;
    XChaCha20Poly1305::new_from_slice(&*key_bytes).map_err(|_| KeyBackupError::ProtectionFailed)
}

pub fn export_key(key: &SigningKey, password: &str) -> Result<Vec<u8>, KeyBackupError> {
    if password.chars().count() < 12 || password.len() > 256 {
        return Err(KeyBackupError::PasswordLength);
    }
    let mut random = [0_u8; SALT + NONCE];
    OsRng
        .try_fill_bytes(&mut random)
        .map_err(|_| KeyBackupError::ProtectionFailed)?;
    let (salt, nonce) = random.split_at(SALT);
    let mut output = Vec::with_capacity(SIZE);
    output.extend_from_slice(MAGIC);
    output.extend_from_slice(&random);
    let secret = Zeroizing::new(key.to_bytes());
    let encrypted = cipher(password, salt)?
        .encrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: &*secret,
                aad: &output,
            },
        )
        .map_err(|_| KeyBackupError::ProtectionFailed)?;
    output.extend_from_slice(&encrypted);
    Ok(output)
}

pub fn import_key(bytes: &[u8], password: &str) -> Result<SigningKey, KeyBackupError> {
    if bytes.len() != SIZE || !bytes.starts_with(MAGIC) {
        return Err(KeyBackupError::InvalidFormat);
    }
    if password.len() > 256 {
        return Err(KeyBackupError::UnlockFailed);
    }
    let (header, encrypted) = bytes.split_at(HEADER);
    let (salt, nonce) = header[MAGIC.len()..].split_at(SALT);
    let secret = Zeroizing::new(
        cipher(password, salt)?
            .decrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: encrypted,
                    aad: header,
                },
            )
            .map_err(|_| KeyBackupError::UnlockFailed)?,
    );
    let seed: &[u8; 32] = secret
        .as_slice()
        .try_into()
        .map_err(|_| KeyBackupError::InvalidFormat)?;
    Ok(SigningKey::from_bytes(seed))
}
