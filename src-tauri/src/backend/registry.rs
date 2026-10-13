//! Every configured backend — Ollama connections, OpenAI-compatible APIs and
//! ACP agents — and which one a new conversation starts on. Owned here and
//! persisted to `backends.json` (`paths::versioned_file`); the frontend reads
//! it with `get_backends`, changes it only through the commands below, and
//! hears about every change on `backends://changed` (payload: the whole
//! registry). Commands that talk to a model take a backend id and resolve it
//! here, so connection details never cross the IPC boundary per call.

use super::{Backend, NativeBackend};
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
        #[serde(default)]
        api_key: String,
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
    /// The provider connection, for a native backend.
    fn provider(&self) -> Option<ProviderConfig> {
        match &self.kind {
            BackendKind::Ollama { host, .. } => Some(ProviderConfig::Ollama { host: host.clone() }),
            BackendKind::OpenAiCompatible {
                base_url, api_key, ..
            } => Some(ProviderConfig::OpenAiCompatible {
                base_url: base_url.clone(),
                api_key: api_key.clone(),
            }),
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

    /// What an ACP conversation's sub-agents run on when `spawn_sub_agent`
    /// names no agent: the default backend if it's native, else the first
    /// enabled native one, with the model last used on it.
    pub fn default_native(&self) -> NativeBackend {
        let native = |b: &&BackendConfig| b.enabled && b.provider().is_some();
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
) -> Result<Registry, String> {
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
    let _ = app.emit("backends://changed", &next);
    crate::acp::sync_catalog_with_registry(app);
    Ok(next)
}

/// Looks `id` up and builds the `Backend` that answers with it. `model` and
/// `effort` are the conversation's own choice; an ACP agent picks its model
/// over the live connection instead (`set_session_model`).
pub fn resolve(
    state: &AppState,
    id: &str,
    model: &str,
    effort: Option<&str>,
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
            model_value: None,
            effort_value: None,
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
        .is_none_or(|b| b.provider().is_none() || b.remembered_model() == model);
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
    pub registry: Registry,
    /// Whether `backends.json` exists yet. False on the first launch of this
    /// build, which is when the frontend imports the settings it still has
    /// in localStorage (`import_backends`).
    pub persisted: bool,
}

#[tauri::command]
pub fn get_backends(state: State<'_, AppState>) -> BackendsSnapshot {
    BackendsSnapshot {
        registry: state.backends.lock().unwrap().clone(),
        persisted: registry_path().exists(),
    }
}

/// One-shot: replaces the registry with what the frontend had in
/// localStorage. Refused once `backends.json` exists, so a stale window
/// can't overwrite later edits.
#[tauri::command]
pub fn import_backends(app: AppHandle, registry: Registry) -> Result<Registry, String> {
    if registry_path().exists() {
        return Err("backends were already imported".into());
    }
    update(&app, |r| {
        *r = registry;
        Ok(())
    })
}

/// Adds `config`, or replaces the backend with the same id.
#[tauri::command]
pub fn save_backend(app: AppHandle, config: BackendConfig) -> Result<Registry, String> {
    update(&app, |r| {
        match r.backends.iter_mut().find(|b| b.id == config.id) {
            Some(existing) => *existing = config,
            None => r.backends.push(config),
        }
        Ok(())
    })
}

#[tauri::command]
pub fn delete_backend(app: AppHandle, id: String) -> Result<Registry, String> {
    update(&app, |r| {
        r.backends.retain(|b| b.id != id);
        Ok(())
    })
}

#[tauri::command]
pub fn set_default_backend(app: AppHandle, id: String) -> Result<Registry, String> {
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
    fn default_native_skips_an_acp_default() {
        let registry = Registry {
            backends: vec![acp("a"), ollama("o", true, "qwen")],
            default_backend_id: "a".into(),
        };
        let native = registry.default_native();
        assert_eq!(native.model, "qwen");
    }
}
