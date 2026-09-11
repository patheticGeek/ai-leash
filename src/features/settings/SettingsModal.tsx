import { X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../../store";
import Button from "../../ui/Button";
import AboutTab from "./tabs/AboutTab";
import AcpSettingsTab from "./tabs/AcpSettingsTab";
import CrashLogTab from "./tabs/CrashLogTab";
import ProviderSettingsTab from "./tabs/ProviderSettingsTab";

// One entry per settings page — the side nav is built to hold more without
// restructuring.
type SettingsSection = "providers" | "acp" | "crashlog" | "about";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "providers", label: "Providers" },
  { id: "acp", label: "Agents" },
  { id: "crashlog", label: "Crash log" },
  { id: "about", label: "About" },
];

export default function SettingsModal() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const setOpen = useAppStore((s) => s.setSettingsModalOpen);
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("providers");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[620px] w-[840px] flex-col rounded-xl bg-[#141518] shadow-2xl shadow-black/60 ring-1 ring-white/5">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-base font-medium text-zinc-100">Settings</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            title="Close"
          >
            <X size={16} />
          </Button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-48 shrink-0 space-y-0.5 p-2">
            {SECTIONS.map((section) => (
              <Button
                key={section.id}
                variant="unstyled"
                size="none"
                onClick={() => setActiveSection(section.id)}
                className={`block w-full rounded-md px-2 py-2 text-left text-sm ${
                  activeSection === section.id
                    ? "bg-[#26272c] text-zinc-100"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                {section.label}
              </Button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4 text-base">
            {activeSection === "providers" && <ProviderSettingsTab />}
            {activeSection === "acp" && <AcpSettingsTab />}
            {activeSection === "crashlog" && <CrashLogTab />}
            {activeSection === "about" && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
