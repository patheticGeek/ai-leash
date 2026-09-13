//! Project identity and metadata.
//!
//! Project rows are deliberately lightweight for now. Files such as
//! `AGENTS.md`, memory, skills, and actions remain under the project root;
//! this table gives persisted conversations a stable owner that is separate
//! from the current filesystem path.

use super::{now, Db};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;
use uuid::Uuid;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub root_path: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_opened_at: Option<i64>,
}

fn project_name(root_path: &str) -> String {
    Path::new(root_path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(root_path)
        .to_string()
}

/// Returns the stable project id for `root_path`, creating the project row
/// when this is the first time the folder has been opened.
pub(super) fn ensure_project_connection(conn: &Connection, root_path: &str) -> String {
    if let Ok(id) = conn.query_row(
        "SELECT id FROM projects WHERE root_path = ?1",
        params![root_path],
        |row| row.get::<_, String>(0),
    ) {
        return id;
    }

    let id = Uuid::new_v4().to_string();
    let ts = now();
    conn.execute(
        "INSERT INTO projects (id, root_path, name, created_at, updated_at, last_opened_at)
         VALUES (?1, ?2, ?3, ?4, ?4, ?4)",
        params![id, root_path, project_name(root_path), ts],
    )
    .expect("failed to create project");
    id
}

pub fn ensure_project(db: &Db, root_path: &str) -> String {
    let conn = db.0.lock().unwrap();
    ensure_project_connection(&conn, root_path)
}

pub fn touch_project(db: &Db, root_path: &str) {
    let conn = db.0.lock().unwrap();
    let ts = now();
    let _ = conn.execute(
        "UPDATE projects SET updated_at = ?1, last_opened_at = ?1 WHERE root_path = ?2",
        params![ts, root_path],
    );
}

pub fn list_projects(db: &Db) -> Vec<ProjectSummary> {
    let conn = db.0.lock().unwrap();
    let Ok(mut stmt) = conn.prepare(
        "SELECT id, root_path, name, created_at, updated_at, last_opened_at
         FROM projects ORDER BY COALESCE(last_opened_at, updated_at) DESC",
    ) else {
        return vec![];
    };
    stmt.query_map([], |row| {
        Ok(ProjectSummary {
            id: row.get(0)?,
            root_path: row.get(1)?,
            name: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            last_opened_at: row.get(5)?,
        })
    })
    .map(|rows| rows.filter_map(Result::ok).collect())
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> Db {
        let path =
            std::env::temp_dir().join(format!("ai-leash-project-test-{}.db", Uuid::new_v4()));
        Db::open(path)
    }

    #[test]
    fn ensure_project_reuses_identity_for_the_same_root() {
        let db = temp_db();
        let first = ensure_project(&db, "/workspace/app");
        let second = ensure_project(&db, "/workspace/app");

        assert_eq!(first, second);
        let projects = list_projects(&db);
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].root_path, "/workspace/app");
        assert_eq!(projects[0].name, "app");
    }
}
