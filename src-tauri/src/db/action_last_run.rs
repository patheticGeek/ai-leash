//! `action_last_run` table access — remembers, per checkout, which action
//! was run most recently, so the title bar's split button (see
//! `TitleBarActions.tsx`) can keep showing it across stops and app restarts.
//! `AppState.runs` can't serve that purpose: it's in-memory only, so it's
//! gone after a restart. Kept out of `.ai-leash/actions.json`
//! because that file is git-tracked and shared, while this is per-user.

use super::{now, Db};
use rusqlite::params;

pub fn set_last_run_action(db: &Db, checkout_path: &str, action_id: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO action_last_run (checkout_path, action_id, ran_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(checkout_path) DO UPDATE SET action_id = ?2, ran_at = ?3",
        params![checkout_path, action_id, now()],
    );
}

pub fn get_last_run_action(db: &Db, checkout_path: &str) -> Option<String> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT action_id FROM action_last_run WHERE checkout_path = ?1",
        params![checkout_path],
        |row| row.get(0),
    )
    .ok()
}

/// Called when an action is deleted: forgets it only if it *is* the
/// remembered one, so deleting some other action leaves the record alone.
pub fn clear_last_run_action(db: &Db, checkout_path: &str, action_id: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM action_last_run WHERE checkout_path = ?1 AND action_id = ?2",
        params![checkout_path, action_id],
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    #[test]
    fn remembers_the_latest_run_per_checkout() {
        let db = temp_db();
        assert_eq!(get_last_run_action(&db, "/proj"), None);

        set_last_run_action(&db, "/proj", "a");
        set_last_run_action(&db, "/proj", "b");
        set_last_run_action(&db, "/other", "c");

        assert_eq!(get_last_run_action(&db, "/proj").as_deref(), Some("b"));
        assert_eq!(get_last_run_action(&db, "/other").as_deref(), Some("c"));
    }

    #[test]
    fn clear_only_forgets_the_matching_action() {
        let db = temp_db();
        set_last_run_action(&db, "/proj", "a");

        clear_last_run_action(&db, "/proj", "other");
        assert_eq!(get_last_run_action(&db, "/proj").as_deref(), Some("a"));

        clear_last_run_action(&db, "/proj", "a");
        assert_eq!(get_last_run_action(&db, "/proj"), None);
    }
}
