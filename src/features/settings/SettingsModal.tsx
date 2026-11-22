import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { SideNav, SideNavItem } from "@astryxdesign/core/SideNav";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { useAppStore } from "../../store";
import AboutTab from "./tabs/AboutTab";
import AgentsSettingsTab from "./tabs/AgentsSettingsTab";
import CrashLogTab from "./tabs/CrashLogTab";
import PreferencesSettingsTab from "./tabs/PreferencesSettingsTab";

const styles = stylex.create({
  // A fixed-width rail; the open section takes the rest of the dialog.
  nav: {
    width: "12rem",
    flexShrink: 0,
  },
  // A fixed height, so switching sections doesn't resize the dialog.
  dialog: { height: "38.75rem" },
});

// One entry per settings page — the side nav is built to hold more without
// restructuring.
type SettingsSection = "agents" | "preferences" | "crashlog" | "about";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "agents", label: "Agents" },
  { id: "preferences", label: "Preferences" },
  { id: "crashlog", label: "Crash log" },
  { id: "about", label: "About" },
];

export default function SettingsModal() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const setOpen = useAppStore((s) => s.setSettingsModalOpen);
  const [activeSection, setActiveSection] = useState<SettingsSection>("agents");

  return (
    <Dialog
      isOpen={open}
      onOpenChange={setOpen}
      width="52.5rem"
      maxHeight="90dvh"
      xstyle={styles.dialog}
    >
      <Layout
        header={
          <DialogHeader
            title="Settings"
            onOpenChange={setOpen}
            hasDivider={false}
          />
        }
        start={
          <LayoutPanel>
            <SideNav xstyle={styles.nav}>
              {SECTIONS.map((section) => (
                <SideNavItem
                  key={section.id}
                  label={section.label}
                  isSelected={section.id === activeSection}
                  onClick={() => setActiveSection(section.id)}
                />
              ))}
            </SideNav>
          </LayoutPanel>
        }
        content={
          <LayoutContent>
            {activeSection === "agents" && <AgentsSettingsTab />}
            {activeSection === "preferences" && <PreferencesSettingsTab />}
            {activeSection === "crashlog" && <CrashLogTab />}
            {activeSection === "about" && <AboutTab />}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
