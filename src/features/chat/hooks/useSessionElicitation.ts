import { api, type ElicitationAnswer } from "../../../lib/tauriApi";
import { elicitationForSession, useAppStore } from "../../../store";

// Whichever form the agent is currently asking this conversation to fill in
// (ACP `elicitation/create`), plus the way to answer it. Global listeners
// that populate `pendingElicitations` live in `LeftBar.tsx`, same as
// `useSessionPermissions`.
export function useSessionElicitation(
  sessionId: string | null,
  setError: (message: string | null) => void,
) {
  const pendingElicitations = useAppStore((s) => s.pendingElicitations);
  const resolvePendingElicitation = useAppStore(
    (s) => s.resolvePendingElicitation,
  );
  // Nothing can ask a new thread (no session yet) anything.
  const pendingElicitation = sessionId
    ? elicitationForSession(pendingElicitations, sessionId)
    : null;

  // Optimistic like `respondPermission`: close the form now, and let the
  // backend's own `elicitation://resolved` be a harmless second removal.
  // `requestId`: which of several open forms (the one the prompt has stepped
  // to); the oldest when left out.
  async function respondElicitation(
    answer: ElicitationAnswer,
    requestId?: string,
  ) {
    const id = requestId ?? pendingElicitation?.id;
    if (!id) return;
    resolvePendingElicitation(id);
    try {
      await api.respondElicitation(id, answer);
    } catch (e) {
      setError(String(e));
    }
  }

  return { pendingElicitation, respondElicitation };
}
