import { beforeEach, describe, expect, it, vi } from "vitest";

// The store's slices read and write tab state through localStorage.
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});

const { useAppStore } = await import("./index");

const PATH = "/proj/docs/spec.md";

describe("openAgentFile", () => {
  beforeEach(() => {
    useAppStore.setState({
      activeSessionId: "on-screen",
      panelStateByConversation: {},
      chatStateByConversation: {},
      fileViewModes: {},
      defaultFileViewMode: "preview",
    });
  });

  it("adds the file to another conversation's saved side tabs, in Preview", () => {
    useAppStore.getState().openAgentFile("other", PATH);
    const s = useAppStore.getState();
    expect(s.panelStateByConversation.other).toEqual({
      panelTabs: [
        { id: `file:${PATH}`, kind: "file", path: PATH, label: "spec.md" },
      ],
      activePanelTabId: `file:${PATH}`,
    });
    expect(s.chatStateByConversation.other.activeChatTabId).toBe("primary");
    expect(s.fileViewModes[PATH]).toBe("preview");
    // Not the conversation on screen.
    expect(s.panelTabs).toEqual([]);
  });

  it("opens in Source when that's the switch the user last picked", () => {
    useAppStore.setState({ defaultFileViewMode: "source" });
    useAppStore.getState().openAgentFile("other", PATH);
    expect(useAppStore.getState().fileViewModes[PATH]).toBe("source");
  });

  it("doesn't add a second tab, and lands in Source for a line", () => {
    const { openAgentFile } = useAppStore.getState();
    openAgentFile("other", PATH);
    openAgentFile("other", PATH, 12);
    const s = useAppStore.getState();
    expect(s.panelStateByConversation.other.panelTabs).toHaveLength(1);
    expect(s.fileViewModes[PATH]).toBe("source");
  });

  it("activates the file where it already is, in the centre", () => {
    const tab = {
      id: `file:${PATH}`,
      kind: "file" as const,
      path: PATH,
      label: "spec.md",
    };
    useAppStore.setState({
      chatStateByConversation: {
        other: {
          chatTabs: [{ id: "primary", kind: "primary", label: "Agent" }, tab],
          activeChatTabId: "primary",
        },
      },
    });
    useAppStore.getState().openAgentFile("other", PATH);
    const s = useAppStore.getState();
    expect(s.chatStateByConversation.other.activeChatTabId).toBe(tab.id);
    expect(s.panelStateByConversation.other.panelTabs).toEqual([]);
  });
});
