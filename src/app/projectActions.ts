import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store";

/** Asks for a folder and adds it as a project (no-op if cancelled). */
export async function pickAndAddProject() {
  const dir = await open({ directory: true, multiple: false });
  if (typeof dir === "string") {
    await useAppStore.getState().addProject(dir);
  }
}

// Starts a fresh thread directly in whatever project is currently open — no
// project picker here (see `NewThreadHero.tsx`'s "New thread in <project ▾>"
// heading for changing *which* project a still-fresh new thread
// targets instead). Falls back to the native folder picker only when no
// project has ever been opened yet, since there's nothing to start a thread
// in otherwise. Used by the sidebar's New thread item and Ctrl+N.
export async function startNewThread() {
  const { projectRoot, startNewConversation } = useAppStore.getState();
  if (projectRoot) {
    await startNewConversation(projectRoot);
    return;
  }
  await pickAndAddProject();
}
