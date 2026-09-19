use crate::state::{AppState, PendingElicitation};
use agent_client_protocol::schema::v1::{
    CreateElicitationRequest, ElicitationAcceptAction, ElicitationAction, ElicitationContentValue,
    ElicitationMode,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

/// Payload of `elicitation://request`. `schema` is the request's
/// `requestedSchema` passed through as-is (it already serializes to the JSON
/// Schema subset the wire format defines), so the frontend types it once
/// (`ElicitationSchema` in `tauriApi.ts`) instead of us mirroring every
/// property kind in a second Rust struct.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ElicitationRequestPayload {
    id: String,
    session_id: String,
    message: String,
    schema: serde_json::Value,
}

/// What the user did with the form — the frontend's half of
/// `ElicitationAction`, minus the `Other` escape hatch we never produce.
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ElicitationAnswer {
    Accept {
        content: BTreeMap<String, ElicitationContentValue>,
    },
    Decline,
    Cancel,
}

impl From<ElicitationAnswer> for ElicitationAction {
    fn from(answer: ElicitationAnswer) -> Self {
        match answer {
            ElicitationAnswer::Accept { content } => {
                ElicitationAction::Accept(ElicitationAcceptAction::new().content(content))
            }
            ElicitationAnswer::Decline => ElicitationAction::Decline,
            ElicitationAnswer::Cancel => ElicitationAction::Cancel,
        }
    }
}

/// Surfaces a form-mode `elicitation/create` to the user and waits for their
/// answer. Unlike `bridge_acp_permission` this ignores the session's
/// Ask/Bypass mode — bypass auto-approves *tool calls*, but there's no
/// meaningful auto-answer to someone else's question. URL mode isn't
/// advertised in our capabilities, so an agent sending it anyway is declined.
pub(super) async fn bridge_acp_elicitation(
    app: &AppHandle,
    session_id: &str,
    request: &CreateElicitationRequest,
) -> ElicitationAction {
    let ElicitationMode::Form(form) = &request.mode else {
        return ElicitationAction::Decline;
    };
    let state = app.state::<AppState>();
    let id = Uuid::new_v4().to_string();
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.pending_elicitations.lock().unwrap().insert(
        id.clone(),
        PendingElicitation {
            session_id: session_id.to_string(),
            tx,
        },
    );
    let _ = app.emit(
        "elicitation://request",
        ElicitationRequestPayload {
            id,
            session_id: session_id.to_string(),
            message: request.message.clone(),
            schema: serde_json::to_value(&form.requested_schema).unwrap_or_else(|_| json!({})),
        },
    );
    // A dropped sender means the entry was discarded without an answer —
    // report that as a dismissal, the protocol's "no choice made".
    rx.await.unwrap_or(ElicitationAction::Cancel)
}

/// Answers a pending request and tells every subscriber it's no longer
/// pending (`elicitation://resolved`), same shape as `respond_permission`.
#[tauri::command]
pub fn respond_elicitation(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    answer: ElicitationAnswer,
) -> Result<(), String> {
    let pending = state.pending_elicitations.lock().unwrap().remove(&id);
    match pending {
        Some(pending) => {
            let _ = pending.tx.send(answer.into());
            let _ = app.emit("elicitation://resolved", json!({ "id": id }));
            Ok(())
        }
        None => Err("no such elicitation request".into()),
    }
}

/// Dismisses every form still open for `session_id` — called when the turn
/// is cancelled or the connection goes away, since the agent is no longer
/// waiting for an answer (ACP: a cancelled turn must resolve its pending
/// client requests as cancelled) and the form would otherwise sit in the
/// composer with nothing behind it.
pub(super) fn cancel_pending_elicitations(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    let cancelled: Vec<(String, PendingElicitation)> = {
        let mut pending = state.pending_elicitations.lock().unwrap();
        let ids: Vec<String> = pending
            .iter()
            .filter(|(_, p)| p.session_id == session_id)
            .map(|(id, _)| id.clone())
            .collect();
        ids.into_iter()
            .filter_map(|id| pending.remove(&id).map(|p| (id, p)))
            .collect()
    };
    for (id, pending) in cancelled {
        let _ = pending.tx.send(ElicitationAction::Cancel);
        let _ = app.emit("elicitation://resolved", json!({ "id": id }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accept_answer_carries_typed_content() {
        let answer: ElicitationAnswer = serde_json::from_value(json!({
            "action": "accept",
            "content": { "name": "x", "count": 3, "ratio": 0.5, "on": true, "tags": ["a", "b"] },
        }))
        .unwrap();
        let ElicitationAction::Accept(accept) = ElicitationAction::from(answer) else {
            panic!("expected accept");
        };
        let content = accept.content.unwrap();
        assert_eq!(content["name"], ElicitationContentValue::String("x".into()));
        assert_eq!(content["count"], ElicitationContentValue::Integer(3));
        assert_eq!(content["ratio"], ElicitationContentValue::Number(0.5));
        assert_eq!(content["on"], ElicitationContentValue::Boolean(true));
        assert_eq!(
            content["tags"],
            ElicitationContentValue::StringArray(vec!["a".into(), "b".into()])
        );
    }

    #[test]
    fn decline_and_cancel_need_no_content() {
        let decline: ElicitationAnswer =
            serde_json::from_value(json!({ "action": "decline" })).unwrap();
        assert_eq!(ElicitationAction::from(decline), ElicitationAction::Decline);
        let cancel: ElicitationAnswer =
            serde_json::from_value(json!({ "action": "cancel" })).unwrap();
        assert_eq!(ElicitationAction::from(cancel), ElicitationAction::Cancel);
    }

    #[test]
    fn accept_response_serializes_to_the_wire_shape() {
        let action = ElicitationAction::Accept(
            ElicitationAcceptAction::new().content(BTreeMap::from([("n".to_string(), 2.into())])),
        );
        assert_eq!(
            serde_json::to_value(&action).unwrap(),
            json!({ "action": "accept", "content": { "n": 2 } })
        );
    }
}
