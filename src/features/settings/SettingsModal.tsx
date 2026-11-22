import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutHeader, LayoutPanel } from "@astryxdesign/core/Layout";
import { SideNav, SideNavItem } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { useAppStore } from "../../store";
import AboutTab from "./tabs/AboutTab";
import AgentsSettingsTab from "./tabs/AgentsSettingsTab";
import CrashLogTab from "./tabs/CrashLogTab";
import PreferencesSettingsTab from "./tabs/PreferencesSettingsTab";

const styles = stylex.create({
  // A fixed height, so switching sections doesn't resize the dialog.
  dialog: { height: "38.75rem" },
  // The rail fills its panel and doesn't hand width back to the content.
  nav: {
    width: "100%",
    flexShrink: 0,
    backgroundColor: "transparent",
  },
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
      padding={0}
      xstyle={styles.dialog}
    >
      <Layout
        header={
          <LayoutHeader padding={4}>
            <DialogHeader
              title="Settings"
              onOpenChange={setOpen}
              hasDivider={false}
            />
          </LayoutHeader>
        }
        start={
          <LayoutPanel width="12.5rem" padding={2}>
            <SideNav xstyle={styles.nav}>
              {SECTIONS.map((section) => (
                <SideNavItem
                  key={section.id}
                  label={section.label}
                  size="lg"
                  isSelected={section.id === activeSection}
                  onClick={() => setActiveSection(section.id)}
                />
              ))}
            </SideNav>
          </LayoutPanel>
        }
        content={
          <VStack isScrollable height="100%" padding={5}>
            {activeSection === "agents" && <AgentsSettingsTab />}
            {activeSection === "preferences" && <PreferencesSettingsTab />}
            {activeSection === "crashlog" && <CrashLogTab />}
            {activeSection === "about" && <AboutTab />}
          </VStack>
        }
      />
    </Dialog>
  );
}
