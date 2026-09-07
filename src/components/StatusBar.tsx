import { useAppStore } from "../store";

export default function StatusBar() {
  const providerSettings = useAppStore((s) => s.providerSettings);
  const providerConnectivity = useAppStore((s) => s.providerConnectivity);

  const providers = [
    { id: "ollama", label: "Ollama", connected: providerConnectivity.ollama ?? null },
    ...providerSettings.openAiCompatible.map((c) => ({
      id: c.id,
      label: c.label,
      connected: providerConnectivity[c.id] ?? null,
    })),
  ];

  const total = providers.length;
  const connectedCount = providers.filter((p) => p.connected === true).length;
  const anyChecked = providers.some((p) => p.connected !== null);

  const dotColor = !anyChecked
    ? "bg-zinc-600"
    : connectedCount === total
      ? "bg-emerald-500"
      : connectedCount === 0
        ? "bg-red-500"
        : "bg-amber-500";

  const tooltip = providers
    .map((p) => `${p.label}: ${p.connected === null ? "checking…" : p.connected ? "connected" : "disconnected"}`)
    .join("\n");

  return (
    <div className="flex h-6 items-center justify-between bg-[#17181c] border-t border-[#26272c] px-3 text-xs text-zinc-500">
      <span className="flex items-center gap-1.5" title={tooltip}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
        {connectedCount}/{total} provider{total === 1 ? "" : "s"} connected
      </span>
    </div>
  );
}
