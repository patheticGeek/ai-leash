import type { StateCreator } from "zustand";
import type { ReviewComment } from "../features/review/reviewComments";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

// Draft review comments (see `features/review/reviewComments.ts`), per
// conversation id, kept in localStorage so they survive a reload until
// "Send review" posts them (or the conversation is deleted).
type ReviewCommentsBySession = Record<string, ReviewComment[]>;

function load(): ReviewCommentsBySession {
  const parsed = localStorageJson.read<unknown>(LS_KEYS.reviewComments, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as ReviewCommentsBySession)
    : {};
}

export interface ReviewSlice {
  reviewComments: ReviewCommentsBySession;
  addReviewComment: (sessionId: string, comment: ReviewComment) => void;
  editReviewComment: (sessionId: string, id: string, body: string) => void;
  deleteReviewComment: (sessionId: string, id: string) => void;
  // After "Send review", and when the conversation is deleted.
  clearReviewComments: (sessionId: string) => void;
}

export const reviewSlice: StateCreator<AppStore, [], [], ReviewSlice> = (
  set,
  get,
) => {
  function update(
    sessionId: string,
    change: (comments: ReviewComment[]) => ReviewComment[],
  ) {
    const reviewComments = { ...get().reviewComments };
    const next = change(reviewComments[sessionId] ?? []);
    if (next.length > 0) reviewComments[sessionId] = next;
    else delete reviewComments[sessionId];
    localStorageJson.write(LS_KEYS.reviewComments, reviewComments);
    set({ reviewComments });
  }

  return {
    reviewComments: load(),
    addReviewComment: (sessionId, comment) =>
      update(sessionId, (comments) => [...comments, comment]),
    editReviewComment: (sessionId, id, body) =>
      update(sessionId, (comments) =>
        comments.map((c) => (c.id === id ? { ...c, body } : c)),
      ),
    deleteReviewComment: (sessionId, id) =>
      update(sessionId, (comments) => comments.filter((c) => c.id !== id)),
    clearReviewComments: (sessionId) => update(sessionId, () => []),
  };
};

const NONE: ReviewComment[] = [];

// A conversation's draft comments — a stable empty array when it has none,
// so selectors don't re-render on every store change.
export function reviewCommentsFor(
  s: Pick<ReviewSlice, "reviewComments">,
  sessionId: string | null,
): ReviewComment[] {
  return (sessionId && s.reviewComments[sessionId]) || NONE;
}
