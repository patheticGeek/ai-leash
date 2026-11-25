import { lazy, Suspense, useEffect, useState } from "react";

// Hash routes: one per screen the screenshots cover, plus ref/<template> for
// the raw Astryx templates the screens are compared against.
import ChatScreen from "./screens/ChatScreen";
import BoardScreen from "./screens/BoardScreen";
import { TaskDetailsScreen, TaskNewScreen, TaskViewScreen } from "./screens/TaskScreen";
import SettingsScreen from "./screens/SettingsScreen";
import NewThreadScreen from "./screens/NewThreadScreen";
import ChatStatesScreen, { CHAT_STATES } from "./screens/ChatStatesScreen";

const routes: Record<string, React.ComponentType> = {
  chat: () => <ChatScreen />,
  "chat-collapsed": () => <ChatScreen isSidebarCollapsed />,
  "chat-subagent-tab": () => <ChatScreen initialTab="sub" />,
  new: () => <NewThreadScreen />,
  board: () => <BoardScreen />,
  "board-epics": () => <BoardScreen variant="epics" />,
  task: () => <TaskViewScreen />,
  ...Object.fromEntries(
    (["agents", "chat", "fonts", "editor", "debug", "crashlog", "about"] as const).map((p) => [
      `settings/${p}`,
      () => <SettingsScreen panel={p} />,
    ]),
  ),
  "task-new": () => <TaskNewScreen />,
  "task-details": () => <TaskDetailsScreen />,
  "task-details-todo": () => <TaskDetailsScreen isStarted={false} />,
  "board-epics-drag": () => <BoardScreen variant="epics-drag" />,
  "board-epics-scrolled": () => <BoardScreen variant="epics-scrolled" />,
  "new-slash": () => <NewThreadScreen />,
  "chat-permission": () => <ChatScreen variant="permission" />,
  "chat-question": () => <ChatScreen variant="question" />,
  ...Object.fromEntries(Object.keys(CHAT_STATES).map((k) => [k, () => <ChatStatesScreen state={k} />])),
  "ref/ide": lazy(() => import("./ref/ide")),
  "ref/shell-side-nav": lazy(() => import("./ref/shell-side-nav")),
  "ref/ai-chat-landing": lazy(() => import("./ref/ai-chat-landing")),
  "ref/ai-chat": lazy(() => import("./ref/ai-chat")),
  "ref/kanban-board": lazy(() => import("./ref/kanban-board")),
  "ref/work-item-detail": lazy(() => import("./ref/work-item-detail")),
  "ref/settings-dialog": lazy(() => import("./ref/settings-dialog")),
};

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(2));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(2));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const Screen = routes[hash] ?? routes["ref/ide"];
  return (
    <Suspense fallback={null}>
      <Screen />
    </Suspense>
  );
}
