// Fonts: a family and a size for interface text and for code text, each with
// a live preview under the family row (the preferences apply app-wide as
// they change, so the preview is just ordinary Astryx text).
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Selector, type SelectorOptionType } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { CaseSensitive, Code, Type } from "lucide-react";
import { useMemo } from "react";
import { qk } from "@/data/keys";
import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  usePreference,
  useSetPreferences,
} from "../../../data/preferences";
import { api, type FontFamilyInfo } from "../../../lib/tauriApi";
import { CONTROL_WIDTH, SettingsCard, SettingsRow } from "../SettingsCard";

// The stored family is a CSS font list; "" means the built-in font. Selector
// treats "" as no selection, so the built-in option gets its own value.
const BUILTIN = "builtin";

// A family name as a CSS `font-family` entry — always quoted, so names with
// spaces or digits ("Fira Code", "3270") are valid.
function cssFamily(name: string): string {
  return `"${name.replace(/["\\]/g, "\\$&")}"`;
}

function familyOptions(
  fonts: FontFamilyInfo[],
  builtin: string,
  current: string,
  monospaceFirst: boolean,
): SelectorOptionType[] {
  const toOption = (f: FontFamilyInfo) => ({
    value: cssFamily(f.family),
    label: f.family,
  });
  const options: SelectorOptionType[] = [
    { value: BUILTIN, label: builtin, description: "Built-in" },
  ];
  // A family typed before the picker existed (a fallback list, or a font
  // that's since been uninstalled) stays selectable as itself.
  if (current && !fonts.some((f) => cssFamily(f.family) === current)) {
    options.push({ value: current, label: current, description: "Custom" });
  }
  if (monospaceFirst) {
    const mono = fonts.filter((f) => f.monospaced).map(toOption);
    const other = fonts.filter((f) => !f.monospaced).map(toOption);
    if (mono.length > 0)
      options.push({ type: "section", title: "Monospace", options: mono });
    if (other.length > 0)
      options.push({ type: "section", title: "Other", options: other });
  } else if (fonts.length > 0) {
    options.push({ type: "divider" }, ...fonts.map(toOption));
  }
  return options;
}

const SIZES = Array.from(
  { length: MAX_FONT_SIZE - MIN_FONT_SIZE + 1 },
  (_, i) => MIN_FONT_SIZE + i,
);

function sizeOptions(defaultSize: number) {
  return SIZES.map((n) => ({
    value: String(n),
    label: `${n} px${n === defaultSize ? " (default)" : ""}`,
  }));
}

function FontCard({
  kind,
  fonts,
  isLoading,
}: {
  kind: "interface" | "code";
  fonts: FontFamilyInfo[];
  isLoading: boolean;
}) {
  const isCode = kind === "code";
  const family = usePreference(isCode ? "codeFontFamily" : "uiFontFamily");
  const size = usePreference(isCode ? "codeFontSize" : "uiFontSize");
  const setPreferences = useSetPreferences();
  const builtin = isCode ? "JetBrains Mono" : "Instrument Sans";
  const defaultSize = isCode ? DEFAULT_CODE_FONT_SIZE : DEFAULT_UI_FONT_SIZE;
  const name = isCode ? "Code" : "Interface";

  const options = useMemo(
    () => familyOptions(fonts, builtin, family, isCode),
    [fonts, builtin, family, isCode],
  );

  return (
    <SettingsCard title={`${name} text`}>
      <SettingsRow
        title="Font family"
        icon={isCode ? Code : Type}
        description={
          isCode
            ? "Code blocks, inline code, tool output, terminals and the file editor."
            : "Normal text throughout the app."
        }
        control={
          <Selector
            label={`${name} font family`}
            isLabelHidden
            hasSearch
            searchPlaceholder="Search installed fonts…"
            size="sm"
            width={CONTROL_WIDTH}
            isLoading={isLoading}
            value={family || BUILTIN}
            onChange={(v) => {
              if (!v) return;
              const next = v === BUILTIN ? "" : v;
              setPreferences(
                isCode ? { codeFontFamily: next } : { uiFontFamily: next },
              );
            }}
            options={options}
          />
        }
        detail={
          isCode ? (
            <CodeBlock
              code={'const leash = useAgent({ model: "opus-5.5" });'}
              language="typescript"
              width="100%"
              size="sm"
              hasCopyButton={false}
              hasLanguageLabel={false}
            />
          ) : (
            <Card padding={3} width="100%">
              <VStack gap={1}>
                <Text type="label">
                  The quick brown fox jumps over the lazy dog
                </Text>
                <Text type="supporting" color="secondary">
                  Worked for 4m 51s · 1 thought, 4 tools used
                </Text>
              </VStack>
            </Card>
          )
        }
      />
      <SettingsRow
        title="Size"
        icon={CaseSensitive}
        description={
          isCode
            ? "Open terminals resize to fit."
            : "Sets the body text size; smaller text scales with it."
        }
        control={
          <Selector
            label={`${name} text size`}
            isLabelHidden
            size="sm"
            width={CONTROL_WIDTH}
            value={String(size)}
            onChange={(v) => {
              if (!v) return;
              const n = Number(v);
              setPreferences(isCode ? { codeFontSize: n } : { uiFontSize: n });
            }}
            options={sizeOptions(defaultSize)}
          />
        }
      />
    </SettingsCard>
  );
}

export default function FontsSettingsTab() {
  const { data: fonts, isPending } = useQuery({
    queryKey: qk.systemFonts,
    queryFn: api.listSystemFonts,
    // Installing a font mid-session is rare; a restart picks it up.
    staleTime: Number.POSITIVE_INFINITY,
  });
  const list = fonts ?? [];
  return (
    <VStack gap={5}>
      <FontCard kind="interface" fonts={list} isLoading={isPending} />
      <FontCard kind="code" fonts={list} isLoading={isPending} />
    </VStack>
  );
}
