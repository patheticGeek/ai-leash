//! API keys in the OS keychain (macOS Keychain, Windows Credential Manager,
//! the Secret Service on Linux) instead of `backends.json`. One entry per
//! backend, keyed by backend id. If the keychain can't be used, the key
//! stays in the file and the reason is reported to Settings
//! (`Registry::key_storage_error`) rather than failing the save.

use crate::paths;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

/// Keys already read or written this run, so a model call or the health
/// poll doesn't go to the keychain (a D-Bus round trip on Linux) each time.
fn cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

fn entry(backend_id: &str) -> keyring::Result<keyring::Entry> {
    keyring::Entry::new(&paths::keychain_service(), backend_id)
}

/// The stored key, `None` if there isn't one.
pub fn get(backend_id: &str) -> Result<Option<String>, String> {
    if let Some(key) = cache().lock().unwrap().get(backend_id) {
        return Ok(Some(key.clone()));
    }
    match entry(backend_id).and_then(|e| e.get_password()) {
        Ok(key) => {
            cache()
                .lock()
                .unwrap()
                .insert(backend_id.to_string(), key.clone());
            Ok(Some(key))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn set(backend_id: &str, key: &str) -> Result<(), String> {
    entry(backend_id)
        .and_then(|e| e.set_password(key))
        .map_err(|e| e.to_string())?;
    cache()
        .lock()
        .unwrap()
        .insert(backend_id.to_string(), key.to_string());
    Ok(())
}

/// Removing a key that was never stored isn't an error.
pub fn delete(backend_id: &str) -> Result<(), String> {
    cache().lock().unwrap().remove(backend_id);
    match entry(backend_id).and_then(|e| e.delete_credential()) {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
