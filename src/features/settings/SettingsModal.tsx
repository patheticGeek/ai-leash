import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { useAppStore } from "../../store";
import AboutTab from "./tabs/AboutTab";
import AgentsSettingsTab from "./tabs/AgentsSettingsTab";
import CrashLogTab from "./tabs/CrashLogTab";

// One entry per settings page — the side nav is built to hold more without
// restructuring.
type SettingsSection = "agents" | "crashlog" | "about";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "agents", label: "Agents" },
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
        <Tabs
          value={activeSection}
          onValueChange={(v) => setActiveSection(v as SettingsSection)}
          orientation="vertical"
          className="flex-1 min-h-0"
        >
          <TabsList className="h-fit w-48 shrink-0 flex-col items-stretch gap-0.5 bg-transparent p-2">
            {SECTIONS.map((section) => (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="justify-start px-2 py-2 text-left"
              >
                {section.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="agents" className="overflow-auto p-4 text-base">
            <AgentsSettingsTab />
          </TabsContent>
          <TabsContent value="crashlog" className="overflow-auto p-4 text-base">
            <CrashLogTab />
          </TabsContent>
          <TabsContent value="about" className="overflow-auto p-4 text-base">
            <AboutTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
