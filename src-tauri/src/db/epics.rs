//! `epics` table access — optional groups for a board's tasks (see
//! `tasks.rs`). Deleting an epic leaves its tasks on the board, ungrouped.

use super::projects::ensure_project_connection;
use super::{now, Db};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Colours a new epic cycles through when it isn't given one, so
/// neighbouring epics are told apart without anyone picking.
const EPIC_COLORS: &[&str] = &[
    "#f97316", "#a855f7", "#22c55e", "#3b82f6", "#ec4899", "#eab308", "#14b8a6", "#ef4444",
];

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Epic {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub color: String,
    pub position: f64,
    pub archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

const EPIC_COLUMNS: &str =
    "id, project_id, title, description, color, position, archived, created_at, updated_at";

fn epic_from_row(row: &Row) -> rusqlite::Result<Epic> {
    Ok(Epic {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        color: row.get(4)?,
        position: row.get(5)?,
        archived: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewEpic {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub color: Option<String>,
}

#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EpicPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub archived: Option<bool>,
}

fn get_epic_connection(conn: &Connection, epic_id: &str) -> Option<Epic> {
    conn.query_row(
        &format!("SELECT {EPIC_COLUMNS} FROM epics WHERE id = ?1"),
        params![epic_id],
        epic_from_row,
    )
    .optional()
    .ok()
    .flatten()
}

/// Every epic on `project_root`'s board, archived ones included (the board
/// still needs their colour for tasks that point at them).
pub fn list_epics(db: &Db, project_root: &str) -> Vec<Epic> {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    let Ok(mut stmt) = conn.prepare(&format!(
        "SELECT {EPIC_COLUMNS} FROM epics WHERE project_id = ?1 ORDER BY position"
    )) else {
        return vec![];
    };
    stmt.query_map(params![project_id], epic_from_row)
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

pub fn create_epic(db: &Db, project_root: &str, new: NewEpic) -> Result<Epic, String> {
    let title = new.title.trim();
    if title.is_empty() {
        return Err("an epic needs a title".into());
    }
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    let (count, max_position): (i64, Option<f64>) = conn
        .query_row(
            "SELECT count(*), MAX(position) FROM epics WHERE project_id = ?1",
            params![project_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let color = new
        .color
        .unwrap_or_else(|| EPIC_COLORS[count as usize % EPIC_COLORS.len()].to_string());
    let id = Uuid::new_v4().to_string();
    let ts = now();
    conn.execute(
        "INSERT INTO epics
         (id, project_id, title, description, color, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            id,
            project_id,
            title,
            new.description.trim(),
            color,
            max_position.unwrap_or(0.0) + 1.0,
            ts
        ],
    )
    .map_err(|e| e.to_string())?;
    get_epic_connection(&conn, &id).ok_or_else(|| "epic vanished after insert".into())
}

pub fn update_epic(db: &Db, epic_id: &str, patch: EpicPatch) -> Result<Epic, String> {
    let conn = db.0.lock().unwrap();
    let current = get_epic_connection(&conn, epic_id).ok_or("no such epic")?;
    let title = match patch.title.as_deref().map(str::trim) {
        Some("") => return Err("an epic needs a title".into()),
        Some(title) => title.to_string(),
        None => current.title,
    };
    conn.execute(
        "UPDATE epics SET title = ?2, description = ?3, color = ?4, archived = ?5,
             updated_at = ?6
         WHERE id = ?1",
        params![
            epic_id,
            title,
            patch
                .description
                .as_deref()
                .map_or(current.description.as_str(), str::trim),
            patch.color.unwrap_or(current.color),
            patch.archived.unwrap_or(current.archived),
            now()
        ],
    )
    .map_err(|e| e.to_string())?;
    get_epic_connection(&conn, epic_id).ok_or_else(|| "no such epic".into())
}

/// Deletes an epic; its tasks stay, with no epic.
pub fn delete_epic(db: &Db, epic_id: &str) -> Option<Epic> {
    let conn = db.0.lock().unwrap();
    let epic = get_epic_connection(&conn, epic_id)?;
    let _ = conn.execute(
        "UPDATE tasks SET epic_id = NULL WHERE epic_id = ?1",
        params![epic_id],
    );
    let _ = conn.execute("DELETE FROM epics WHERE id = ?1", params![epic_id]);
    Some(epic)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", Uuid::new_v4()));
        Db::open(path)
    }

    fn new(title: &str) -> NewEpic {
        NewEpic {
            title: title.into(),
            ..Default::default()
        }
    }

    #[test]
    fn new_epics_get_distinct_colours_and_keep_creation_order() {
        let db = temp_db();
        let a = create_epic(&db, "/proj", new("a")).unwrap();
        let b = create_epic(&db, "/proj", new("b")).unwrap();
        assert_ne!(a.color, b.color);
        let titles: Vec<_> = list_epics(&db, "/proj")
            .into_iter()
            .map(|e| e.title)
            .collect();
        assert_eq!(titles, ["a", "b"]);
        assert!(list_epics(&db, "/other").is_empty());
    }

    #[test]
    fn update_epic_changes_only_what_it_is_given() {
        let db = temp_db();
        let a = create_epic(&db, "/proj", new("a")).unwrap();
        let updated = update_epic(
            &db,
            &a.id,
            EpicPatch {
                archived: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(updated.archived);
        assert_eq!((updated.title, updated.color), (a.title, a.color));
        assert!(update_epic(
            &db,
            &a.id,
            EpicPatch {
                title: Some(" ".into()),
                ..Default::default()
            }
        )
        .is_err());
    }
}
