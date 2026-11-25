import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import { useQueries, useQuery } from "@tanstack/react-query";
import { FileText, Folder, Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { qk } from "../../../data/keys";
import { api, type DirEntryInfo } from "../../../lib/tauriApi";
import { useActiveCheckoutPath } from "../../../lib/useActiveCheckoutPath";
import { useAppStore } from "../../../store";
import { useFsDir } from "./useFsDir";

const label = (text: string) => <Text maxLines={1}>{text}</Text>;

// Placed as an unloaded folder's only child. `TreeList` keeps expansion to
// itself and only renders a row's children while it's expanded, so this
// mounting *is* the folder being opened: it asks for the listing then.
function LoadOnMount({
  path,
  onLoad,
}: {
  path: string;
  onLoad: (path: string) => void;
}) {
  useEffect(() => onLoad(path), [path, onLoad]);
  return (
    <Text type="supporting" color="secondary">
      Loading…
    </Text>
  );
}

function relativeDir(checkoutPath: string, path: string): string {
  const rel = path.startsWith(checkoutPath)
    ? path.slice(checkoutPath.length).replace(/^[/\\]/, "")
    : path;
  const cut = Math.max(rel.lastIndexOf("/"), rel.lastIndexOf("\\"));
  return cut > 0 ? rel.slice(0, cut) : "";
}

function Files({ checkoutPath }: { checkoutPath: string }) {
  const openFile = useAppStore((s) => s.openFile);
  const activePath = useAppStore((s) => s.activePath);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // Folders opened at least once — their listings stay loaded (and kept
  // fresh by `useFsChangeInvalidator`) while they're collapsed again.
  const [opened, setOpened] = useState<string[]>([]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(id);
  }, [query]);

  const onLoad = useCallback(
    (path: string) =>
      setOpened((prev) => (prev.includes(path) ? prev : [...prev, path])),
    [],
  );

  const { data: rootEntries } = useFsDir(checkoutPath);
  const listings = useQueries({
    queries: opened.map((path) => ({
      queryKey: qk.fsDir(checkoutPath, path),
      queryFn: () => api.listDir(checkoutPath, path),
    })),
  });
  const loaded = new Map<string, DirEntryInfo[]>();
  opened.forEach((path, i) => {
    const data = listings[i]?.data;
    if (data) loaded.set(path, data);
  });

  const search = useQuery({
    queryKey: qk.fileSearch(checkoutPath, debounced),
    queryFn: () => api.searchFiles(checkoutPath, debounced),
    enabled: debounced !== "",
  });

  function fileItem(entry: DirEntryInfo, description?: string) {
    return {
      id: entry.path,
      label: label(entry.name),
      description,
      startContent: <Icon icon={FileText} size="xsm" />,
      isSelected: entry.path === activePath,
      onClick: () => openFile(entry.path, entry.name),
    } satisfies TreeListItemData;
  }

  function toItem(entry: DirEntryInfo): TreeListItemData {
    if (!entry.isDir) return fileItem(entry);
    const entries = loaded.get(entry.path);
    let children: TreeListItemData[];
    if (!entries) {
      children = [
        {
          id: `${entry.path}\0loading`,
          label: <LoadOnMount path={entry.path} onLoad={onLoad} />,
        },
      ];
    } else if (entries.length === 0) {
      children = [
        {
          id: `${entry.path}\0empty`,
          label: (
            <Text type="supporting" color="secondary">
              Empty
            </Text>
          ),
          isDisabled: true,
        },
      ];
    } else {
      children = entries.map(toItem);
    }
    return {
      id: entry.path,
      label: label(entry.name),
      startContent: <Icon icon={Folder} size="xsm" />,
      children,
    };
  }

  let tree: ReactNode;
  if (debounced) {
    const results = search.data ?? [];
    tree = search.isPending ? null : results.length === 0 ? (
      <Text type="supporting" color="secondary">
        No files match “{debounced}”
      </Text>
    ) : (
      <TreeList
        density="compact"
        variant="noGuides"
        items={results.map((entry) =>
          fileItem(entry, relativeDir(checkoutPath, entry.path) || undefined),
        )}
      />
    );
  } else {
    tree = (
      <TreeList density="compact" items={(rootEntries ?? []).map(toItem)} />
    );
  }

  return (
    <VStack padding={4} gap={2}>
      <TextInput
        label="Search files"
        isLabelHidden
        size="sm"
        value={query}
        onChange={setQuery}
        placeholder="Search files"
        startIcon={Search}
      />
      {tree}
    </VStack>
  );
}

// The side panel's Files tab: the ide template's explorer — a search box
// over a compact `TreeList`. The tree follows whichever checkout the focused
// conversation is pinned to (primary or worktree), not just whichever
// project is globally "open" — see `commands.rs`'s `list_dir` doc comment.
// Search matches paths across the whole checkout (`search_files`), not just
// the folders opened so far.
export default function FileTree() {
  const checkoutPath = useActiveCheckoutPath();
  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0} isScrollable>
          {/* Keyed so a different checkout starts with every folder shut. */}
          {checkoutPath && (
            <Files key={checkoutPath} checkoutPath={checkoutPath} />
          )}
        </LayoutContent>
      }
    />
  );
}
