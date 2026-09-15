import { useEffect } from "react";
import SettingsModal from "../features/settings/SettingsModal";
import SidePanel from "../features/sidebar/SidePanel";
import { useFsChangeInvalidator } from "../features/sidebar/tabs/useFsDir";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { BUILD_LABEL } from "../lib/buildChannel";
import { useGeneratingListener } from "../lib/generatingQuery";
import { LS_KEYS } from "../lib/localStorageKeys";
import { useAppStore } from "../store";
import ResizeHandle from "../ui/ResizeHandle";
import CenterPanel from "./CenterPanel";
import LeftBar from "./LeftBar";
import TitleBar, { TITLEBAR_HEIGHT } from "./TitleBar";

function App() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const refreshOllamaModels = useAppStore((s) => s.refreshOllamaModels);
  const refreshProviderConnectivity = useAppStore(
    (s) => s.refreshProviderConnectivity,
  );
  const initializeStartupSession = useAppStore(
    (s) => s.initializeStartupSession,
  );
  const refreshAcpModelCache = useAppStore((s) => s.refreshAcpModelCache);
  const loadSubAgentTasks = useAppStore((s) => s.loadSubAgentTasks);

  // Always on regardless of which sidebar tab is open — see its comment for
  // why this can't just live inside `FileTree`.
  useFsChangeInvalidator();
  // Always on regardless of which conversation is open — see its comment
  // for why a single top-level listener replaces what used to be a
  // per-session one.
  useGeneratingListener();

  const [leftBarWidth, leftBarResize] = useResizableWidth(
    LS_KEYS.leftBarWidth,
    220,
    160,
    400,
    1,
  );
  const [rightPanelWidth, rightPanelResize] = useResizableWidth(
    LS_KEYS.rightPanelWidth,
    360,
    240,
    720,
    -1,
  );

  useEffect(() => {
    refreshOllamaModels();
  }, [refreshOllamaModels]);

  useEffect(() => {
    refreshProviderConnectivity();
    const interval = setInterval(refreshProviderConnectivity, 5000);
    return () => clearInterval(interval);
  }, [refreshProviderConnectivity]);

  // `refreshAcpModelCache` is sequenced after `initializeStartupSession`
  // resolves rather than fired in its own parallel effect: `fetch_acp_models`
  // (the discovery subprocess spawn) requires a project root
  // (`commands::get_root_path`), which `initializeStartupSession` is what
  // actually sets (`api.setProjectRoot`) — running them in parallel let this
  // race and fail with "no project open" before any project was picked,
  // permanently caching a `null` for every agent for the rest of the app
  // session (nothing ever retried a cached miss).
  useEffect(() => {
    (async () => {
      await initializeStartupSession();
      // One-shot per launch, not polled — each fetch briefly spawns and
      // kills a real subprocess per not-yet-cached ACP agent (see
      // fetch_acp_models/acp.rs); successful discoveries persist across
      // restarts (see `acpSlice.ts`'s `loadAcpModelCache`), so this only
      // actually does work for agents that were never (successfully)
      // discovered before.
      refreshAcpModelCache();
    })();
  }, [initializeStartupSession, refreshAcpModelCache]);

  // Runs on every conversation switch regardless of whether the Sub Agents
  // panel tab is even open — that tab is `mountMode: "active-only"`
  // (`tabKinds.ts`), so relying on its own mount effect alone left
  // `subAgentTasks` (and every count derived from it — the Sub Agents tab
  // itself, `SidePanel.tsx`'s inline badge, `TabPicker.tsx`'s corner badge)
  // showing whatever the *previous* conversation last loaded until the user
  // happened to open that tab for the new one.
  useEffect(() => {
    if (activeSessionId) loadSubAgentTasks(activeSessionId);
  }, [activeSessionId, loadSubAgentTasks]);

  // webkit2gtk (the Linux webview) only wires Ctrl+Z/Y into its editing
  // engine via a native app menu's Undo/Redo accelerators — this app has no
  // native menu (custom chromeless titlebar), so plain inputs/textareas get
  // no undo at all there. `execCommand` reaches the same internal undo
  // manager directly, sidestepping the missing accelerator wiring; harmless
  // on platforms where the native shortcut already works.
  useEffect(() => {
    function handleUndoRedo(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        document.execCommand(e.shiftKey ? "redo" : "undo");
      } else if (key === "y") {
        e.preventDefault();
        document.execCommand("redo");
      }
    }
    document.addEventListener("keydown", handleUndoRedo);
    return () => document.removeEventListener("keydown", handleUndoRedo);
  }, []);

  return (
    <div className="relative flex h-screen w-screen flex-col text-zinc-200">
      {BUILD_LABEL && (
        <div className="pointer-events-none fixed inset-0 z-[999] border border-amber-500/50" />
      )}
      <TitleBar leftBarWidth={leftBarWidth} rightPanelWidth={rightPanelWidth} />
      <SettingsModal />
      <div
        className="flex flex-1 min-h-0"
        style={{ marginTop: TITLEBAR_HEIGHT }}
      >
        <div style={{ width: leftBarWidth }} className="shrink-0">
          <LeftBar />
        </div>
        <ResizeHandle width={leftBarWidth} {...leftBarResize} />
        <div className="flex-1 min-w-0">
          <CenterPanel key={activeSessionId ?? "none"} />
        </div>
        <ResizeHandle width={rightPanelWidth} {...rightPanelResize} />
        <div style={{ width: rightPanelWidth }} className="shrink-0">
          <SidePanel />
        </div>
      </div>
    </div>
  );
}

export default App;
