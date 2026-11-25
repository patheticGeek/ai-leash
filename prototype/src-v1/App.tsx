import type React from "react";
import { useEffect, useState } from "react";
import BoardScreen from "./screens/BoardScreen";
import ChatScreen from "./screens/ChatScreen";
import NewThreadScreen from "./screens/NewThreadScreen";
import SettingsScreen, { type SettingsPanel } from "./screens/SettingsScreen";
import TaskScreen from "./screens/TaskScreen";

// One hash route per surface, so Playwright can shoot each one.
const ROUTES: Record<string, () => React.ReactElement> = {
  chat: () => <ChatScreen variant="working" />,
  "chat-permission": () => <ChatScreen variant="permission" />,
  "chat-question": () => <ChatScreen variant="question" />,
  new: () => <NewThreadScreen />,
  "new-slash": () => <NewThreadScreen isSlashOpen />,
  board: () => <BoardScreen layout="both" />,
  "board-epics": () => <BoardScreen layout="board" isGrouped isDoneShown />,
  task: () => <TaskScreen />,
  "task-dialog": () => <BoardScreen layout="board" isTaskDialogOpen />,
};

export default function App() {
  const [hash, setHash] = useState(location.hash.slice(2) || "chat");
  useEffect(() => {
    const on = () => setHash(location.hash.slice(2) || "chat");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  if (hash.startsWith("settings")) {
    return <SettingsScreen panel={(hash.split("/")[1] ?? "agents") as SettingsPanel} />;
  }
  return (ROUTES[hash] ?? ROUTES.chat)();
}
