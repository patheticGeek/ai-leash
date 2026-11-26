//! Usage-limit auto-resume, ACP-generic. When a `session/prompt` request
//! fails with JSON-RPC error data `{"errorKind": "rate_limit", "rateLimit":
//! {"resetsAt": <unix secs>, "rateLimitType": ...}}` (Claude Code's adapter
//! sends this), the limit is recorded per conversation in `db::rate_limit`
//! — persisted, so the banner and an armed resume survive an app restart.
//! It stays pending until a message goes out (typed, woken by the board, or
//! the auto-resume itself) or a turn completes; board notes and the saved
//! error row don't hide it. The user's answer to the banner is stored with
//! the limit, so a newer limit is asked about afresh.

use super::AcpCommand;
use crate::chat::{self, ChatMessage};
use crate::db;
use crate::state::AppState;
use chrono::{Datelike, Local, NaiveDate, NaiveTime, TimeZone};
use chrono_tz::Tz;
use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

/// What kind of conversation a resume prompt goes to, which picks its
/// wording.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ResumeKind {
    /// A board task's chat.
    TaskChat,
    SubAgent,
    /// The project chat or a normal chat.
    Chat,
}

impl ResumeKind {
    fn of(db: &db::Db, session_id: &str) -> Self {
        if db::task_for_conversation(db, session_id).is_some() {
            Self::TaskChat
        } else if db::is_sub_agent(db, session_id) {
            Self::SubAgent
        } else {
            Self::Chat
        }
    }
}

/// The message sent when a limit resets. A limit is per account, but the
/// agent's own history still says its task chats and sub-agents were
/// blocked too, so a bare "continue" let it conclude they still were and do
/// their work itself. Followed task chats and sub-agents have no timer of
/// their own (the project chat / parent deals with them), so the chat that
/// resumes is told to restart them.
fn resume_prompt(kind: ResumeKind) -> &'static str {
    match kind {
        ResumeKind::Chat => {
            "The rate limit has reset, for this chat and for every other chat on this account, \
             including task chats and sub-agents. Anything that failed or stopped because of it \
             can run again. Task chats you follow and sub-agents that stopped on the limit don't \
             resume on their own: message those task chats to carry on, and spawn sub-agents \
             again for work that didn't finish. Continue as you were, delegating as usual."
        }
        ResumeKind::TaskChat => {
            "The rate limit has reset, for this task chat and for every other chat on this \
             account, including the project chat, other task chats and sub-agents. Anything that \
             failed or stopped because of it can run again; spawn sub-agents again for work that \
             didn't finish. Continue as you were, delegating as usual."
        }
        ResumeKind::SubAgent => {
            "The rate limit has reset, for this sub-agent and for every other chat on this \
             account, including task chats and other sub-agents. Anything that failed or stopped \
             because of it can run again. Continue as you were."
        }
    }
}
/// The agent can still report the limit for a moment after the printed
/// reset minute, which would just produce another limit error.
const GRACE_MS: i64 = 10_000;
/// Timers wake at least this often to re-read the wall clock — tokio's
/// sleep runs on the monotonic clock, which doesn't advance while the
/// machine is suspended, so one long sleep would fire late after a wake-up.
const MAX_SLEEP: Duration = Duration::from_secs(30);

/// A streamed "You've hit your 5-hour limit · resets 12:40pm" notice. Not a
/// trigger (the prompt error is) — only used to keep the notice in a
/// transcript message of its own.
pub(super) fn is_limit_notice(text: &str) -> bool {
    let normalized = text.to_ascii_lowercase();
    (normalized.contains("you've hit") || normalized.contains("you have hit"))
        && normalized.contains("limit")
        && normalized.contains("reset")
}

fn reset_time_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\bresets?\s+(?:at\s+|on\s+)?(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?(?:\s*([ap])\.?m\b)?(?:\s*\(([^)]+)\))?",
        )
        .unwrap()
    })
}

/// Fallback for a limit error without `resetsAt`: the time printed after
/// "resets" — `12:40pm`, `1am`, 24-hour `13:05`, optionally after a
/// `Sep 17,` date — as epoch millis. Without a date it's the next
/// occurrence of that clock time strictly after `now_secs`; with one, the
/// next occurrence of that date and time. Read in the printed
/// "(Asia/Kolkata)" zone when it names a valid IANA zone, else the
/// machine's local one.
fn parse_reset_at_ms(text: &str, now_secs: i64) -> Option<i64> {
    let caps = reset_time_regex().captures(text)?;
    let hour: u32 = caps[3].parse().ok()?;
    let minute: Option<u32> = match caps.get(4) {
        Some(m) => Some(m.as_str().parse().ok()?),
        None => None,
    };
    let hour24 = match caps.get(5) {
        Some(ampm) => {
            if !(1..=12).contains(&hour) {
                return None;
            }
            hour % 12
                + if ampm.as_str().eq_ignore_ascii_case("p") {
                    12
                } else {
                    0
                }
        }
        // A bare "resets 5" is too ambiguous; 24-hour needs its minutes.
        None if minute.is_some() => hour,
        None => return None,
    };
    let time = NaiveTime::from_hms_opt(hour24, minute.unwrap_or(0), 0)?;
    let date = match (caps.get(1), caps.get(2)) {
        (Some(month), Some(day)) => {
            Some((month_number(month.as_str())?, day.as_str().parse().ok()?))
        }
        _ => None,
    };

    match caps
        .get(6)
        .and_then(|m| m.as_str().trim().parse::<Tz>().ok())
    {
        Some(tz) => next_occurrence(&tz, now_secs, time, date),
        None => next_occurrence(&Local, now_secs, time, date),
    }
}

fn month_number(name: &str) -> Option<u32> {
    const MONTHS: [&str; 12] = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    let prefix = name.get(..3)?.to_ascii_lowercase();
    MONTHS
        .iter()
        .position(|m| *m == prefix)
        .map(|i| i as u32 + 1)
}

/// The first instant after `now_secs` at `time` — on the given
/// `(month, day)` (this year or next) when there is one, else today or
/// tomorrow.
fn next_occurrence<Z: TimeZone>(
    zone: &Z,
    now_secs: i64,
    time: NaiveTime,
    date: Option<(u32, u32)>,
) -> Option<i64> {
    let now = zone.timestamp_opt(now_secs, 0).single()?;
    let today = now.date_naive();
    let candidates: Vec<NaiveDate> = match date {
        Some((month, day)) => (0..2)
            .filter_map(|y| NaiveDate::from_ymd_opt(today.year() + y, month, day))
            .collect(),
        None => vec![today, today.succ_opt()?],
    };
    candidates.into_iter().find_map(|d| {
        zone.from_local_datetime(&d.and_time(time))
            .earliest()
            .filter(|c| *c > now)
            .map(|c| c.timestamp_millis())
    })
}

struct HitLimit {
    reset_at_ms: i64,
    kind: Option<String>,
    message: String,
}

/// Reads a failed prompt's JSON-RPC error: a usage limit when `data` is an
/// object with `errorKind == "rate_limit"`. The reset time is
/// `rateLimit.resetsAt` (Unix seconds), falling back to the time printed in
/// the message.
fn limit_from_error(error: &agent_client_protocol::Error, now_secs: i64) -> Option<HitLimit> {
    let data = error.data.as_ref()?.as_object()?;
    if data.get("errorKind")?.as_str()? != "rate_limit" {
        return None;
    }
    let info = data.get("rateLimit").and_then(|v| v.as_object());
    let kind = info
        .and_then(|i| i.get("rateLimitType"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    // "Internal error: You've hit your 5-hour limit · …" — the JSON-RPC
    // code's stock text adds nothing to the banner.
    let message = error.message.trim();
    let message = message
        .strip_prefix("Internal error:")
        .map(str::trim)
        .unwrap_or(message)
        .to_string();
    let reset_at_ms = info
        .and_then(|i| i.get("resetsAt"))
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
        .map(|secs| secs * 1000)
        .or_else(|| parse_reset_at_ms(&message, now_secs))?;
    Some(HitLimit {
        reset_at_ms,
        kind,
        message,
    })
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

struct Detected {
    message: String,
    kind: Option<String>,
    reset_at: i64,
    armed: bool,
}

/// `None` when there's no pending limit, the user already answered "No" /
/// cancelled for it, or this is a task chat the project chat is following
/// (the project chat deals with that one's limit).
fn detect(db: &db::Db, session_id: &str) -> Option<Detected> {
    if db::task_for_conversation(db, session_id).is_some_and(|t| t.engaged_with_project) {
        return None;
    }
    let pending = db::get_pending_rate_limit(db, session_id)?;
    if pending.armed == Some(false) {
        return None;
    }
    Some(Detected {
        message: pending.message,
        kind: pending.kind,
        reset_at: pending.reset_at_ms,
        armed: pending.armed == Some(true),
    })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitResume {
    message: String,
    /// The agent's own name for the limit's window, e.g. `five_hour`.
    kind: Option<String>,
    reset_at: i64,
    armed: bool,
}

impl From<Detected> for RateLimitResume {
    fn from(d: Detected) -> Self {
        Self {
            message: d.message,
            kind: d.kind,
            reset_at: d.reset_at,
            armed: d.armed,
        }
    }
}

/// Tells the conversation's frontend the current pending-limit state
/// (`null` when there is none).
pub(crate) fn publish(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    let payload = detect(&state.db, session_id).map(RateLimitResume::from);
    let _ = app.emit(&format!("chat://{session_id}/rate_limit"), payload);
}

pub(crate) fn cancel_timer(state: &AppState, session_id: &str) {
    if let Some(handle) = state.rate_limit_timers.lock().unwrap().remove(session_id) {
        handle.abort();
    }
}

fn spawn_timer(app: &AppHandle, session_id: &str, reset_at: i64) {
    let task_app = app.clone();
    let id = session_id.to_string();
    let handle = tauri::async_runtime::spawn({
        let id = id.clone();
        async move {
            loop {
                let remaining = reset_at + GRACE_MS - now_ms();
                if remaining <= 0 {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(remaining as u64).min(MAX_SLEEP)).await;
            }
            try_fire(&task_app, &id);
        }
    });
    let state = app.state::<AppState>();
    let old = state.rate_limit_timers.lock().unwrap().insert(id, handle);
    if let Some(old) = old {
        old.abort();
    }
}

/// Sends the resume prompt if this conversation has an armed, due limit and
/// a live ACP connection. Called when the timer fires and again whenever the
/// conversation's session is (re)connected, since after an app restart a due
/// resume has no connection to use until then.
pub(crate) fn try_fire(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    let Some(d) = detect(&state.db, session_id) else {
        return;
    };
    if !d.armed || d.reset_at + GRACE_MS > now_ms() {
        return;
    }
    let prompt = resume_prompt(ResumeKind::of(&state.db, session_id));
    let sender = state
        .acp_sessions
        .lock()
        .unwrap()
        .get(session_id)
        .map(|s| s.sender.clone());
    let Some(sender) = sender else {
        return;
    };
    // Cleared before the prompt goes out, so a limit it hits again is
    // recorded afresh rather than wiped.
    db::clear_pending_rate_limit(&state.db, session_id);
    cancel_timer(&state, session_id);
    if sender
        .send(AcpCommand::Prompt(prompt.into(), vec![], None))
        .is_err()
    {
        return;
    }
    chat::push_message(
        &state,
        session_id,
        ChatMessage {
            role: "user".into(),
            content: prompt.into(),
            tool_calls: None,
        },
    );
    let _ = app.emit(&format!("chat://{session_id}/user_message"), prompt);
    let _ = app.emit(
        &format!("chat://{session_id}/rate_limit"),
        Option::<RateLimitResume>::None,
    );
}

/// Re-arms every resume the user had armed before the app last closed.
pub fn rearm_all(app: &AppHandle) {
    let state = app.state::<AppState>();
    for session_id in db::armed_rate_limit_conversations(&state.db) {
        if let Some(d) = detect(&state.db, &session_id) {
            if d.armed {
                spawn_timer(app, &session_id, d.reset_at);
            }
        }
    }
}

/// A message is going out (typed, or a board wake), ending any pending
/// limit. Call before the prompt is sent, so its own limit error isn't
/// wiped.
pub(super) fn clear(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    cancel_timer(&state, session_id);
    db::clear_pending_rate_limit(&state.db, session_id);
    publish(app, session_id);
}

/// A turn completed successfully, so no limit is pending any more.
pub(super) fn on_turn_completed(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    if db::get_pending_rate_limit(&state.db, session_id).is_some() {
        clear(app, session_id);
    }
}

/// A `session/prompt` request failed: records the limit if its JSON-RPC
/// error says it was one.
pub(super) fn on_prompt_error(
    app: &AppHandle,
    session_id: &str,
    error: &agent_client_protocol::Error,
) {
    let state = app.state::<AppState>();
    if record_error(&state.db, session_id, error, now_ms() / 1000) {
        cancel_timer(&state, session_id);
        publish(app, session_id);
    }
}

/// Stores the limit `error` reports, if it is one; `true` when it was.
fn record_error(
    db: &db::Db,
    session_id: &str,
    error: &agent_client_protocol::Error,
    now_secs: i64,
) -> bool {
    let Some(hit) = limit_from_error(error, now_secs) else {
        return false;
    };
    db::set_pending_rate_limit(
        db,
        session_id,
        hit.reset_at_ms,
        hit.kind.as_deref(),
        &hit.message,
    );
    true
}

#[tauri::command]
pub fn get_rate_limit_resume(
    state: State<'_, AppState>,
    session_id: String,
) -> Option<RateLimitResume> {
    detect(&state.db, &session_id).map(Into::into)
}

#[tauri::command]
pub fn arm_rate_limit_resume(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let d = detect(&state.db, &session_id).ok_or("No usage limit is pending.")?;
    db::set_rate_limit_choice(&state.db, &session_id, true);
    spawn_timer(&app, &session_id, d.reset_at);
    publish(&app, &session_id);
    Ok(())
}

#[tauri::command]
pub fn dismiss_rate_limit_resume(app: AppHandle, state: State<'_, AppState>, session_id: String) {
    db::set_rate_limit_choice(&state.db, &session_id, false);
    cancel_timer(&state, &session_id);
    publish(&app, &session_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn local_secs(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> i64 {
        Local
            .with_ymd_and_hms(y, mo, d, h, mi, 0)
            .earliest()
            .unwrap()
            .timestamp()
    }

    fn local_ms(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> i64 {
        local_secs(y, mo, d, h, mi) * 1000
    }

    /// Message 33641 from a real database: Claude Code's 5-hour limit.
    fn real_limit_error() -> agent_client_protocol::Error {
        agent_client_protocol::Error::new(
            -32603,
            "Internal error: You've hit your 5-hour limit · resets 12:40pm (Asia/Kolkata)",
        )
        .data(json!({
            "errorKind": "rate_limit",
            "rateLimit": {
                "status": "rejected",
                "resetsAt": 1795590600,
                "rateLimitType": "five_hour",
                "overageStatus": "rejected",
                "unifiedWindows": {}
            }
        }))
    }

    #[test]
    fn recognizes_limit_notices() {
        assert!(is_limit_notice(
            "You've hit your 5-hour limit · resets 12:40pm (Asia/Kolkata)"
        ));
        assert!(is_limit_notice(
            "You've hit your weekly limit · resets Sep 17, 3:30am (Asia/Kolkata)"
        ));
        assert!(is_limit_notice(
            "You've hit your session limit · resets 11:20pm (Asia/Kolkata)"
        ));
        assert!(!is_limit_notice(
            "The session limit is documented in the project notes."
        ));
    }

    #[test]
    fn reads_the_limit_from_the_error_data() {
        let hit = limit_from_error(&real_limit_error(), 0).expect("a rate_limit error");
        assert_eq!(hit.reset_at_ms, 1_795_590_600_000);
        assert_eq!(hit.kind.as_deref(), Some("five_hour"));
        assert_eq!(
            hit.message,
            "You've hit your 5-hour limit · resets 12:40pm (Asia/Kolkata)"
        );
    }

    #[test]
    fn other_errors_are_not_limits() {
        let plain = agent_client_protocol::Error::new(-32603, "Internal error")
            .data(json!("You've hit your 5-hour limit · resets 1am"));
        assert!(limit_from_error(&plain, 0).is_none());
        let other = agent_client_protocol::Error::new(-32603, "Internal error")
            .data(json!({ "errorKind": "overloaded" }));
        assert!(limit_from_error(&other, 0).is_none());
        let none = agent_client_protocol::Error::new(-32603, "Internal error");
        assert!(limit_from_error(&none, 0).is_none());
    }

    #[test]
    fn falls_back_to_the_printed_time_without_resets_at() {
        let now = local_secs(2026, 9, 19, 9, 0);
        let error = agent_client_protocol::Error::new(
            -32603,
            "Internal error: You've hit your 5-hour limit · resets 12:40pm",
        )
        .data(json!({ "errorKind": "rate_limit", "rateLimit": { "rateLimitType": "five_hour" } }));
        let hit = limit_from_error(&error, now).unwrap();
        assert_eq!(hit.reset_at_ms, local_ms(2026, 9, 19, 12, 40));
    }

    #[test]
    fn parses_twelve_hour_times_with_and_without_minutes() {
        let now = local_secs(2026, 9, 19, 9, 0);
        assert_eq!(
            parse_reset_at_ms("You've hit your 5-hour limit · resets 12:40pm", now),
            Some(local_ms(2026, 9, 19, 12, 40))
        );
        assert_eq!(
            parse_reset_at_ms("You've hit your 5-hour limit · resets 1am", now),
            Some(local_ms(2026, 9, 20, 1, 0))
        );
        assert_eq!(
            parse_reset_at_ms("limit · resets 12pm", now),
            Some(local_ms(2026, 9, 19, 12, 0))
        );
        assert_eq!(
            parse_reset_at_ms("limit · resets 12:30am", now),
            Some(local_ms(2026, 9, 20, 0, 30))
        );
        assert_eq!(parse_reset_at_ms("limit · resets soon", now), None);
        assert_eq!(parse_reset_at_ms("limit · resets 5", now), None);
    }

    #[test]
    fn parses_twenty_four_hour_times() {
        let now = local_secs(2026, 9, 19, 9, 0);
        assert_eq!(
            parse_reset_at_ms("limit · resets 13:05", now),
            Some(local_ms(2026, 9, 19, 13, 5))
        );
        assert_eq!(
            parse_reset_at_ms("limit · resets 08:15", now),
            Some(local_ms(2026, 9, 20, 8, 15))
        );
    }

    #[test]
    fn parses_a_leading_date() {
        let now = local_secs(2026, 9, 10, 9, 0);
        assert_eq!(
            parse_reset_at_ms("You've hit your weekly limit · resets Sep 17, 3:30am", now),
            Some(local_ms(2026, 9, 17, 3, 30))
        );
        // Already past this year: next year's.
        let later = local_secs(2026, 9, 18, 9, 0);
        assert_eq!(
            parse_reset_at_ms("weekly limit · resets Sep 17, 3:30am", later),
            Some(local_ms(2027, 9, 17, 3, 30))
        );
    }

    #[test]
    fn a_time_already_past_rolls_to_the_next_day() {
        let now = local_secs(2026, 9, 19, 23, 30);
        assert_eq!(
            parse_reset_at_ms("limit · resets 11:20pm", now),
            Some(local_ms(2026, 9, 20, 23, 20))
        );
        let before_midnight = local_secs(2026, 9, 19, 23, 59);
        assert_eq!(
            parse_reset_at_ms("limit · resets 12:00am", before_midnight),
            Some(local_ms(2026, 9, 20, 0, 0))
        );
    }

    #[test]
    fn reads_the_clock_time_in_the_printed_zone() {
        // 2026-09-19 12:00 UTC is 17:30 in Kolkata, so 11:20pm is 17:50 UTC.
        let now = chrono::Utc
            .with_ymd_and_hms(2026, 9, 19, 12, 0, 0)
            .unwrap()
            .timestamp();
        let expected = chrono::Utc
            .with_ymd_and_hms(2026, 9, 19, 17, 50, 0)
            .unwrap()
            .timestamp_millis();
        assert_eq!(
            parse_reset_at_ms("limit · resets 11:20pm (Asia/Kolkata)", now),
            Some(expected)
        );
        let local_now = local_secs(2026, 9, 19, 20, 0);
        assert_eq!(
            parse_reset_at_ms("limit · resets 11:20pm (Not/AZone)", local_now),
            Some(local_ms(2026, 9, 19, 23, 20))
        );
    }

    fn temp_db() -> db::Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        db::Db::open(path)
    }

    fn say(db: &db::Db, conversation_id: &str, role: &str, content: &str) {
        db::save_message(
            db,
            conversation_id,
            "/proj",
            &ChatMessage {
                role: role.into(),
                content: content.into(),
                tool_calls: None,
            },
        );
    }

    #[test]
    fn later_rows_do_not_hide_a_pending_limit() {
        let db = temp_db();
        say(&db, "conv", "user", "do the thing");
        assert!(detect(&db, "conv").is_none());

        assert!(record_error(&db, "conv", &real_limit_error(), 0));
        // The saved error row and a board note land after the notice.
        say(
            &db,
            "conv",
            "assistant",
            "Error: You've hit your 5-hour limit",
        );
        say(&db, "conv", "event", "Task #3 finished its turn.");
        let d = detect(&db, "conv").expect("still pending");
        assert_eq!(d.reset_at, 1_795_590_600_000);
        assert_eq!(d.kind.as_deref(), Some("five_hour"));
        assert!(!d.armed);

        db::set_rate_limit_choice(&db, "conv", true);
        assert!(detect(&db, "conv").unwrap().armed);
        assert_eq!(db::armed_rate_limit_conversations(&db), vec!["conv"]);
    }

    #[test]
    fn a_user_message_clears_it() {
        let db = temp_db();
        record_error(&db, "conv", &real_limit_error(), 0);
        // What `clear` does when `AcpBackend::send` pushes the message.
        db::clear_pending_rate_limit(&db, "conv");
        say(&db, "conv", "user", resume_prompt(ResumeKind::Chat));
        assert!(detect(&db, "conv").is_none());
        assert!(db::armed_rate_limit_conversations(&db).is_empty());
    }

    #[test]
    fn dismissal_applies_to_one_limit_only() {
        let db = temp_db();
        record_error(&db, "conv", &real_limit_error(), 0);
        db::set_rate_limit_choice(&db, "conv", false);
        assert!(detect(&db, "conv").is_none());

        record_error(&db, "conv", &real_limit_error(), 0);
        let second = detect(&db, "conv").expect("a newer limit is asked about afresh");
        assert!(!second.armed);
    }

    #[test]
    fn a_followed_task_chat_gets_none() {
        let db = temp_db();
        let task = db::create_task(
            &db,
            "/proj",
            db::NewTask {
                title: "t".into(),
                ..Default::default()
            },
        )
        .unwrap();
        say(&db, "task-chat", "user", "go");
        db::set_task_conversation(&db, &task.id, Some("task-chat"), true);
        record_error(&db, "task-chat", &real_limit_error(), 0);
        assert!(detect(&db, "task-chat").is_none());

        db::set_task_engaged(&db, &task.id, false);
        assert!(
            detect(&db, "task-chat").is_some(),
            "unfollowed task chats show it"
        );
    }

    #[test]
    fn the_resume_prompt_names_the_kind_of_chat() {
        let db = temp_db();
        assert_eq!(ResumeKind::of(&db, "conv"), ResumeKind::Chat);

        let task = db::create_task(
            &db,
            "/proj",
            db::NewTask {
                title: "t".into(),
                ..Default::default()
            },
        )
        .unwrap();
        db::set_task_conversation(&db, &task.id, Some("task-chat"), false);
        assert_eq!(ResumeKind::of(&db, "task-chat"), ResumeKind::TaskChat);

        db::record_sub_agent_started(&db, "sub", "conv", "do it", "", None);
        assert_eq!(ResumeKind::of(&db, "sub"), ResumeKind::SubAgent);
    }

    #[test]
    fn every_resume_prompt_says_other_chats_are_free() {
        for (kind, noun) in [
            (ResumeKind::Chat, "for this chat "),
            (ResumeKind::TaskChat, "for this task chat "),
            (ResumeKind::SubAgent, "for this sub-agent "),
        ] {
            let p = resume_prompt(kind);
            assert!(p.starts_with("The rate limit has reset, "), "{kind:?}");
            assert!(p.contains(noun), "{kind:?}");
            assert!(p.contains("every other chat on this account"), "{kind:?}");
            assert!(p.contains("task chats"), "{kind:?}");
            assert!(p.contains("sub-agents"), "{kind:?}");
            assert!(p.contains("Continue as you were"), "{kind:?}");
        }
        assert!(resume_prompt(ResumeKind::Chat).contains("don't resume on their own"));
    }
}
