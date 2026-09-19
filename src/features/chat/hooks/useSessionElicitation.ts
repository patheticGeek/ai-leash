import { api, type ElicitationAnswer } from "../../../lib/tauriApi";
import { elicitationForSession, useAppStore } from "../../../store";

// Whichever form the agent is currently asking this conversation to fill in
// (ACP `elicitation/create`), plus the way to answer it. Global listeners
// that populate `pendingElicitations` live in `LeftBar.tsx`, same as
// `useSessionPermissions`.
export function useSessionElicitation(
  sessionId: string,
  setError: (message: string | null) => void,
) {
  const pendingElicitations = useAppStore((s) => s.pendingElicitations);
  const resolvePendingElicitation = useAppStore(
    (s) => s.resolvePendingElicitation,
  );
  const pendingElicitation = elicitationForSession(
    pendingElicitations,
    sessionId,
  );

  // Optimistic like `respondPermission`: close the form now, and let the
  // backend's own `elicitation://resolved` be a harmless second removal.
  async function respondElicitation(answer: ElicitationAnswer) {
    if (!pendingElicitation) return;
    const id = pendingElicitation.id;
    resolvePendingElicitation(id);
    try {
      await api.respondElicitation(id, answer);
    } catch (e) {
      setError(String(e));
    }
  }

  return { pendingElicitation, respondElicitation };
}
