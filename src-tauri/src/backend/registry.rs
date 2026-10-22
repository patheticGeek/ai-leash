//! Every configured backend — Ollama connections, OpenAI-compatible APIs and
//! ACP agents — and which one a new conversation starts on. Owned here and
//! persisted to `backends.json` (`paths::versioned_file`); the frontend reads
//! it with `get_backends`, changes it only through the commands below, and
//! hears about every change on `backends://changed` (payload: the whole
//! registry). Commands that talk to a model take a backend id and resolve it
//! here, so connection details never cross the IPC boundary per call. API
//! keys live in the OS keychain (`secrets`), not the file, and never go back
//! to the frontend at all (`Registry::view`).

use super::{secrets, Backend, NativeBackend};
use crate::acp::AcpBackend;
use crate::paths;
use crate::provider::ProviderConfig;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

pub const DEFAULT_OLLAMA_ID: &str = "ollama-default";

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackendConfig {
    /// Stable across label edits; conversations reference it.
    pub id: String,
    pub label: String,
    /// Switched off in Settings > Agents: kept, but hidden from the chat bar
    /// and never contacted.
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    #[serde(flatten)]
    pub kind: BackendKind,
}

fn enabled_by_default() -> bool {
    true
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackendKind {
    #[serde(rename_all = "camelCase")]
    Ollama {
        /// e.g. "localhost:11434", no scheme; empty means the default.
        host: String,
        /// The model last used on it — what a new conversation, and an ACP
        /// conversation's native sub-agents, start with.
        #[serde(default)]
        model: String,
    },
    #[serde(rename_all = "camelCase")]
    OpenAiCompatible {
        base_url: String,
        /// Only set when the key couldn't go into the keychain (the
        /// fallback). From the frontend: a new key, or empty to keep the
        /// saved one. Always empty in what's sent back to it.
        #[serde(default)]
        api_key: String,
        /// A key is saved — in the keychain, unless `api_key` holds it.
        #[serde(default)]
        api_key_saved: bool,
        /// Free text (no model listing); same role as Ollama's `model`.
        #[serde(default)]
        model: String,
    },
    #[serde(rename_all = "camelCase")]
    Acp {
        /// Also keys `acp_agent_sessions`, so it identifies the agent's own
        /// stored sessions.
        launch_command: String,
    },
}

impl BackendConfig {
    fn is_native(&self) -> bool {
        !matches!(self.kind, BackendKind::Acp { .. })
    }

    /// The provider connection, for a native backend — with its API key
    /// read from the keychain when that's where it is.
    fn provider(&self) -> Option<ProviderConfig> {
        match &self.kind {
            BackendKind::Ollama { host, .. } => Some(ProviderConfig::Ollama { host: host.clone() }),
            BackendKind::OpenAiCompatible {
                base_url,
                api_key,
                api_key_saved,
                ..
            } => {
                let api_key = if !api_key.is_empty() || !api_key_saved {
                    api_key.clone()
                } else {
                    secrets::get(&self.id).ok().flatten().unwrap_or_default()
                };
                Some(ProviderConfig::OpenAiCompatible {
                    base_url: base_url.clone(),
                    api_key,
                })
            }
            BackendKind::Acp { .. } => None,
        }
    }

    fn remembered_model(&self) -> &str {
        match &self.kind {
            BackendKind::Ollama { model, .. } | BackendKind::OpenAiCompatible { model, .. } => {
                model
            }
            BackendKind::Acp { .. } => "",
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    pub backends: Vec<BackendConfig>,
    /// Where a brand-new conversation starts. Always an enabled backend's id
    /// when one exists (see `reconciled`).
    pub default_backend_id: String,
}

impl Default for Registry {
    fn default() -> Self {
        let backend = |id: &str, label: &str, kind| BackendConfig {
            id: id.into(),
            label: label.into(),
            enabled: true,
            kind,
        };
        Registry {
            backends: vec![
                backend(
                    DEFAULT_OLLAMA_ID,
                    "Ollama",
                    BackendKind::Ollama {
                        host: "localhost:11434".into(),
                        model: String::new(),
                    },
                ),
                backend(
                    "acp-preset-claude-code",
                    "Claude Code",
                    BackendKind::Acp {
                        launch_command: "npx -y @agentclientprotocol/claude-agent-acp@latest"
                            .into(),
                    },
                ),
                backend(
                    "acp-preset-github-copilot",
                    "GitHub Copilot",
                    BackendKind::Acp {
                        launch_command: "copilot --acp".into(),
                    },
                ),
            ],
            default_backend_id: DEFAULT_OLLAMA_ID.into(),
        }
    }
}

impl Registry {
    pub fn get(&self, id: &str) -> Option<&BackendConfig> {
        self.backends.iter().find(|b| b.id == id)
    }

    /// Points `default_backend_id` at an enabled backend if it doesn't
    /// already — the first Ollama, then OpenAI-compatible, then ACP one.
    fn reconciled(mut self) -> Self {
        let usable = |id: &str| self.get(id).is_some_and(|b| b.enabled);
        if !usable(&self.default_backend_id) {
            let rank = |b: &BackendConfig| match b.kind {
                BackendKind::Ollama { .. } => 0,
                BackendKind::OpenAiCompatible { .. } => 1,
                BackendKind::Acp { .. } => 2,
            };
            if let Some(first) = self
                .backends
                .iter()
                .filter(|b| b.enabled)
                .min_by_key(|b| rank(b))
            {
                self.default_backend_id = first.id.clone();
            }
        }
        self
    }

    /// The backend a conversation starts on when nothing picks one, with the
    /// model last used on it ("" for an ACP agent: its own default).
    pub fn default_selection(&self) -> (String, String) {
        let model = self
            .get(&self.default_backend_id)
            .map(|b| b.remembered_model().to_string())
            .unwrap_or_default();
        (self.default_backend_id.clone(), model)
    }

    /// Whether `id` is one of our own providers rather than an ACP agent —
    /// only those take the native `low`/`medium`/`high` effort levels.
    pub fn is_native(&self, id: &str) -> bool {
        self.get(id).is_some_and(BackendConfig::is_native)
    }

    /// What an ACP conversation's sub-agents run on when `spawn_sub_agent`
    /// names no agent: the default backend if it's native, else the first
    /// enabled native one, with the model last used on it.
    pub fn default_native(&self) -> NativeBackend {
        let native = |b: &&BackendConfig| b.enabled && b.is_native();
        let chosen = self
            .get(&self.default_backend_id)
            .filter(native)
            .or_else(|| self.backends.iter().find(native));
        match chosen {
            Some(b) => NativeBackend {
                provider: b.provider().expect("filtered to native backends"),
                model: b.remembered_model().to_string(),
                effort: None,
            },
            None => NativeBackend {
                provider: ProviderConfig::Ollama {
                    host: String::new(),
                },
                model: String::new(),
                effort: None,
            },
        }
    }
}

impl Registry {
    /// What the frontend sees: every API key blanked (`api_key_saved` says
    /// whether one exists), plus why keys are in the file, if they are.
    pub fn view(&self, key_storage_error: Option<String>) -> RegistryView {
        // Only worth showing while a key actually sits in the file.
        let key_in_file = self.backends.iter().any(
            |b| matches!(&b.kind, BackendKind::OpenAiCompatible { api_key, .. } if !api_key.is_empty()),
        );
        let key_storage_error = key_storage_error.filter(|_| key_in_file);
        let mut registry = self.clone();
        for b in &mut registry.backends {
            if let BackendKind::OpenAiCompatible { api_key, .. } = &mut b.kind {
                api_key.clear();
            }
        }
        RegistryView {
            registry,
            key_storage_error,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryView {
    #[serde(flatten)]
    pub registry: Registry,
    /// Set when the keychain couldn't store a key, so it's in
    /// `backends.json` unencrypted instead — shown in Settings.
    pub key_storage_error: Option<String>,
}

/// Moves a key arriving from the frontend (or left in the file by an older
/// build) into the keychain. An empty incoming key keeps `previous`'s saved
/// one. If the keychain fails, the key stays in the file and the error is
/// recorded for Settings.
fn store_api_key(state: &AppState, config: &mut BackendConfig, previous: Option<&BackendConfig>) {
    let id = config.id.clone();
    let BackendKind::OpenAiCompatible {
        api_key,
        api_key_saved,
        ..
    } = &mut config.kind
    else {
        return;
    };
    if api_key.is_empty() {
        // Keep whatever was saved before (and where it was).
        if let Some(BackendConfig {
            kind:
                BackendKind::OpenAiCompatible {
                    api_key: old_key,
                    api_key_saved: old_saved,
                    ..
                },
            ..
        }) = previous
        {
            *api_key = old_key.clone();
            *api_key_saved = *old_saved;
        } else {
            *api_key_saved = false;
        }
        return;
    }
    *api_key_saved = true;
    match secrets::set(&id, api_key) {
        Ok(()) => api_key.clear(),
        Err(e) => {
            *state.key_storage_error.lock().unwrap() = Some(e);
        }
    }
}

/// Keys an earlier build wrote into `backends.json` move to the keychain —
/// run once at startup, off the main thread (the keychain may prompt).
pub fn move_file_keys_to_keychain(app: &AppHandle) {
    let has_file_keys = app
        .state::<AppState>()
        .backends
        .lock()
        .unwrap()
        .backends
        .iter()
        .any(|b| matches!(&b.kind, BackendKind::OpenAiCompatible { api_key, .. } if !api_key.is_empty()));
    if !has_file_keys {
        return;
    }
    let _ = update(app, |r| {
        let state = app.state::<AppState>();
        for b in &mut r.backends {
            store_api_key(&state, b, None);
        }
        Ok(())
    });
}

fn registry_path() -> PathBuf {
    paths::versioned_file("backends", "json")
}

/// `Default` on any read/parse failure — same idiom as the preferences file.
pub fn load_registry_from_disk() -> Registry {
    std::fs::read_to_string(registry_path())
        .ok()
        .and_then(|s| serde_json::from_str::<Registry>(&s).ok())
        .unwrap_or_default()
        .reconciled()
}

fn save_registry_to_disk(registry: &Registry) -> Result<(), String> {
    let path = registry_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(registry).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// Applies `change`, reconciles the default, persists, publishes, and brings
/// the ACP catalog in line (a new or re-pointed agent gets discovered).
fn update(
    app: &AppHandle,
    change: impl FnOnce(&mut Registry) -> Result<(), String>,
) -> Result<RegistryView, String> {
    let state = app.state::<AppState>();
    let next = {
        let mut current = state.backends.lock().unwrap();
        let mut next = current.clone();
        change(&mut next)?;
        let next = next.reconciled();
        save_registry_to_disk(&next)?;
        *current = next.clone();
        next
    };
    let view = next.view(state.key_storage_error.lock().unwrap().clone());
    let _ = app.emit("backends://changed", &view);
    crate::acp::sync_catalog_with_registry(app);
    Ok(view)
}

/// Looks `id` up and builds the `Backend` that answers with it. `model` and
/// `effort` are the conversation's own choice; an ACP agent picks its model
/// over the live connection instead (`set_session_model`).
pub fn resolve(
    state: &AppState,
    id: &str,
    model: &str,
    effort: Option<&str>,
    agent_mode: Option<&str>,
) -> Result<Arc<dyn Backend>, String> {
    let registry = state.backends.lock().unwrap();
    let config = registry.get(id).ok_or_else(|| {
        "This agent was deleted in Settings > Agents. Pick another one from the chat bar."
            .to_string()
    })?;
    if !config.enabled {
        return Err(format!(
            "{} is turned off in Settings > Agents. Turn it back on, or pick another agent from the chat bar.",
            config.label
        ));
    }
    Ok(match &config.kind {
        BackendKind::Acp { launch_command } => Arc::new(AcpBackend {
            launch_command: launch_command.clone(),
            // "" is the agent's own default — nothing to select.
            model_value: (!model.is_empty()).then(|| model.to_string()),
            effort_value: effort.map(str::to_string),
            mode_value: agent_mode.map(str::to_string),
            native: registry.default_native(),
        }),
        _ => Arc::new(NativeBackend {
            provider: config.provider().expect("native kinds have a provider"),
            model: model.to_string(),
            effort: effort.map(str::to_string),
        }),
    })
}

/// A native backend's connection, for model listing and health checks.
fn provider_for(state: &AppState, id: &str) -> Result<ProviderConfig, String> {
    state
        .backends
        .lock()
        .unwrap()
        .get(id)
        .and_then(BackendConfig::provider)
        .ok_or_else(|| format!("no native backend with id {id:?}"))
}

/// Records `model` as the one last used on native backend `id`, so a new
/// conversation (and an ACP conversation's native sub-agents) start with it.
/// Only writes when it changed.
pub fn remember_model(app: &AppHandle, id: &str, model: &str) {
    if model.is_empty() {
        return;
    }
    let unchanged = app
        .state::<AppState>()
        .backends
        .lock()
        .unwrap()
        .get(id)
        .is_none_or(|b| !b.is_native() || b.remembered_model() == model);
    if unchanged {
        return;
    }
    let _ = update(app, |r| {
        if let Some(b) = r.backends.iter_mut().find(|b| b.id == id) {
            match &mut b.kind {
                BackendKind::Ollama { model: m, .. }
                | BackendKind::OpenAiCompatible { model: m, .. } => *m = model.to_string(),
                BackendKind::Acp { .. } => {}
            }
        }
        Ok(())
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendsSnapshot {
    #[serde(flatten)]
    pub view: RegistryView,
    /// Whether `backends.json` exists yet. False on the first launch of this
    /// build, which is when the frontend imports the settings it still has
    /// in localStorage (`import_backends`).
    pub persisted: bool,
}

#[tauri::command]
pub fn get_backends(state: State<'_, AppState>) -> BackendsSnapshot {
    BackendsSnapshot {
        view: state
            .backends
            .lock()
            .unwrap()
            .view(state.key_storage_error.lock().unwrap().clone()),
        persisted: registry_path().exists(),
    }
}

/// One-shot: replaces the registry with what the frontend had in
/// localStorage. Refused once `backends.json` exists, so a stale window
/// can't overwrite later edits.
#[tauri::command]
pub fn import_backends(app: AppHandle, registry: Registry) -> Result<RegistryView, String> {
    if registry_path().exists() {
        return Err("backends were already imported".into());
    }
    update(&app, |r| {
        let state = app.state::<AppState>();
        *r = registry;
        for b in &mut r.backends {
            store_api_key(&state, b, None);
        }
        Ok(())
    })
}

/// Adds `config`, or replaces the backend with the same id.
#[tauri::command]
pub fn save_backend(app: AppHandle, mut config: BackendConfig) -> Result<RegistryView, String> {
    update(&app, |r| {
        let state = app.state::<AppState>();
        match r.backends.iter_mut().find(|b| b.id == config.id) {
            Some(existing) => {
                store_api_key(&state, &mut config, Some(existing));
                *existing = config;
            }
            None => {
                store_api_key(&state, &mut config, None);
                r.backends.push(config);
            }
        }
        Ok(())
    })
}

#[tauri::command]
pub fn delete_backend(app: AppHandle, id: String) -> Result<RegistryView, String> {
    // Best effort: a key left behind in the keychain is harmless, and a
    // failure here shouldn't keep the backend from being deleted.
    let _ = secrets::delete(&id);
    update(&app, |r| {
        r.backends.retain(|b| b.id != id);
        Ok(())
    })
}

#[tauri::command]
pub fn set_default_backend(app: AppHandle, id: String) -> Result<RegistryView, String> {
    update(&app, |r| {
        if r.get(&id).is_none() {
            return Err(format!("no backend with id {id:?}"));
        }
        r.default_backend_id = id;
        Ok(())
    })
}

/// Empty for a backend without a model list (the model id is free text
/// there — see `Capabilities::model_listing`) and for an ACP agent (its
/// models come from the ACP catalog).
#[tauri::command]
pub async fn list_backend_models(
    state: State<'_, AppState>,
    backend_id: String,
) -> Result<Vec<crate::provider::ModelSummary>, String> {
    let Ok(provider) = provider_for(&state, &backend_id) else {
        return Ok(vec![]);
    };
    let client = provider.client();
    if !client.capabilities().model_listing {
        return Ok(vec![]);
    }
    client
        .list_models()
        .await
        .map_err(|e| e.message().to_string())
}

/// Reachability for a native backend's health indicator — any HTTP response
/// counts: this checks the host, not the credentials.
#[tauri::command]
pub async fn check_backend_connection(
    state: State<'_, AppState>,
    backend_id: String,
) -> Result<bool, String> {
    let provider = provider_for(&state, &backend_id)?;
    Ok(provider.client().check_connection().await)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ollama(id: &str, enabled: bool, model: &str) -> BackendConfig {
        BackendConfig {
            id: id.into(),
            label: id.into(),
            enabled,
            kind: BackendKind::Ollama {
                host: String::new(),
                model: model.into(),
            },
        }
    }

    fn acp(id: &str) -> BackendConfig {
        BackendConfig {
            id: id.into(),
            label: id.into(),
            enabled: true,
            kind: BackendKind::Acp {
                launch_command: "agent".into(),
            },
        }
    }

    #[test]
    fn wire_shape_is_flat_and_tagged() {
        let v = serde_json::to_value(ollama("o", true, "llama")).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"id": "o", "label": "o", "enabled": true, "kind": "ollama", "host": "", "model": "llama"})
        );
        // `enabled` and `model` may be missing from an imported config.
        let parsed: BackendConfig = serde_json::from_value(
            serde_json::json!({"id": "a", "label": "A", "kind": "acp", "launchCommand": "x"}),
        )
        .unwrap();
        assert!(parsed.enabled);
    }

    #[test]
    fn a_missing_or_disabled_default_falls_back_to_the_first_enabled_native() {
        let registry = Registry {
            backends: vec![acp("a"), ollama("off", false, ""), ollama("on", true, "")],
            default_backend_id: "gone".into(),
        }
        .reconciled();
        assert_eq!(registry.default_backend_id, "on");
    }

    #[test]
    fn the_view_never_carries_an_api_key() {
        let registry = Registry {
            backends: vec![BackendConfig {
                id: "o".into(),
                label: "o".into(),
                enabled: true,
                kind: BackendKind::OpenAiCompatible {
                    base_url: "u".into(),
                    api_key: "sk-secret".into(),
                    api_key_saved: true,
                    model: String::new(),
                },
            }],
            default_backend_id: "o".into(),
        };
        let view = serde_json::to_string(&registry.view(Some("locked".into()))).unwrap();
        assert!(!view.contains("sk-secret"));
        assert!(view.contains("\"apiKeySaved\":true"));
        // The key is in the file here, so the keychain error is shown.
        assert!(view.contains("locked"));
    }

    #[test]
    fn default_native_skips_an_acp_default() {
        let registry = Registry {
            backends: vec![acp("a"), ollama("o", true, "qwen")],
            default_backend_id: "a".into(),
        };
        let native = registry.default_native();
        assert_eq!(native.model, "qwen");
    }
}
