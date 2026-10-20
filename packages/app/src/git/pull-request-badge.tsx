import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ExternalLink } from "lucide-react-native";
import { getForgePresentation, normalizeForge } from "@/git/forge";
import type { PrBadgeModel } from "@/git/pr-hint";
import { PullRequestStateIcon } from "@/git/pull-request-state-icon";
import type { Theme } from "@/styles/theme";

const ThemedExternalLink = withUnistyles(ExternalLink);
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });

const PR_STATE_LABEL_KEYS = {
  merged: "workspace.git.pr.states.merged",
  closed: "workspace.git.pr.states.closed",
} as const;

/**
 * The glyph and number of a change-request badge, without the container around them. The
 * sidebar wraps it in a link that opens the change request; the command center wraps it in a
 * plain view, because there the whole row is the press target.
 *
 * `hovered` swaps the state glyph for an external-link arrow. Only pass it from a container that
 * actually navigates to the change request.
 */
export function PullRequestBadgeContent({
  badge,
  iconSize,
  hovered = false,
  showNumberPrefix = false,
}: {
  badge: PrBadgeModel;
  iconSize: number;
  hovered?: boolean;
  /** Prefix the number the way the forge does ("#" on GitHub, "!" on GitLab). */
  showNumberPrefix?: boolean;
}) {
  const { t } = useTranslation();
  const prefix = showNumberPrefix
    ? getForgePresentation(normalizeForge(badge.forge)).numberPrefix
    : "";
  return (
    <>
      {hovered ? (
        <ThemedExternalLink size={iconSize} uniProps={foregroundMapping} />
      ) : (
        <PullRequestStateIcon state={badge.state} size={iconSize} />
      )}
      <Text style={hovered ? styles.textHovered : styles.text} numberOfLines={1}>
        {prefix}
        {badge.number}
        {/* An open change request is the unremarkable case and says nothing extra; a merged
            or closed one is why the row still looks like it has work in it. */}
        {badge.state === "open" ? "" : ` ${t(PR_STATE_LABEL_KEYS[badge.state])}`}
      </Text>
    </>
  );
}

/** Accessible name for a container drawing `PullRequestBadgeContent`. */
export function usePullRequestBadgeAccessibilityLabel(badge: PrBadgeModel): string {
  const { t } = useTranslation();
  return t("workspace.git.pr.accessibility.pullRequest", {
    number: badge.number,
    context: getForgePresentation(normalizeForge(badge.forge)).changeRequestContext,
  });
}

const styles = StyleSheet.create((theme) => ({
  text: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 16,
    flexShrink: 0,
  },
  textHovered: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 16,
    flexShrink: 0,
  },
}));
