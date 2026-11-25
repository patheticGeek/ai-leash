// About: the wordmark and tagline, then a Build card (version, commit, app
// id) and a Links card (source, website), opened in the system browser.
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { getIdentifier, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ExternalLink,
  Fingerprint,
  FolderGit2,
  GitCommitHorizontal,
  Globe,
  Tag,
} from "lucide-react";
import { useEffect, useState } from "react";
import Logo from "../../../ui/Logo";
import { SettingsCard, SettingsRow } from "../SettingsCard";

const GITHUB_URL = "https://github.com/patheticGeek/ai-leash";
const WEBSITE_URL = "https://patheticgeek.dev";

function OpenButton({ label, url }: { label: string; url: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      label={label}
      icon={<Icon icon={ExternalLink} size="sm" />}
      onClick={() => void openUrl(url)}
    />
  );
}

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

  const value = (text: string) => <Text color="secondary">{text}</Text>;

  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <Logo size="lg" />
        <Text color="secondary">
          An agentic harness for local and external coding agents
        </Text>
      </VStack>
      <SettingsCard title="Build">
        <SettingsRow
          title="Version"
          icon={Tag}
          control={value(info?.version ?? "…")}
        />
        <SettingsRow
          title="Commit"
          icon={GitCommitHorizontal}
          control={value(
            `${__COMMIT_HASH__}${import.meta.env.DEV ? " (dev)" : ""}`,
          )}
        />
        <SettingsRow
          title="App id"
          icon={Fingerprint}
          control={value(info?.identifier ?? "…")}
        />
      </SettingsCard>
      <SettingsCard title="Links">
        <SettingsRow
          title="Source code"
          icon={FolderGit2}
          description="github.com/patheticGeek/ai-leash"
          control={<OpenButton label="Open" url={GITHUB_URL} />}
        />
        <SettingsRow
          title="Website"
          icon={Globe}
          description="patheticgeek.dev"
          control={<OpenButton label="Open" url={WEBSITE_URL} />}
        />
      </SettingsCard>
    </VStack>
  );
}
