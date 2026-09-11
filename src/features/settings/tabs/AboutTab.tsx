import { getIdentifier, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import Logo from "../../../ui/Logo";

const GITHUB_URL = "https://github.com/patheticGeek/ai-leash";
const WEBSITE_URL = "https://patheticgeek.dev";

export default function AboutTab() {
  const [info, setInfo] = useState<{
    version: string;
    identifier: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([getVersion(), getIdentifier()]).then(([version, identifier]) =>
      setInfo({ version, identifier }),
    );
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Logo className="h-14 w-auto" />
      <div className="text-xs text-zinc-600">
        v{info?.version ?? "…"} ({__COMMIT_HASH__}
        {import.meta.env.DEV ? " dev" : ""}) · {info?.identifier ?? "…"}
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openUrl(GITHUB_URL)}
        >
          <ExternalLink size={13} />
          source code
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openUrl(WEBSITE_URL)}
        >
          <ExternalLink size={13} />
          my website
        </Button>
      </div>
    </div>
  );
}
