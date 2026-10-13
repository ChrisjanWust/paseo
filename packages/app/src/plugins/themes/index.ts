import type { PluginMessage } from "@getpaseo/plugin/client";
import { isPluginMessage } from "@getpaseo/plugin/client/host";
import { useMemo } from "react";
import { z } from "zod";
import type { PluginThemeContribution } from "../types";
import { useHostFeatureMap } from "@/runtime/host-features";
import {
  buildDarkSemanticColors,
  buildDarkTheme,
  buildLightSemanticColors,
  buildLightTheme,
  darkTheme,
  lightTheme,
  type Theme,
} from "@/styles/theme";
import { darkenHexColor } from "@/utils/color";
import {
  getPreferredPluginContributionHost,
  rememberPluginContributionHost,
} from "../contribution-host";
import { useInstalledPlugins } from "../registry";
import type { InstalledPlugin } from "../types";

const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Must be a hex color");

const contributionSchema: z.ZodType<PluginThemeContribution> = z.strictObject({
  id: z.string(),
  name: z.union([z.string().trim().min(1).max(60), z.custom<PluginMessage>(isPluginMessage)]),
  appearance: z.enum(["light", "dark"]),
  colors: z.strictObject({
    background: hexColorSchema,
    foreground: hexColorSchema,
    raised: hexColorSchema,
    control: hexColorSchema,
    border: hexColorSchema,
    accent: hexColorSchema.optional(),
    mutedForeground: hexColorSchema,
    ring: hexColorSchema,
  }),
});

export interface PluginThemeOption {
  id: string;
  serverId: string;
  name: string;
  swatch: string;
  theme: Theme;
}

interface PluginThemeTarget {
  serverId: string;
  contribution: PluginThemeContribution;
  plugin: InstalledPlugin;
}

// OKLab lightness step from the background down to the sidebar and top bars in dark plugin
// themes. The built-in dark themes step their sidebar down 0.015–0.029; without it the chrome
// and the content both paint `background` and merge into one surface.
const DARK_CHROME_LIGHTNESS_STEP = 0.025;

export function parsePluginThemeContribution(value: unknown): PluginThemeContribution {
  return contributionSchema.parse(value);
}

function buildDarkPluginTheme(contribution: PluginThemeContribution): Theme {
  const colors = contribution.colors;
  const accent = colors.accent ?? colors.foreground;
  const chrome = darkenHexColor(colors.background, DARK_CHROME_LIGHTNESS_STEP);
  return buildDarkTheme(
    buildDarkSemanticColors({
      surface0: colors.background,
      surface1: colors.raised,
      surface2: colors.control,
      surface3: colors.border,
      surface4: colors.ring,
      surfaceDiffEmpty: colors.raised,
      surfaceSidebar: chrome,
      surfaceChrome: chrome,
      foreground: colors.foreground,
      foregroundMuted: colors.mutedForeground,
      foregroundExtraMuted: colors.ring,
      border: colors.border,
      borderAccent: colors.border,
      accent,
      accentBright: accent,
      accentForeground: colors.background,
      destructive: darkTheme.colors.destructive,
      terminalBlack: colors.control,
      terminalBrightBlack: colors.ring,
      ring: colors.ring,
    }),
  );
}

function parseHexRgb(hex: string): [number, number, number] {
  const digits = hex.slice(1);
  const full =
    digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits.slice(0, 6);
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function mixHex(from: string, to: string, amount: number): string {
  const fromRgb = parseHexRgb(from);
  const toRgb = parseHexRgb(to);
  return `#${fromRgb
    .map((channel, index) => Math.round(channel + (toRgb[index] - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

// The light builder selects sidebar rows with surface4, and a plugin palette has only `ring` to
// fill that slot. Ring is a text-strength tone, so a selected row painted with it hides its own
// label. Step one shade past the border toward the foreground instead.
const LIGHT_SIDEBAR_SELECTED_STEP = 0.05;

function buildLightPluginTheme(contribution: PluginThemeContribution): Theme {
  const colors = contribution.colors;
  const accent = colors.accent ?? colors.foreground;
  const semanticColors = buildLightSemanticColors({
    surface0: colors.background,
    surface1: colors.raised,
    surface2: colors.control,
    surface3: colors.border,
    surface4: colors.ring,
    surfaceDiffEmpty: colors.raised,
    surfaceSidebar: colors.control,
    foreground: colors.foreground,
    foregroundMuted: colors.mutedForeground,
    foregroundExtraMuted: colors.ring,
    border: colors.border,
    borderAccent: colors.border,
    accent,
    accentBright: accent,
    accentForeground: colors.background,
    primary: colors.foreground,
    primaryForeground: colors.background,
    destructive: lightTheme.colors.destructive,
    terminalBlack: colors.foreground,
    terminalBrightBlack: colors.ring,
    ring: colors.ring,
  });
  return buildLightTheme({
    ...semanticColors,
    surfaceSidebarSelected: mixHex(colors.border, colors.foreground, LIGHT_SIDEBAR_SELECTED_STEP),
  });
}

function buildPluginTheme(contribution: PluginThemeContribution): Theme {
  return contribution.appearance === "light"
    ? buildLightPluginTheme(contribution)
    : buildDarkPluginTheme(contribution);
}

function selectTarget(id: string, targets: PluginThemeTarget[]): PluginThemeTarget {
  const preferredHost = getPreferredPluginContributionHost(id);
  return targets.find((target) => target.serverId === preferredHost) ?? targets[0];
}

export function collectPluginThemes(
  plugins: InstalledPlugin[],
  supportedHosts: ReadonlySet<string>,
): PluginThemeOption[] {
  const targetsById = new Map<string, PluginThemeTarget[]>();
  for (const plugin of plugins) {
    if (!supportedHosts.has(plugin.serverId)) continue;
    for (const contribution of plugin.themes) {
      const id = `${plugin.id}/theme/${contribution.id}`;
      const target = { serverId: plugin.serverId, contribution, plugin };
      const targets = targetsById.get(id);
      if (targets) targets.push(target);
      else targetsById.set(id, [target]);
    }
  }

  return [...targetsById].map(([id, targets]) => {
    const target = selectTarget(id, targets);
    return {
      id,
      serverId: target.serverId,
      name: target.plugin.i18n.resolve(target.contribution.name, target.plugin.locale),
      swatch: target.contribution.colors.background,
      theme: buildPluginTheme(target.contribution),
    };
  });
}

export function rememberPluginThemeHost(option: PluginThemeOption): void {
  rememberPluginContributionHost(option.id, option.serverId);
}

function supportedThemeHosts(support: ReadonlyMap<string, boolean>): Set<string> {
  const serverIds = new Set<string>();
  for (const [serverId, supported] of support) {
    if (supported) serverIds.add(serverId);
  }
  return serverIds;
}

export function usePluginThemeCatalog(): PluginThemeOption[] {
  const plugins = useInstalledPlugins();
  const serverIds = useMemo(
    () => [...new Set(plugins.map((plugin) => plugin.serverId))],
    [plugins],
  );
  // COMPAT(pluginThemes): added in v0.5.0, remove gate after 2027-08-20.
  const support = useHostFeatureMap(serverIds, "pluginThemes");
  return useMemo(
    () => collectPluginThemes(plugins, supportedThemeHosts(support)),
    [plugins, support],
  );
}
