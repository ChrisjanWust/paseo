import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet as RNStyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { highlightCode, type HighlightToken } from "@getpaseo/highlight";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import type { WorkspaceFileLocation } from "@/workspace/file-open";
import type { EditorVisualTheme } from "../editor/extensions.web";
import { isTargetLine, resolveTargetLineRange, TARGET_LINE_FLASH_MS } from "../target-line";
import { selectSourcePresentation } from "./presentation";

interface FileSourceViewProps {
  content: string;
  filename: string;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  size: number;
  theme: EditorVisualTheme;
  tooLargeMessage: string;
}

interface SourceLine {
  number: number;
  tokens: HighlightToken[];
}

export function FileSourceView({
  content,
  filename,
  location,
  navigationRevision,
  size,
  tooLargeMessage,
}: FileSourceViewProps) {
  const presentation = selectSourcePresentation({ size, platform: "native" });
  if (presentation === "unsupported") {
    return (
      <View style={styles.unsupported} testID="file-source-too-large">
        <Text style={styles.unsupportedText}>{tooLargeMessage}</Text>
      </View>
    );
  }
  return (
    <VirtualizedSource
      content={content}
      filename={filename}
      location={location}
      navigationRevision={navigationRevision}
      presentation={presentation}
    />
  );
}

function VirtualizedSource({
  content,
  filename,
  location,
  navigationRevision,
  presentation,
}: Omit<FileSourceViewProps, "size" | "theme" | "tooLargeMessage"> & {
  presentation: "highlighted" | "plain";
}) {
  const listRef = useRef<FlatList<SourceLine>>(null);
  const lines = useMemo(() => {
    if (presentation === "highlighted")
      return highlightCode(content, filename).map((tokens, index) => ({
        number: index + 1,
        tokens,
      }));
    return content
      .split("\n")
      .map((text, index) => ({ number: index + 1, tokens: [{ text, style: null }] }));
  }, [content, filename, presentation]);
  const targetRange = useMemo(
    () =>
      resolveTargetLineRange(
        { lineStart: location.lineStart, lineEnd: location.lineEnd },
        lines.length,
      ),
    [lines.length, location.lineEnd, location.lineStart],
  );
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!location.lineStart) return;
    listRef.current?.scrollToIndex({
      index: Math.min(location.lineStart - 1, lines.length - 1),
      animated: false,
      viewPosition: 0.5,
    });
  }, [lines.length, location.lineStart, navigationRevision]);
  useEffect(() => {
    setFlashing(Boolean(location.lineStart));
    if (!location.lineStart) return;
    const timer = setTimeout(() => setFlashing(false), TARGET_LINE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [location.lineEnd, location.lineStart, navigationRevision]);
  const renderItem = useCallback<ListRenderItem<SourceLine>>(
    ({ item }) => {
      const targeted = isTargetLine(targetRange, item.number);
      return (
        <SourceLineView
          line={item}
          targeted={targeted}
          flashKey={targeted && flashing ? navigationRevision : null}
        />
      );
    },
    [flashing, navigationRevision, targetRange],
  );
  return (
    <FlatList
      ref={listRef}
      data={lines}
      keyExtractor={sourceLineKey}
      initialNumToRender={24}
      windowSize={9}
      getItemLayout={sourceLineLayout}
      renderItem={renderItem}
    />
  );
}

function SourceLineView({
  line,
  targeted,
  flashKey,
}: {
  line: SourceLine;
  targeted: boolean;
  flashKey: number | null;
}) {
  return (
    <View style={[styles.line, targeted && styles.targetLine]}>
      {flashKey === null ? null : <TargetLineFlash key={flashKey} />}
      <Text style={styles.gutter}>{line.number}</Text>
      <Text selectable style={styles.text}>
        {line.tokens.map((token) => (
          <Text key={`${token.style}:${token.text}`} style={syntaxTokenStyleFor(token.style)}>
            {token.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

function sourceLineKey(line: SourceLine): string {
  return String(line.number);
}

function sourceLineLayout(_data: ArrayLike<SourceLine> | null | undefined, index: number) {
  return { length: 20, offset: index * 20, index };
}

// Reanimated and Unistyles must not drive the same node, so the animated
// wrapper stays on plain RN styles and the themed color lives on its child.
function TargetLineFlash() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withDelay(
      TARGET_LINE_FLASH_MS * 0.3,
      withTiming(0, { duration: TARGET_LINE_FLASH_MS * 0.7 }),
    );
  }, [opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" style={[flashStyles.fill, animatedStyle]}>
      <View style={styles.targetLineFlash} />
    </Animated.View>
  );
}

const flashStyles = RNStyleSheet.create({ fill: RNStyleSheet.absoluteFillObject });

const styles = StyleSheet.create((theme) => ({
  unsupported: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  unsupportedText: { color: theme.colors.foregroundMuted, textAlign: "center" },
  line: { flexDirection: "row", minHeight: theme.fontSize.code * 1.45 },
  // surface2/surface3 sit just above surface0: lighter on dark themes, darker on light ones.
  targetLine: { backgroundColor: theme.colors.surface2 },
  targetLineFlash: { flex: 1, backgroundColor: theme.colors.surface3 },
  gutter: {
    width: 56,
    paddingRight: theme.spacing[3],
    textAlign: "right",
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
  },
  text: {
    flex: 1,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * 1.45,
  },
}));
