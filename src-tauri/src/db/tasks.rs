//! `tasks` table access — the cards on a project's board (see
//! `board/mod.rs` for the commands and `epics.rs` for what they're grouped
//! by).
//!
//! A task belongs to a `projects` row and is addressed two ways: its uuid,
//! and a short per-project `number` (`#12`) taken from
//! `projects.next_task_number`, which is what people and agents actually
//! type. Numbers are never reused, even after a delete, so an old `#12` in a
//! transcript can't silently start meaning a different task.
//!
//! Order within a column is a fractional `position`: moving a card writes
//! only that card's row, picking the midpoint between its new neighbours.
//! When two neighbours get too close to split (`MIN_GAP`), the column is
//! renumbered first.

use super::projects::ensure_project_connection;
use super::{now, Db};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub(crate) const TASK_STATUSES: &[&str] = &["backlog", "todo", "in_progress", "review", "done"];
pub(crate) const TASK_PRIORITIES: &[&str] = &["urgent", "high", "medium", "low"];
pub(crate) const TASK_EFFORTS: &[&str] = &["xs", "s", "m", "l", "xl"];

/// Gap between consecutive positions after a renumber, and for a card
/// appended to the end of a column.
const POSITION_STEP: f64 = 1024.0;
/// Below this, two neighbours are renumbered before a card goes between.
const MIN_GAP: f64 = 1e-6;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub epic_id: Option<String>,
    pub number: i64,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub effort: Option<String>,
    pub position: f64,
    /// The task's chat, once it has been started.
    pub conversation_id: Option<String>,
    /// Whether the project chat is woken by this task's updates, rather
    /// than only seeing them as passive notes. Set when the project chat
    /// starts or messages the task, cleared when the user takes over by
    /// writing in the task's own chat.
    pub engaged_with_project: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

const TASK_COLUMNS: &str = "id, project_id, epic_id, number, title, description, status, \
     priority, effort, position, conversation_id, engaged_with_project, created_at, \
     updated_at, started_at, completed_at";

fn task_from_row(row: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        project_id: row.get(1)?,
        epic_id: row.get(2)?,
        number: row.get(3)?,
        title: row.get(4)?,
        description: row.get(5)?,
        status: row.get(6)?,
        priority: row.get(7)?,
        effort: row.get(8)?,
        position: row.get(9)?,
        conversation_id: row.get(10)?,
        engaged_with_project: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        started_at: row.get(14)?,
        completed_at: row.get(15)?,
    })
}

/// A field-by-field change to a task. `None` leaves a field alone; for the
/// nullable fields, `Some(None)` clears it.
#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub effort: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub epic_id: Option<Option<String>>,
}

/// Tells "field absent" (`None`, via `#[serde(default)]`) apart from
/// "field explicitly null" (`Some(None)`).
fn double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

/// What `create_task` needs; everything but the title has a default.
#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub effort: Option<String>,
    pub epic_id: Option<String>,
}

fn check(value: &str, allowed: &[&str], what: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!(
            "unknown {what} `{value}`; must be one of: {}",
            allowed.join(", ")
        ))
    }
}

fn check_epic(conn: &Connection, project_id: &str, epic_id: &str) -> Result<(), String> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM epics WHERE id = ?1 AND project_id = ?2",
            params![epic_id, project_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    found
        .map(|_| ())
        .ok_or_else(|| format!("no epic `{epic_id}` in this project"))
}

/// Where a card appended to `status` goes: after everything already there.
fn end_of_column(conn: &Connection, project_id: &str, status: &str) -> f64 {
    conn.query_row(
        "SELECT MAX(position) FROM tasks WHERE project_id = ?1 AND status = ?2",
        params![project_id, status],
        |r| r.get::<_, Option<f64>>(0),
    )
    .ok()
    .flatten()
    .map_or(POSITION_STEP, |max| max + POSITION_STEP)
}

/// Stamps the timestamps a status change implies: the first move into
/// `in_progress` starts the task, entering `done` completes it, and leaving
/// `done` un-completes it.
fn status_timestamps(conn: &Connection, task_id: &str, status: &str, ts: i64) {
    let _ = conn.execute(
        "UPDATE tasks SET
             started_at = CASE WHEN ?2 = 'in_progress' AND started_at IS NULL
                               THEN ?3 ELSE started_at END,
             completed_at = CASE WHEN ?2 = 'done' THEN coalesce(completed_at, ?3)
                                 ELSE NULL END
         WHERE id = ?1",
        params![task_id, status, ts],
    );
}

fn get_task_connection(conn: &Connection, task_id: &str) -> Option<Task> {
    conn.query_row(
        &format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?1"),
        params![task_id],
        task_from_row,
    )
    .optional()
    .ok()
    .flatten()
}

pub fn get_task(db: &Db, task_id: &str) -> Option<Task> {
    let conn = db.0.lock().unwrap();
    get_task_connection(&conn, task_id)
}

/// One board's tasks, every column, in display order. Done tasks are only
/// included if they were completed at or after `done_since` (all of them
/// when it's `None`) — a long-lived board's Done column grows without bound.
pub fn list_tasks(db: &Db, project_root: &str, done_since: Option<i64>) -> Vec<Task> {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    let Ok(mut stmt) = conn.prepare(&format!(
        "SELECT {TASK_COLUMNS} FROM tasks
         WHERE project_id = ?1
           AND (status != 'done' OR ?2 IS NULL OR coalesce(completed_at, updated_at) >= ?2)
         ORDER BY status, position"
    )) else {
        return vec![];
    };
    stmt.query_map(params![project_id, done_since], task_from_row)
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

/// How many tasks are in `project_root`'s Done column, shown on the toggle
/// that reveals it.
pub fn count_done_tasks(db: &Db, project_root: &str) -> i64 {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    conn.query_row(
        "SELECT count(*) FROM tasks WHERE project_id = ?1 AND status = 'done'",
        params![project_id],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// How many tasks one project has in each column — the sidebar's Project
/// boards rows show the in-progress and review counts.
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BoardSummary {
    pub project_root: String,
    pub backlog: i64,
    pub todo: i64,
    pub in_progress: i64,
    pub review: i64,
    pub done: i64,
}

/// A `BoardSummary` for every project that has any tasks.
pub fn board_summaries(db: &Db) -> Vec<BoardSummary> {
    let conn = db.0.lock().unwrap();
    let Ok(mut stmt) = conn.prepare(
        "SELECT p.root_path, t.status, count(*) FROM tasks t
         JOIN projects p ON p.id = t.project_id
         GROUP BY p.root_path, t.status",
    ) else {
        return vec![];
    };
    let rows: Vec<(String, String, i64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default();
    let mut summaries: Vec<BoardSummary> = Vec::new();
    for (root, status, count) in rows {
        let index = match summaries.iter().position(|s| s.project_root == root) {
            Some(index) => index,
            None => {
                summaries.push(BoardSummary {
                    project_root: root,
                    ..Default::default()
                });
                summaries.len() - 1
            }
        };
        let summary = &mut summaries[index];
        match status.as_str() {
            "backlog" => summary.backlog = count,
            "todo" => summary.todo = count,
            "in_progress" => summary.in_progress = count,
            "review" => summary.review = count,
            "done" => summary.done = count,
            _ => {}
        }
    }
    summaries
}

pub fn create_task(db: &Db, project_root: &str, new: NewTask) -> Result<Task, String> {
    let title = new.title.trim();
    if title.is_empty() {
        return Err("a task needs a title".into());
    }
    let status = new.status.as_deref().unwrap_or("todo");
    let priority = new.priority.as_deref().unwrap_or("medium");
    check(status, TASK_STATUSES, "status")?;
    check(priority, TASK_PRIORITIES, "priority")?;
    if let Some(effort) = new.effort.as_deref() {
        check(effort, TASK_EFFORTS, "effort")?;
    }

    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    if let Some(epic_id) = new.epic_id.as_deref() {
        check_epic(&conn, &project_id, epic_id)?;
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let number: i64 = tx
        .query_row(
            "UPDATE projects SET next_task_number = next_task_number + 1
             WHERE id = ?1 RETURNING next_task_number - 1",
            params![project_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let ts = now();
    let position = end_of_column(&tx, &project_id, status);
    tx.execute(
        "INSERT INTO tasks
         (id, project_id, epic_id, number, title, description, status, priority, effort,
          position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![
            id,
            project_id,
            new.epic_id,
            number,
            title,
            new.description.trim(),
            status,
            priority,
            new.effort,
            position,
            ts
        ],
    )
    .map_err(|e| e.to_string())?;
    status_timestamps(&tx, &id, status, ts);
    tx.commit().map_err(|e| e.to_string())?;
    get_task_connection(&conn, &id).ok_or_else(|| "task vanished after insert".into())
}

/// Applies `patch`. A status change appends the task to the end of its new
/// column; use `move_task` to put it somewhere specific.
pub fn update_task(db: &Db, task_id: &str, patch: TaskPatch) -> Result<Task, String> {
    let conn = db.0.lock().unwrap();
    let current = get_task_connection(&conn, task_id).ok_or("no such task")?;
    if let Some(status) = patch.status.as_deref() {
        check(status, TASK_STATUSES, "status")?;
    }
    if let Some(priority) = patch.priority.as_deref() {
        check(priority, TASK_PRIORITIES, "priority")?;
    }
    if let Some(Some(effort)) = &patch.effort {
        check(effort, TASK_EFFORTS, "effort")?;
    }
    if let Some(Some(epic_id)) = &patch.epic_id {
        check_epic(&conn, &current.project_id, epic_id)?;
    }
    let title = match patch.title.as_deref().map(str::trim) {
        Some("") => return Err("a task needs a title".into()),
        Some(title) => title.to_string(),
        None => current.title.clone(),
    };
    let status = patch.status.unwrap_or_else(|| current.status.clone());
    let position = if status == current.status {
        current.position
    } else {
        end_of_column(&conn, &current.project_id, &status)
    };
    let ts = now();
    conn.execute(
        "UPDATE tasks SET title = ?2, description = ?3, status = ?4, priority = ?5,
             effort = ?6, epic_id = ?7, position = ?8, updated_at = ?9
         WHERE id = ?1",
        params![
            task_id,
            title,
            patch
                .description
                .as_deref()
                .map_or(current.description.as_str(), str::trim),
            status,
            patch.priority.unwrap_or(current.priority),
            patch.effort.unwrap_or(current.effort),
            patch.epic_id.unwrap_or(current.epic_id),
            position,
            ts
        ],
    )
    .map_err(|e| e.to_string())?;
    if status != current.status {
        status_timestamps(&conn, task_id, &status, ts);
    }
    get_task_connection(&conn, task_id).ok_or_else(|| "no such task".into())
}

/// Every position in one column, renumbered evenly in their current order.
fn renumber_column(conn: &Connection, project_id: &str, status: &str) {
    let ids: Vec<String> = conn
        .prepare("SELECT id FROM tasks WHERE project_id = ?1 AND status = ?2 ORDER BY position")
        .and_then(|mut stmt| {
            stmt.query_map(params![project_id, status], |r| r.get(0))?
                .collect()
        })
        .unwrap_or_default();
    for (i, id) in ids.iter().enumerate() {
        let _ = conn.execute(
            "UPDATE tasks SET position = ?2 WHERE id = ?1",
            params![id, (i as f64 + 1.0) * POSITION_STEP],
        );
    }
}

/// The positions immediately before and at `before_id` in a column (`None`
/// at either end), ignoring the task being moved.
fn neighbours(
    conn: &Connection,
    project_id: &str,
    status: &str,
    task_id: &str,
    before_id: Option<&str>,
) -> Result<(Option<f64>, Option<f64>), String> {
    let column: Vec<(String, f64)> = conn
        .prepare(
            "SELECT id, position FROM tasks
             WHERE project_id = ?1 AND status = ?2 AND id != ?3 ORDER BY position",
        )
        .and_then(|mut stmt| {
            stmt.query_map(params![project_id, status, task_id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?
            .collect()
        })
        .map_err(|e| e.to_string())?;
    let index = match before_id {
        None => column.len(),
        Some(before) => column
            .iter()
            .position(|(id, _)| id == before)
            .ok_or("the task to place this before isn't in that column")?,
    };
    let prev = index.checked_sub(1).map(|i| column[i].1);
    let next = column.get(index).map(|(_, p)| *p);
    Ok((prev, next))
}

/// Moves a task into `status`, just before `before_id` in that column, or to
/// its end when `before_id` is `None`.
pub fn move_task(
    db: &Db,
    task_id: &str,
    status: &str,
    before_id: Option<&str>,
) -> Result<Task, String> {
    check(status, TASK_STATUSES, "status")?;
    let conn = db.0.lock().unwrap();
    let current = get_task_connection(&conn, task_id).ok_or("no such task")?;
    let project_id = current.project_id.as_str();
    let mut bounds = neighbours(&conn, project_id, status, task_id, before_id)?;
    if let (Some(prev), Some(next)) = bounds {
        if next - prev < MIN_GAP {
            renumber_column(&conn, project_id, status);
            bounds = neighbours(&conn, project_id, status, task_id, before_id)?;
        }
    }
    let position = match bounds {
        (Some(prev), Some(next)) => (prev + next) / 2.0,
        (Some(prev), None) => prev + POSITION_STEP,
        (None, Some(next)) => next - POSITION_STEP,
        (None, None) => POSITION_STEP,
    };
    let ts = now();
    conn.execute(
        "UPDATE tasks SET status = ?2, position = ?3, updated_at = ?4 WHERE id = ?1",
        params![task_id, status, position, ts],
    )
    .map_err(|e| e.to_string())?;
    if status != current.status {
        status_timestamps(&conn, task_id, status, ts);
    }
    get_task_connection(&conn, task_id).ok_or_else(|| "no such task".into())
}

/// Links a task to the chat it was started in.
pub fn set_task_conversation(
    db: &Db,
    task_id: &str,
    conversation_id: Option<&str>,
    engaged_with_project: bool,
) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "UPDATE tasks SET conversation_id = ?2, engaged_with_project = ?3, updated_at = ?4
         WHERE id = ?1",
        params![task_id, conversation_id, engaged_with_project, now()],
    );
}

/// Other tasks in `project_root` that are in progress with a chat — in a
/// project that isn't a git repo they all share its one checkout.
pub fn running_tasks(db: &Db, project_root: &str, except_task_id: &str) -> Vec<Task> {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    let Ok(mut stmt) = conn.prepare(&format!(
        "SELECT {TASK_COLUMNS} FROM tasks
         WHERE project_id = ?1 AND id != ?2 AND status = 'in_progress'
           AND conversation_id IS NOT NULL
         ORDER BY number"
    )) else {
        return vec![];
    };
    stmt.query_map(params![project_id, except_task_id], task_from_row)
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

pub fn delete_task(db: &Db, task_id: &str) -> Option<Task> {
    let conn = db.0.lock().unwrap();
    let task = get_task_connection(&conn, task_id)?;
    let _ = conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id]);
    Some(task)
}

/// Forgets a deleted conversation's link from its task. The task itself
/// stays on the board and can be started again.
pub(super) fn unlink_conversation(conn: &Connection, conversation_id: &str) {
    let _ = conn.execute(
        "UPDATE tasks SET conversation_id = NULL, engaged_with_project = 0
         WHERE conversation_id = ?1",
        params![conversation_id],
    );
}

/// Removes a project's whole board — its tasks and epics — when the
/// project itself is forgotten.
pub fn delete_project_board(db: &Db, project_root: &str) {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    for sql in [
        "DELETE FROM tasks WHERE project_id = ?1",
        "DELETE FROM epics WHERE project_id = ?1",
    ] {
        let _ = conn.execute(sql, params![project_id]);
    }
}

/// Whether `project_root` lets several tasks be in progress at once in its
/// main checkout — only consulted for projects that aren't git repos, where
/// tasks can't each get their own worktree.
pub fn parallel_main_checkout_tasks(db: &Db, project_root: &str) -> bool {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    conn.query_row(
        "SELECT parallel_main_checkout_tasks FROM projects WHERE id = ?1",
        params![project_id],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

pub fn set_parallel_main_checkout_tasks(db: &Db, project_root: &str, allowed: bool) {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    let _ = conn.execute(
        "UPDATE projects SET parallel_main_checkout_tasks = ?2 WHERE id = ?1",
        params![project_id, allowed],
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::ChatMessage;
    use crate::db::{create_epic, delete_conversation, delete_epic, save_message, NewEpic};

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", Uuid::new_v4()));
        Db::open(path)
    }

    fn new(title: &str) -> NewTask {
        NewTask {
            title: title.into(),
            ..Default::default()
        }
    }

    fn column(db: &Db, status: &str) -> Vec<String> {
        list_tasks(db, "/proj", None)
            .into_iter()
            .filter(|t| t.status == status)
            .map(|t| t.title)
            .collect()
    }

    #[test]
    fn numbers_count_up_per_project_and_are_never_reused() {
        let db = temp_db();
        let a = create_task(&db, "/proj", new("a")).unwrap();
        let b = create_task(&db, "/proj", new("b")).unwrap();
        let other = create_task(&db, "/other", new("x")).unwrap();
        assert_eq!((a.number, b.number, other.number), (1, 2, 1));

        delete_task(&db, &b.id);
        let c = create_task(&db, "/proj", new("c")).unwrap();
        assert_eq!(c.number, 3);
    }

    #[test]
    fn create_task_rejects_unknown_values_and_empty_titles() {
        let db = temp_db();
        assert!(create_task(&db, "/proj", new("  ")).is_err());
        let bad_status = NewTask {
            status: Some("doing".into()),
            ..new("a")
        };
        assert!(create_task(&db, "/proj", bad_status).is_err());
        let bad_effort = NewTask {
            effort: Some("huge".into()),
            ..new("a")
        };
        assert!(create_task(&db, "/proj", bad_effort).is_err());
        let bad_epic = NewTask {
            epic_id: Some("nope".into()),
            ..new("a")
        };
        assert!(create_task(&db, "/proj", bad_epic).is_err());
    }

    #[test]
    fn move_task_places_a_card_before_another_or_at_the_end() {
        let db = temp_db();
        let a = create_task(&db, "/proj", new("a")).unwrap();
        let b = create_task(&db, "/proj", new("b")).unwrap();
        let c = create_task(&db, "/proj", new("c")).unwrap();

        move_task(&db, &c.id, "todo", Some(&a.id)).unwrap();
        assert_eq!(column(&db, "todo"), ["c", "a", "b"]);

        move_task(&db, &c.id, "todo", None).unwrap();
        assert_eq!(column(&db, "todo"), ["a", "b", "c"]);

        move_task(&db, &b.id, "review", None).unwrap();
        assert_eq!(column(&db, "todo"), ["a", "c"]);
        assert_eq!(column(&db, "review"), ["b"]);

        assert!(move_task(&db, &a.id, "review", Some(&c.id)).is_err());
    }

    #[test]
    fn move_task_renumbers_a_column_once_neighbours_are_too_close() {
        let db = temp_db();
        let a = create_task(&db, "/proj", new("a")).unwrap();
        let b = create_task(&db, "/proj", new("b")).unwrap();
        let c = create_task(&db, "/proj", new("c")).unwrap();
        // Keep halving the gap between a and b by moving c, then b, in
        // between — far past where f64 midpoints would collide.
        for i in 0..80 {
            let (moving, before) = if i % 2 == 0 { (&c, &b) } else { (&b, &c) };
            move_task(&db, &moving.id, "todo", Some(&before.id)).unwrap();
        }
        let positions: Vec<f64> = list_tasks(&db, "/proj", None)
            .into_iter()
            .map(|t| t.position)
            .collect();
        assert!(positions.windows(2).all(|w| w[0] < w[1]), "{positions:?}");
        assert_eq!(column(&db, "todo")[0], a.title);
    }

    #[test]
    fn status_changes_stamp_started_and_completed() {
        let db = temp_db();
        let a = create_task(&db, "/proj", new("a")).unwrap();
        assert_eq!((a.started_at, a.completed_at), (None, None));

        let a = move_task(&db, &a.id, "in_progress", None).unwrap();
        assert!(a.started_at.is_some());
        let a = update_task(
            &db,
            &a.id,
            TaskPatch {
                status: Some("done".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(a.completed_at.is_some());
        let a = move_task(&db, &a.id, "review", None).unwrap();
        assert!(a.completed_at.is_none());
        assert!(a.started_at.is_some());
    }

    #[test]
    fn update_task_distinguishes_absent_from_null() {
        let db = temp_db();
        let epic = create_epic(
            &db,
            "/proj",
            NewEpic {
                title: "E".into(),
                ..Default::default()
            },
        )
        .unwrap();
        let a = create_task(
            &db,
            "/proj",
            NewTask {
                effort: Some("m".into()),
                epic_id: Some(epic.id.clone()),
                ..new("a")
            },
        )
        .unwrap();

        let patch: TaskPatch = serde_json::from_str(r#"{"title":"renamed"}"#).unwrap();
        let a = update_task(&db, &a.id, patch).unwrap();
        assert_eq!(a.title, "renamed");
        assert_eq!(a.effort.as_deref(), Some("m"));
        assert_eq!(a.epic_id.as_deref(), Some(epic.id.as_str()));

        let patch: TaskPatch = serde_json::from_str(r#"{"effort":null,"epicId":null}"#).unwrap();
        let a = update_task(&db, &a.id, patch).unwrap();
        assert_eq!((a.effort, a.epic_id), (None, None));
    }

    #[test]
    fn list_tasks_can_leave_out_tasks_done_before_a_cutoff() {
        let db = temp_db();
        let old = create_task(&db, "/proj", new("old")).unwrap();
        let recent = create_task(&db, "/proj", new("recent")).unwrap();
        move_task(&db, &old.id, "done", None).unwrap();
        move_task(&db, &recent.id, "done", None).unwrap();
        db.0.lock()
            .unwrap()
            .execute(
                "UPDATE tasks SET completed_at = 10 WHERE id = ?1",
                params![old.id],
            )
            .unwrap();
        create_task(&db, "/proj", new("open")).unwrap();

        let titles = |since| -> Vec<String> {
            list_tasks(&db, "/proj", since)
                .into_iter()
                .map(|t| t.title)
                .collect()
        };
        assert_eq!(titles(Some(100)), ["recent", "open"]);
        assert_eq!(titles(None).len(), 3);
        assert_eq!(count_done_tasks(&db, "/proj"), 2);
    }

    #[test]
    fn deleting_a_conversation_or_epic_leaves_its_tasks() {
        let db = temp_db();
        let epic = create_epic(
            &db,
            "/proj",
            NewEpic {
                title: "E".into(),
                ..Default::default()
            },
        )
        .unwrap();
        let a = create_task(
            &db,
            "/proj",
            NewTask {
                epic_id: Some(epic.id.clone()),
                ..new("a")
            },
        )
        .unwrap();
        save_message(
            &db,
            "chat",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "hi".into(),
                tool_calls: None,
            },
        );
        set_task_conversation(&db, &a.id, Some("chat"), true);

        delete_conversation(&db, "chat");
        delete_epic(&db, &epic.id);

        let a = get_task(&db, &a.id).unwrap();
        assert_eq!(a.conversation_id, None);
        assert!(!a.engaged_with_project);
        assert_eq!(a.epic_id, None);
    }

    #[test]
    fn delete_project_board_only_touches_that_project() {
        let db = temp_db();
        create_task(&db, "/proj", new("a")).unwrap();
        create_task(&db, "/other", new("b")).unwrap();

        delete_project_board(&db, "/proj");

        assert!(list_tasks(&db, "/proj", None).is_empty());
        assert_eq!(list_tasks(&db, "/other", None).len(), 1);
    }

    #[test]
    fn board_summaries_count_each_column_per_project() {
        let db = temp_db();
        let a = create_task(&db, "/proj", new("a")).unwrap();
        create_task(&db, "/proj", new("b")).unwrap();
        create_task(&db, "/other", new("c")).unwrap();
        move_task(&db, &a.id, "review", None).unwrap();

        let mut summaries = board_summaries(&db);
        summaries.sort_by(|x, y| x.project_root.cmp(&y.project_root));
        assert_eq!(summaries.len(), 2);
        assert_eq!(summaries[1].project_root, "/proj");
        assert_eq!((summaries[1].todo, summaries[1].review), (1, 1));
        assert_eq!(summaries[0].todo, 1);
    }

    #[test]
    fn running_tasks_lists_other_started_in_progress_tasks() {
        let db = temp_db();
        let a = create_task(&db, "/proj", new("a")).unwrap();
        let b = create_task(&db, "/proj", new("b")).unwrap();
        let c = create_task(&db, "/proj", new("c")).unwrap();
        for t in [&a, &b, &c] {
            move_task(&db, &t.id, "in_progress", None).unwrap();
        }
        set_task_conversation(&db, &a.id, Some("chat-a"), false);
        set_task_conversation(&db, &b.id, Some("chat-b"), false);

        let others: Vec<_> = running_tasks(&db, "/proj", &a.id)
            .into_iter()
            .map(|t| t.title)
            .collect();
        assert_eq!(others, ["b"]);
    }

    #[test]
    fn parallel_main_checkout_tasks_is_off_until_turned_on() {
        let db = temp_db();
        assert!(!parallel_main_checkout_tasks(&db, "/proj"));
        set_parallel_main_checkout_tasks(&db, "/proj", true);
        assert!(parallel_main_checkout_tasks(&db, "/proj"));
        assert!(!parallel_main_checkout_tasks(&db, "/other"));
    }
}
