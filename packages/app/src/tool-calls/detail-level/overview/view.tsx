import React, { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Brain, Wrench } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { ExpandableBadge } from "@/components/message";
import { ToolCallDetailsContent } from "@/components/tool-call-details";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { useRevealedText } from "@/hooks/use-revealed-text";
import type { ToolCallItem } from "@/types/stream";
import type { OverviewActivityGroup, OverviewSegment, OverviewThoughtSegment } from "./model";
import { OverviewToolCallGroupSheet } from "./sheet";

interface OverviewActivityGroupProps {
  group: OverviewActivityGroup;
  selectedSegmentId: string | null;
  onSelectedSegmentChange: (groupId: string, segmentId: string | null) => void;
  renderToolCalls: (calls: readonly ToolCallItem[]) => ReactNode;
}

const TOOL_CALL_GROUP_MAX_HEIGHT = 400;
const THOUGHT_DETAIL_MAX_HEIGHT = 400;

function joinSummaryParts(parts: string[], conjunction: string): string {
  if (parts.length === 0) {
    return "";
  }
  let joined = parts[0] ?? "";
  if (parts.length === 2) {
    joined = `${parts[0]} ${conjunction} ${parts[1]}`;
  } else if (parts.length > 2) {
    joined = `${parts.slice(0, -1).join(", ")}, ${conjunction} ${parts.at(-1)}`;
  }
  const firstCharacter = joined[0];
  return firstCharacter ? `${firstCharacter.toLocaleUpperCase()}${joined.slice(1)}` : joined;
}

function formatSegmentLabel(segment: OverviewSegment, t: TFunction): string {
  if (segment.kind === "thought") {
    return t("toolCallGroup.thinking");
  }
  const { summary } = segment;
  const parts: string[] = [];
  const entries = [
    [summary.editedFileCount, "toolCallGroup.editedFiles"],
    [summary.commandCount, "toolCallGroup.commands"],
    [summary.readFileCount, "toolCallGroup.readFiles"],
    [summary.searchCount, "toolCallGroup.searches"],
    [summary.otherToolCount, "toolCallGroup.otherTools"],
    [summary.paseoCallCount, "toolCallGroup.paseoCalls"],
  ] as const;
  for (const [count, key] of entries) {
    if (count > 0) {
      parts.push(t(`${key}.${count === 1 ? "one" : "other"}`, { count }));
    }
  }
  return joinSummaryParts(parts, t("toolCallGroup.and"));
}

// Reasoning text is paced the same way assistant text is; see @/hooks/use-revealed-text.
function ThoughtSegmentDetails({ segment }: { segment: OverviewThoughtSegment }) {
  const text = useRevealedText(segment.item.text, segment.isLoading ? "streaming" : "complete");
  const detail = useMemo(() => ({ type: "unknown" as const, input: text, output: null }), [text]);
  return (
    <View style={styles.thoughtDetail}>
      <ToolCallDetailsContent
        toolName="thinking"
        detail={detail}
        maxHeight={THOUGHT_DETAIL_MAX_HEIGHT}
      />
    </View>
  );
}

function ToolCallsScroll({ children }: { children: ReactNode }) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollToLatest = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      nestedScrollEnabled
      showsVerticalScrollIndicator
      onContentSizeChange={scrollToLatest}
    >
      {children}
    </ScrollView>
  );
}

interface SegmentChipProps {
  groupId: string;
  segment: OverviewSegment;
  isSelected: boolean;
  onSelectedSegmentChange: (groupId: string, segmentId: string | null) => void;
}

const SegmentChip = memo(function SegmentChip({
  groupId,
  segment,
  isSelected,
  onSelectedSegmentChange,
}: SegmentChipProps) {
  const { t } = useTranslation();
  const handleToggle = useCallback(() => {
    onSelectedSegmentChange(groupId, isSelected ? null : segment.id);
  }, [groupId, isSelected, onSelectedSegmentChange, segment.id]);

  return (
    <ExpandableBadge
      testID="tool-call-group-chip"
      label={formatSegmentLabel(segment, t)}
      icon={segment.kind === "thought" ? Brain : Wrench}
      isLoading={segment.isLoading}
      isExpanded={isSelected}
      onToggle={handleToggle}
      style={styles.chip}
      disableOuterSpacing
      borderlessWhenExpanded
      fitContent
    />
  );
});

function SelectedToolsSheet({
  segment,
  onClose,
  renderToolCalls,
}: {
  segment: OverviewSegment | null;
  onClose: () => void;
  renderToolCalls: (calls: readonly ToolCallItem[]) => ReactNode;
}) {
  const { t } = useTranslation();
  const tools = segment?.kind === "tools" ? segment : null;
  const label = tools ? formatSegmentLabel(tools, t) : "";
  return (
    <OverviewToolCallGroupSheet visible={tools !== null} summary={label} onClose={onClose}>
      {tools ? renderToolCalls(tools.calls) : null}
    </OverviewToolCallGroupSheet>
  );
}

/**
 * Reasoning and tool calls between two replies, laid out as a wrapping row of chips.
 * One chip is open at a time; its details render below the row. On compact layouts,
 * tool calls open in a bottom sheet and reasoning stays inline.
 */
export const OverviewActivityGroupView = memo(function OverviewActivityGroupView({
  group,
  selectedSegmentId,
  onSelectedSegmentChange,
  renderToolCalls,
}: OverviewActivityGroupProps) {
  const isCompact = useIsCompactFormFactor();
  const groupId = group.run.id;
  const selected = group.segments.find((segment) => segment.id === selectedSegmentId) ?? null;
  const closeSelection = useCallback(() => {
    onSelectedSegmentChange(groupId, null);
  }, [groupId, onSelectedSegmentChange]);

  let details: ReactNode = null;
  if (selected?.kind === "thought") {
    details = <ThoughtSegmentDetails key={selected.id} segment={selected} />;
  } else if (selected?.kind === "tools" && !isCompact) {
    details = <ToolCallsScroll>{renderToolCalls(selected.calls)}</ToolCallsScroll>;
  }

  return (
    <View testID="tool-call-group" style={styles.container}>
      <View style={styles.chipRow}>
        {group.segments.map((segment) => (
          <SegmentChip
            key={segment.id}
            groupId={groupId}
            segment={segment}
            isSelected={segment.id === selected?.id}
            onSelectedSegmentChange={onSelectedSegmentChange}
          />
        ))}
      </View>
      {details}
      {isCompact ? (
        <SelectedToolsSheet
          segment={selected}
          onClose={closeSelection}
          renderToolCalls={renderToolCalls}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  // Row gaps come from the stream layout, so the group adds no vertical margin of its own.
  container: {
    marginHorizontal: -13,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: theme.spacing[1],
    rowGap: theme.spacing[1],
  },
  chip: {
    marginHorizontal: 0,
    maxWidth: "100%",
  },
  thoughtDetail: {
    marginTop: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    overflow: "hidden",
    ...(isWeb ? { cursor: "auto" as const, userSelect: "text" as const } : {}),
  },
  scroll: {
    maxHeight: TOOL_CALL_GROUP_MAX_HEIGHT,
  },
  content: {
    paddingTop: theme.spacing[1],
    paddingHorizontal: 13,
  },
}));
