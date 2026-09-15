import { useEffect } from "react";
import SettingsModal from "../features/settings/SettingsModal";
import SidePanel from "../features/sidebar/SidePanel";
import { useFsChangeInvalidator } from "../features/sidebar/tabs/useFsDir";
import { useResizableWidth } from "../hooks/useResizableWidth";
import {
  useAcpAgentCatalogQuery,
  useAcpCatalogInvalidator,
} from "../lib/acpCatalogQuery";
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
  const loadSubAgentTasks = useAppStore((s) => s.loadSubAgentTasks);
  const agentBackend = useAppStore((s) => s.agentBackend);
  const fetchAcpModelsFor = useAppStore((s) => s.fetchAcpModelsFor);

  // Always on regardless of which sidebar tab is open — see its comment for
  // why this can't just live inside `FileTree`.
  useFsChangeInvalidator();
  // Always on regardless of which conversation is open — see its comment
  // for why a single top-level listener replaces what used to be a
  // per-session one.
  useGeneratingListener();
  // Always on — invalidates `useAcpAgentCatalog()` whenever Rust's
  // background refresh (or an on-demand discovery) updates the catalog.
  useAcpCatalogInvalidator();
  // Keeps the catalog query warm here too, not just inside `ChatPanel`'s
  // `useChatSession` (its only other caller) — that one lives under
  // `CenterPanel`'s `key={activeSessionId}`, so it fully unmounts and
  // remounts on every conversation switch. Without a subscriber that
  // survives the switch, the query would otherwise drop to zero observers
  // between the old conversation's unmount and the new one's mount and the
  // picker would flash empty for a tick each time, even though the
  // underlying data itself hasn't changed.
  const acpCatalogQuery = useAcpAgentCatalogQuery();

  // Rust's own background refresh (`acp::refresh_acp_catalog_in_background`)
  // only re-discovers agents *already* in its catalog — nothing ever seeds
  // an agent into it for the first time except an explicit Settings save
  // with a changed launch command. That leaves every agent that's only ever
  // existed on the frontend (most importantly, the two default presets —
  // `DEFAULT_ACP_PRESETS` in `acpSlice.ts` — merged into `agentBackend`
  // without ever going through `saveAcpAgentConfig`) permanently
  // undiscovered: the picker shows their bare agent row forever, only ever
  // "breaking down" into actual models for the rest of that live ACP
  // session once the user selects one and a real connection happens to
  // report its options back. Runs once per agent id that's missing from the
  // catalog — a no-op for anything already known, so this doesn't repeat
  // work Rust's own refresh already does. Gated on the query's first fetch
  // having actually resolved (`isSuccess`, not just checking `data`, which
  // is `[]` both before that first fetch *and* once it's genuinely empty) —
  // otherwise every launch would misread "haven't checked yet" as "unknown
  // agent" and fire a redundant discovery for something Rust's own refresh
  // already has covered from disk.
  useEffect(() => {
    if (!acpCatalogQuery.isSuccess) return;
    const catalog = acpCatalogQuery.data;
    for (const agent of agentBackend.acpAgents) {
      if (!catalog.some((entry) => entry.id === agent.id)) {
        fetchAcpModelsFor(agent.id);
      }
    }
  }, [
    agentBackend.acpAgents,
    acpCatalogQuery.isSuccess,
    acpCatalogQuery.data,
    fetchAcpModelsFor,
  ]);

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

  useEffect(() => {
    initializeStartupSession();
  }, [initializeStartupSession]);

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
