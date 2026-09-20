use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FontFamilyInfo {
    pub family: String,
    /// True when any face in the family is flagged monospaced.
    pub monospaced: bool,
}

/// Every font family installed on the machine, sorted case-insensitively.
/// The webview can't enumerate these itself (WebKitGTK has no Local Font
/// Access API), and it resolves a `font-family` name through the same system
/// font database, so a name listed here is one it can render.
#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<FontFamilyInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        collect_families(db.faces().map(|f| {
            (
                f.families.first().map(|(name, _)| name.as_str()),
                f.monospaced,
            )
        }))
    })
    .await
    .map_err(|e| e.to_string())
}

/// Folds faces (family name, monospaced) into one entry per family. A face
/// is a weight/style of a family, so `Fira Code` appears once however many it
/// ships.
fn collect_families<'a>(
    faces: impl Iterator<Item = (Option<&'a str>, bool)>,
) -> Vec<FontFamilyInfo> {
    let mut families: BTreeMap<String, (String, bool)> = BTreeMap::new();
    for (family, monospaced) in faces {
        let Some(family) = family.filter(|f| !f.trim().is_empty()) else {
            continue;
        };
        let entry = families
            .entry(family.to_lowercase())
            .or_insert_with(|| (family.to_string(), false));
        entry.1 |= monospaced;
    }
    families
        .into_values()
        .map(|(family, monospaced)| FontFamilyInfo { family, monospaced })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedupes_faces_into_sorted_families() {
        let faces = vec![
            (Some("Zed Sans"), false),
            (Some("fira code"), true),
            (Some("Fira Code"), true),
            (Some("Arial"), false),
            (None, false),
            (Some("  "), false),
        ];
        let got = collect_families(faces.into_iter());
        let names: Vec<_> = got.iter().map(|f| f.family.as_str()).collect();
        assert_eq!(names, ["Arial", "fira code", "Zed Sans"]);
        assert!(got[1].monospaced);
    }

    #[test]
    fn a_family_is_monospaced_if_any_face_is() {
        let faces = vec![(Some("Mixed"), false), (Some("Mixed"), true)];
        assert!(collect_families(faces.into_iter())[0].monospaced);
    }
}
