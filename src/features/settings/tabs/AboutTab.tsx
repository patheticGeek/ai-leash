import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getIdentifier, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
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
    <Center height="100%">
      <VStack gap={5} hAlign="center">
        <Logo size="lg" />
        <Text size="sm" color="secondary" justify="center">
          v{info?.version ?? "…"} ({__COMMIT_HASH__}
          {import.meta.env.DEV ? " dev" : ""}) · {info?.identifier ?? "…"}
        </Text>
        <HStack gap={2}>
          <Button
            variant="secondary"
            size="sm"
            label="source code"
            icon={<ExternalLink size={13} />}
            onClick={() => openUrl(GITHUB_URL)}
          />
          <Button
            variant="secondary"
            size="sm"
            label="my website"
            icon={<ExternalLink size={13} />}
            onClick={() => openUrl(WEBSITE_URL)}
          />
        </HStack>
      </VStack>
    </Center>
  );
}
