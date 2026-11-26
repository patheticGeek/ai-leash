// Settings, on the settings-dialog template: a 1120-wide Dialog (padding 0,
// one fixed height) holding a Layout with the SideNav rail — Heading 4 title,
// a search box in `topContent`, one SideNavSection per group — and a
// padding-4 scrolling pane with a sticky close button, the panel heading and
// the panel's SettingsCards. Typing in the search swaps the nav for a results
// list (the template's combobox + listbox pattern); picking one opens its
// panel. The narrow (phone) shell of the template is left out: this is a
// desktop window.
import { Dialog } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { ListItem } from "@astryxdesign/core/List";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight, Search } from "lucide-react";
import {
  type ComponentProps,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { useDiscardGuard } from "../../hooks/useDiscardGuard";
import { useAppStore } from "../../store";
import {
  PANEL_GROUPS,
  type PanelId,
  panelConfig,
  SEARCHABLE_SETTINGS,
  type SearchableSetting,
  settingMatchesSearch,
} from "./panels";
import { settingsPanel } from "./SettingsCard";
import AboutTab from "./tabs/AboutTab";
import AgentsSettingsTab from "./tabs/AgentsSettingsTab";
import ChatSettingsTab from "./tabs/ChatSettingsTab";
import CrashLogTab from "./tabs/CrashLogTab";
import DebugSettingsTab from "./tabs/DebugSettingsTab";
import EditorSettingsTab from "./tabs/EditorSettingsTab";
import FontsSettingsTab from "./tabs/FontsSettingsTab";

const styles = stylex.create({
  sideNav: { flexShrink: 0 },
  // Neither SideNav nor SideNavSection sets a gap; without this the groups
  // read as one long list.
  sideNavSection: { paddingBlock: spacingVars["--spacing-2"] },
  // The pinned close control: first in the scrolling column, zero height, so
  // it overlays the heading's line and stays pinned for the whole scroll.
  closeAnchor: {
    position: "sticky",
    insetBlockStart: 0,
    zIndex: 1,
    height: 0,
  },
  closeBacking: {
    display: "flex",
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
  },
  // One height for every panel, so switching panels doesn't resize the
  // dialog; the panels scroll inside it.
  shell: { height: "min(800px, calc(100dvh - 2rem))" },
});

const RESULTS_ID = "settings-search-results";

// Settings save as they change; the one exception is the Agents panel's
// Add / Edit form, which reports whether it holds unsaved input.
function PanelBody({
  panel,
  onDirtyChange,
}: {
  panel: PanelId;
  onDirtyChange: (dirty: boolean) => void;
}) {
  switch (panel) {
    case "agents":
      return <AgentsSettingsTab onDirtyChange={onDirtyChange} />;
    case "chat":
      return <ChatSettingsTab />;
    case "fonts":
      return <FontsSettingsTab />;
    case "editor":
      return <EditorSettingsTab />;
    case "debug":
      return <DebugSettingsTab />;
    case "crashlog":
      return <CrashLogTab />;
    case "about":
      return <AboutTab />;
  }
}

/** The query, its results, and the arrow-key traversal behind
 * `aria-activedescendant`. */
function useSettingsSearch(onSelectPanel: (panel: PanelId) => void) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const normalized = query.trim().toLowerCase();
  const isActive = normalized.length > 0;

  const results = useMemo(
    () =>
      isActive
        ? SEARCHABLE_SETTINGS.filter((s) => settingMatchesSearch(s, normalized))
        : [],
    [isActive, normalized],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on a new query
  useEffect(() => setActiveIndex(0), [normalized]);

  const select = (setting: SearchableSetting) => {
    onSelectPanel(setting.panel);
    setQuery("");
  };

  const onKeyDown: ComponentProps<"input">["onKeyDown"] = (event) => {
    if (event.key === "Escape" && query) {
      // Clear before Escape reaches the Dialog: the first press empties the
      // box, only the second closes Settings.
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
      return;
    }
    if (!isActive || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) select(result);
    }
  };

  return {
    query,
    setQuery,
    isActive,
    results,
    activeIndex,
    setActiveIndex,
    select,
    onKeyDown,
    activeResultId:
      isActive && results.length > 0
        ? `${RESULTS_ID}-${activeIndex}`
        : undefined,
  };
}

type SettingsSearch = ReturnType<typeof useSettingsSearch>;

function SearchResults({ search }: { search: SettingsSearch }) {
  if (search.results.length === 0) {
    return (
      <VStack id={RESULTS_ID} gap={0.5} padding={2}>
        <Text type="label">No settings found</Text>
        <Text type="supporting" color="secondary">
          Try fonts, agents or debug.
        </Text>
      </VStack>
    );
  }
  // A plain `VStack as="ul"`, not `List`: List doesn't pass `id` / `role` /
  // `aria-label` through, and the input's `aria-controls` points here.
  return (
    <VStack
      as="ul"
      gap={0}
      id={RESULTS_ID}
      role="listbox"
      aria-label="Search results"
      isScrollable
    >
      {search.results.map((setting, index) => (
        <ListItem
          key={`${setting.panel}-${setting.title}`}
          id={`${RESULTS_ID}-${index}`}
          role="option"
          aria-selected={index === search.activeIndex}
          label={setting.title}
          description={`${panelConfig(setting.panel).label} · ${setting.description}`}
          startContent={
            <Icon icon={setting.icon} size="sm" color="secondary" />
          }
          endContent={<Icon icon={ChevronRight} size="sm" color="secondary" />}
          isSelected={index === search.activeIndex}
          onMouseEnter={() => search.setActiveIndex(index)}
          onClick={() => search.select(setting)}
        />
      ))}
    </VStack>
  );
}

function SettingsSideNav({
  titleId,
  search,
  active,
  onSelect,
}: {
  titleId: string;
  search: SettingsSearch;
  active: PanelId;
  onSelect: (panel: PanelId) => void;
}) {
  return (
    <SideNav
      aria-label="Settings sections"
      xstyle={styles.sideNav}
      header={
        <HStack gap={2} align="center" paddingInline={2} minHeight={32}>
          <Heading level={4} accessibilityLevel={1} id={titleId}>
            Settings
          </Heading>
        </HStack>
      }
      topContent={
        <TextInput
          label="Search settings"
          isLabelHidden
          placeholder="Search settings"
          size="sm"
          width="100%"
          hasClear
          startIcon={Search}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={RESULTS_ID}
          aria-expanded={search.isActive && search.results.length > 0}
          aria-activedescendant={search.activeResultId}
          value={search.query}
          onChange={search.setQuery}
          onKeyDown={search.onKeyDown}
        />
      }
    >
      {search.isActive ? (
        <SearchResults search={search} />
      ) : (
        PANEL_GROUPS.map((group) => (
          <SideNavSection
            key={group.label}
            title={group.label}
            xstyle={styles.sideNavSection}
          >
            {group.panels.map((panel) => (
              <SideNavItem
                key={panel.id}
                label={panel.label}
                // Pre-rendered so unselected icons aren't a step dimmer than
                // their labels.
                icon={<Icon icon={panel.icon} size="sm" color="primary" />}
                isSelected={panel.id === active}
                onClick={() => onSelect(panel.id)}
              />
            ))}
          </SideNavSection>
        ))
      )}
    </SideNav>
  );
}

export default function SettingsModal() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const setOpen = useAppStore((s) => s.setSettingsModalOpen);
  const [active, setActive] = useState<PanelId>("agents");
  const search = useSettingsSearch(setActive);
  const titleId = useId();
  const config = panelConfig(active);
  // A backdrop click or Escape closes it, asking first only while the
  // Agents panel's Add / Edit form holds unsaved input.
  const [formDirty, setFormDirty] = useState(false);
  const guard = useDiscardGuard(open, formDirty, () => setOpen(false));

  return (
    <>
      <Dialog
        isOpen={open}
        onOpenChange={guard.onOpenChange}
        width={1120}
        maxHeight="min(800px, calc(100dvh - 2rem))"
        padding={0}
        aria-labelledby={titleId}
      >
        <VStack xstyle={styles.shell}>
          <Layout
            start={
              <SettingsSideNav
                titleId={titleId}
                search={search}
                active={active}
                onSelect={setActive}
              />
            }
            content={
              <LayoutContent isScrollable padding={4}>
                <HStack width="100%" justify="end" xstyle={styles.closeAnchor}>
                  <HStack xstyle={styles.closeBacking}>
                    <IconButton
                      label="Close"
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon="close" size="sm" />}
                      onClick={() => setOpen(false)}
                    />
                  </HStack>
                </HStack>
                <VStack gap={4} xstyle={settingsPanel.root}>
                  <HStack gap={2} align="start">
                    <StackItem size="fill">
                      <VStack gap={0.5}>
                        <Heading level={2}>{config.label}</Heading>
                        <Text type="supporting" color="secondary">
                          {config.description}
                        </Text>
                      </VStack>
                    </StackItem>
                    {/* Keeps the column the close button floats over, so a long
                      description wraps before it. */}
                    <VStack aria-hidden="true" width={32} />
                  </HStack>
                  <PanelBody panel={active} onDirtyChange={setFormDirty} />
                </VStack>
              </LayoutContent>
            }
          />
        </VStack>
      </Dialog>
      {guard.confirm}
    </>
  );
}
