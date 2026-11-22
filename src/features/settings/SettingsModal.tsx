import { SideNav, SideNavItem } from "@astryxdesign/core/SideNav";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[620px] w-[840px] max-w-[calc(100%-2rem)] flex-col gap-0 p-0 sm:max-w-[840px]">
        <div className="flex items-center justify-between px-4 py-3">
          <DialogTitle className="text-base font-medium text-zinc-100">
            Settings
          </DialogTitle>
        </div>
        <div className="flex min-h-0 flex-1">
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
          <div className="min-w-0 flex-1 overflow-auto p-4 text-base">
            {activeSection === "agents" && <AgentsSettingsTab />}
            {activeSection === "preferences" && <PreferencesSettingsTab />}
            {activeSection === "crashlog" && <CrashLogTab />}
            {activeSection === "about" && <AboutTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
