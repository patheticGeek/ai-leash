//! Claude Code session-limit auto-resume. The transcript is the source of
//! truth: a limit is pending exactly while the conversation's *last* message
//! is Claude's "You've hit your session limit · resets 11:20pm" notice, which
//! is what lets the banner (and an armed resume) survive an app restart. The
//! user's answer to the banner is stored per notice message
//! (`db::rate_limit`), so a newer notice is asked about afresh, and any
//! message sent after the notice ends the pending limit on its own.

use super::AcpCommand;
use crate::chat::{self, ChatMessage};
use crate::db;
use crate::state::AppState;
use chrono::{Local, NaiveTime, TimeZone};
use chrono_tz::Tz;
use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

const RESUME_PROMPT: &str = "continue working";
/// Claude can still report the limit for a moment after the printed reset
/// minute, which would just produce another notice.
const GRACE_MS: i64 = 10_000;
/// Timers wake at least this often to re-read the wall clock — tokio's
/// sleep runs on the monotonic clock, which doesn't advance while the
/// machine is suspended, so one long sleep would fire late after a wake-up.
const MAX_SLEEP: Duration = Duration::from_secs(30);

pub(super) fn is_session_limit_notice(text: &str) -> bool {
    let normalized = text.to_ascii_lowercase();
    (normalized.contains("you've hit") || normalized.contains("you have hit"))
        && normalized.contains("session limit")
        && normalized.contains("reset")
}

fn reset_time_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m(?:\s*\(([^)]+)\))?",
        )
        .unwrap()
    })
}

/// The first instant matching the printed "resets 11:20pm (Asia/Kolkata)"
/// clock time strictly after `sent_at_secs` (when the notice was written), as
/// epoch millis. "First occurrence after the notice" rather than "same date
/// as the notice" is what keeps a notice written just before midnight (or a
/// reset just after it) on the right day. The clock time is read in the
/// printed zone when it names a valid IANA zone, else the machine's local
/// one.
fn parse_reset_at_ms(text: &str, sent_at_secs: i64) -> Option<i64> {
    let caps = reset_time_regex().captures(text)?;
    let hour12: u32 = caps[1].parse().ok()?;
    if !(1..=12).contains(&hour12) {
        return None;
    }
    let minute: u32 = match caps.get(2) {
        Some(m) => m.as_str().parse().ok()?,
        None => 0,
    };
    let pm = caps[3].eq_ignore_ascii_case("p");
    let time = NaiveTime::from_hms_opt(hour12 % 12 + if pm { 12 } else { 0 }, minute, 0)?;

    match caps
        .get(4)
        .and_then(|m| m.as_str().trim().parse::<Tz>().ok())
    {
        Some(tz) => next_occurrence(&tz, sent_at_secs, time),
        None => next_occurrence(&Local, sent_at_secs, time),
    }
}

fn next_occurrence<Z: TimeZone>(zone: &Z, sent_at_secs: i64, time: NaiveTime) -> Option<i64> {
    let sent = zone.timestamp_opt(sent_at_secs, 0).single()?;
    let mut date = sent.date_naive();
    for _ in 0..2 {
        if let Some(candidate) = zone.from_local_datetime(&date.and_time(time)).earliest() {
            if candidate > sent {
                return Some(candidate.timestamp_millis());
            }
        }
        date = date.succ_opt()?;
    }
    None
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

struct Detected {
    message_id: i64,
    message: String,
    reset_at: i64,
    armed: bool,
}

/// `None` when there's no pending limit: the last message isn't the notice,
/// or the user already answered "No"/cancelled for this very notice.
fn detect(db: &db::Db, session_id: &str) -> Option<Detected> {
    let last = db::last_message(db, session_id)?;
    if last.role != "assistant" || !is_session_limit_notice(&last.content) {
        return None;
    }
    let reset_at = parse_reset_at_ms(&last.content, last.created_at)?;
    let armed = match db::get_rate_limit_choice(db, session_id) {
        Some((id, armed)) if id == last.id => {
            if !armed {
                return None;
            }
            true
        }
        _ => false,
    };
    Some(Detected {
        message_id: last.id,
        message: last.content.trim().to_string(),
        reset_at,
        armed,
    })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitResume {
    message: String,
    reset_at: i64,
    armed: bool,
}

impl From<Detected> for RateLimitResume {
    fn from(d: Detected) -> Self {
        Self {
            message: d.message,
            reset_at: d.reset_at,
            armed: d.armed,
        }
    }
}

/// Tells the conversation's frontend the current pending-limit state
/// (`null` when there is none).
pub(super) fn publish(app: &AppHandle, session_id: &str) {
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
    let sender = state
        .acp_sessions
        .lock()
        .unwrap()
        .get(session_id)
        .map(|s| s.sender.clone());
    let Some(sender) = sender else {
        return;
    };
    if sender
        .send(AcpCommand::Prompt(RESUME_PROMPT.into(), None))
        .is_err()
    {
        return;
    }
    chat::push_message(
        &state,
        session_id,
        ChatMessage {
            role: "user".into(),
            content: RESUME_PROMPT.into(),
            tool_calls: None,
        },
    );
    cancel_timer(&state, session_id);
    let _ = app.emit(&format!("chat://{session_id}/user_message"), RESUME_PROMPT);
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

/// A message just went out by hand, ending any pending limit.
pub(super) fn clear(app: &AppHandle, session_id: &str) {
    cancel_timer(&app.state::<AppState>(), session_id);
    publish(app, session_id);
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
    let d = detect(&state.db, &session_id).ok_or("No session limit is pending.")?;
    db::set_rate_limit_choice(&state.db, &session_id, d.message_id, true);
    spawn_timer(&app, &session_id, d.reset_at);
    publish(&app, &session_id);
    Ok(())
}

#[tauri::command]
pub fn dismiss_rate_limit_resume(app: AppHandle, state: State<'_, AppState>, session_id: String) {
    if let Some(d) = detect(&state.db, &session_id) {
        db::set_rate_limit_choice(&state.db, &session_id, d.message_id, false);
    }
    cancel_timer(&state, &session_id);
    publish(&app, &session_id);
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn recognizes_claude_session_limit_notice() {
        assert!(is_session_limit_notice(
            "You've hit your session limit · resets 11:20pm (Asia/Kolkata)"
        ));
        assert!(is_session_limit_notice(
            "You have hit the session limit; reset at 11:20 PM"
        ));
        assert!(!is_session_limit_notice(
            "The session limit is documented in the project notes."
        ));
    }

    #[test]
    fn reset_later_the_same_day() {
        let sent = local_secs(2026, 9, 19, 20, 0);
        assert_eq!(
            parse_reset_at_ms("You've hit your session limit · resets 11:20pm", sent),
            Some(local_ms(2026, 9, 19, 23, 20))
        );
    }

    #[test]
    fn reset_rolls_to_the_next_day_when_already_past() {
        let sent = local_secs(2026, 9, 19, 23, 30);
        assert_eq!(
            parse_reset_at_ms("You've hit your session limit · resets 11:20pm", sent),
            Some(local_ms(2026, 9, 20, 23, 20))
        );
    }

    #[test]
    fn handles_noon_midnight_and_missing_minutes() {
        let sent = local_secs(2026, 9, 19, 9, 0);
        assert_eq!(
            parse_reset_at_ms("session limit · resets 12pm", sent),
            Some(local_ms(2026, 9, 19, 12, 0))
        );
        assert_eq!(
            parse_reset_at_ms("session limit · resets 12:30am", sent),
            Some(local_ms(2026, 9, 20, 0, 30))
        );
        assert_eq!(parse_reset_at_ms("session limit · resets soon", sent), None);
    }

    #[test]
    fn a_notice_just_before_midnight_resets_on_the_next_day() {
        let sent = local_secs(2026, 9, 19, 23, 59);
        assert_eq!(
            parse_reset_at_ms("session limit · resets 12:00am", sent),
            Some(local_ms(2026, 9, 20, 0, 0))
        );
        assert_eq!(
            parse_reset_at_ms("session limit · resets 12:30am", sent),
            Some(local_ms(2026, 9, 20, 0, 30))
        );
    }

    #[test]
    fn reads_the_clock_time_in_the_printed_zone() {
        // 2026-09-19 12:00 UTC is 17:30 in Kolkata, so 11:20pm is 17:50 UTC.
        let sent = chrono::Utc
            .with_ymd_and_hms(2026, 9, 19, 12, 0, 0)
            .unwrap()
            .timestamp();
        let expected = chrono::Utc
            .with_ymd_and_hms(2026, 9, 19, 17, 50, 0)
            .unwrap()
            .timestamp_millis();
        assert_eq!(
            parse_reset_at_ms("session limit · resets 11:20pm (Asia/Kolkata)", sent),
            Some(expected)
        );
    }

    #[test]
    fn unknown_zone_falls_back_to_local() {
        let sent = local_secs(2026, 9, 19, 20, 0);
        assert_eq!(
            parse_reset_at_ms("session limit · resets 11:20pm (Not/AZone)", sent),
            Some(local_ms(2026, 9, 19, 23, 20))
        );
    }

    fn temp_db() -> db::Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        db::Db::open(path)
    }

    fn say(db: &db::Db, role: &str, content: &str) {
        db::save_message(
            db,
            "conv",
            "/proj",
            &ChatMessage {
                role: role.into(),
                content: content.into(),
                tool_calls: None,
            },
        );
    }

    const NOTICE: &str = "You've hit your session limit · resets 11:20pm (Asia/Kolkata)";

    #[test]
    fn pending_only_while_the_notice_is_the_last_message() {
        let db = temp_db();
        say(&db, "user", "do the thing");
        assert!(detect(&db, "conv").is_none());

        say(&db, "assistant", NOTICE);
        let d = detect(&db, "conv").expect("notice is last");
        assert!(!d.armed);

        db::set_rate_limit_choice(&db, "conv", d.message_id, true);
        assert!(detect(&db, "conv").unwrap().armed);
        assert_eq!(db::armed_rate_limit_conversations(&db), vec!["conv"]);

        say(&db, "user", "continue working");
        assert!(detect(&db, "conv").is_none());
    }

    #[test]
    fn dismissal_applies_to_one_notice_only() {
        let db = temp_db();
        say(&db, "assistant", NOTICE);
        let first = detect(&db, "conv").unwrap();
        db::set_rate_limit_choice(&db, "conv", first.message_id, false);
        assert!(detect(&db, "conv").is_none());

        say(&db, "user", "continue working");
        say(&db, "assistant", NOTICE);
        let second = detect(&db, "conv").expect("a newer notice is asked about afresh");
        assert!(!second.armed);
    }
}
