//! Settings > Preferences, owned here rather than in the webview's
//! localStorage. Persisted as one JSON file (`paths::versioned_file`), loaded
//! into `AppState.preferences` before the webview can call anything (see
//! `lib.rs`), and changed only through `set_preferences`, which merges a
//! partial patch, clamps to the supported ranges, and writes the file.

use crate::paths;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

pub const MIN_FONT_SIZE: f64 = 8.0;
pub const MAX_FONT_SIZE: f64 = 32.0;
pub const MIN_COMPOSER_ROWS: u32 = 3;
pub const MAX_COMPOSER_ROWS: u32 = 12;

/// Every field has a serde default, so a file written by an older build
/// (fewer fields) still loads, and later fields can be added without a
/// migration.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    /// Enter inserts a newline in the chat box and Ctrl+Enter sends.
    pub compose_mode: bool,
    /// Most lines the chat box grows to before it scrolls.
    pub composer_max_rows: u32,
    /// CLI launcher the title bar's "Open in IDE" button runs.
    pub ide_command: String,
    /// Gates ACP event capture and the floating devtools icon.
    pub debug_mode_enabled: bool,
    /// Shows project/conversation/session ids in the title bar.
    pub debug_show_ids: bool,
    /// CSS `font-family` lists put ahead of the built-in stacks ("" = only
    /// the built-in stack). Sizes are px.
    pub ui_font_family: String,
    pub ui_font_size: f64,
    pub code_font_family: String,
    pub code_font_size: f64,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            compose_mode: false,
            composer_max_rows: 6,
            ide_command: "code".to_string(),
            debug_mode_enabled: false,
            debug_show_ids: false,
            ui_font_family: String::new(),
            ui_font_size: 16.0,
            code_font_family: String::new(),
            code_font_size: 12.0,
        }
    }
}

impl Preferences {
    /// Clamps every bounded field into range; a non-finite size falls back
    /// to its default rather than propagating NaN into CSS.
    fn sanitized(mut self) -> Self {
        let defaults = Self::default();
        let size = |value: f64, fallback: f64| {
            if value.is_finite() {
                value.clamp(MIN_FONT_SIZE, MAX_FONT_SIZE)
            } else {
                fallback
            }
        };
        self.ui_font_size = size(self.ui_font_size, defaults.ui_font_size);
        self.code_font_size = size(self.code_font_size, defaults.code_font_size);
        self.composer_max_rows = self
            .composer_max_rows
            .clamp(MIN_COMPOSER_ROWS, MAX_COMPOSER_ROWS);
        self
    }

    /// Merges the keys present in `patch` (an object of camelCase fields)
    /// over `self`. Unknown keys are ignored; a value of the wrong type
    /// rejects the whole patch so a bad write can't half-apply.
    fn merged(&self, patch: serde_json::Value) -> Result<Self, String> {
        let serde_json::Value::Object(patch) = patch else {
            return Err("preferences patch must be an object".to_string());
        };
        let mut current = serde_json::to_value(self).map_err(|e| e.to_string())?;
        if let serde_json::Value::Object(map) = &mut current {
            map.extend(patch);
        }
        let merged: Self = serde_json::from_value(current).map_err(|e| e.to_string())?;
        Ok(merged.sanitized())
    }
}

fn preferences_path() -> PathBuf {
    paths::versioned_file("preferences", "json")
}

/// `Default` on any read/parse failure (no file yet on a first launch, a
/// corrupt file) — same idiom as `actions::load_actions`.
pub fn load_preferences_from_disk() -> Preferences {
    std::fs::read_to_string(preferences_path())
        .ok()
        .and_then(|s| serde_json::from_str::<Preferences>(&s).ok())
        .map(Preferences::sanitized)
        .unwrap_or_default()
}

fn save_preferences_to_disk(preferences: &Preferences) -> Result<(), String> {
    let json = serde_json::to_string_pretty(preferences).map_err(|e| e.to_string())?;
    std::fs::write(preferences_path(), json).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesSnapshot {
    pub preferences: Preferences,
    /// Whether a preferences file exists yet. False on a first launch of
    /// this build, which is when the frontend copies over any values it
    /// still has in localStorage from before preferences moved here.
    pub persisted: bool,
}

#[tauri::command]
pub fn get_preferences(state: State<'_, AppState>) -> PreferencesSnapshot {
    PreferencesSnapshot {
        preferences: state.preferences.lock().unwrap().clone(),
        persisted: preferences_path().exists(),
    }
}

/// Applies a partial update and returns the full, clamped result so the
/// caller's cache can't drift from what was actually stored.
#[tauri::command]
pub fn set_preferences(
    state: State<'_, AppState>,
    patch: serde_json::Value,
) -> Result<Preferences, String> {
    let mut current = state.preferences.lock().unwrap();
    let next = current.merged(patch)?;
    save_preferences_to_disk(&next)?;
    *current = next.clone();
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_patch_only_changes_the_keys_it_names() {
        let next = Preferences::default()
            .merged(json!({ "composeMode": true, "ideCommand": "zed" }))
            .unwrap();
        assert!(next.compose_mode);
        assert_eq!(next.ide_command, "zed");
        assert_eq!(
            next.composer_max_rows,
            Preferences::default().composer_max_rows
        );
    }

    #[test]
    fn out_of_range_values_are_clamped() {
        let next = Preferences::default()
            .merged(json!({ "uiFontSize": 500, "codeFontSize": 1, "composerMaxRows": 99 }))
            .unwrap();
        assert_eq!(next.ui_font_size, MAX_FONT_SIZE);
        assert_eq!(next.code_font_size, MIN_FONT_SIZE);
        assert_eq!(next.composer_max_rows, MAX_COMPOSER_ROWS);
    }

    #[test]
    fn a_wrongly_typed_value_rejects_the_whole_patch() {
        let current = Preferences::default();
        assert!(current
            .merged(json!({ "composeMode": "yes", "ideCommand": "zed" }))
            .is_err());
        assert!(current.merged(json!("nope")).is_err());
    }

    #[test]
    fn unknown_keys_are_ignored_and_missing_fields_default() {
        let next = Preferences::default()
            .merged(json!({ "somethingNew": 1 }))
            .unwrap();
        assert_eq!(next, Preferences::default());
        let old_file: Preferences = serde_json::from_str(r#"{"composeMode":true}"#).unwrap();
        assert!(old_file.compose_mode);
        assert_eq!(old_file.ide_command, "code");
    }
}
