import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { HighlightToken } from "@getpaseo/highlight";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import type { WorkspaceFileLocation } from "@/workspace/file-open";
import type { EditorVisualTheme } from "../editor/extensions.web";
import { isTargetLine, resolveTargetLineRange, TARGET_LINE_FLASH_MS } from "../target-line";
import { FilePanelLoading } from "../../loading";
import type { SourcePresentation } from "./presentation";
import { buildSourceLines } from "./source-lines";

interface FileSourceViewProps {
  content: string;
  filename: string;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  presentation: Exclude<SourcePresentation, "unsupported">;
  theme: EditorVisualTheme;
}

/** Lines past the opening line highlighted before the rest of a large file. */
const FIRST_LINES = 200;

/**
 * A virtualized, read-only source view. Shows Loading until the lines around the opening line are
 * highlighted; the rest highlight in the background. A changed file keeps showing the previous
 * lines until its own are ready.
 */
export function FileSourceView({
  content,
  filename,
  location,
  navigationRevision,
  presentation,
}: FileSourceViewProps) {
  const listRef = useRef<FlatList<HighlightToken[]>>(null);
  const [lines, setLines] = useState<HighlightToken[][] | null>(null);
  // Navigating within the file does not rebuild its lines; a new build starts at the latest line.
  const openingLine = useRef(location.lineStart);
  useEffect(() => {
    openingLine.current = location.lineStart;
  });
  useEffect(() => {
    const firstLines = (openingLine.current ?? 1) + FIRST_LINES;
    return buildSourceLines({ content, filename, presentation, firstLines }, setLines);
  }, [content, filename, presentation]);
  const lineCount = lines?.length ?? 0;
  useEffect(() => {
    if (!location.lineStart || lineCount === 0) return;
    listRef.current?.scrollToIndex({
      index: Math.min(location.lineStart - 1, lineCount - 1),
      animated: false,
      viewPosition: 0.5,
    });
  }, [lineCount, location.lineStart, navigationRevision]);
  const targetRange = useMemo(
    () =>
      resolveTargetLineRange(
        { lineStart: location.lineStart, lineEnd: location.lineEnd },
        lineCount,
      ),
    [lineCount, location.lineEnd, location.lineStart],
  );
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    setFlashing(Boolean(location.lineStart));
    if (!location.lineStart) return;
    const timer = setTimeout(() => setFlashing(false), TARGET_LINE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [location.lineEnd, location.lineStart, navigationRevision]);
  const renderItem = useCallback<ListRenderItem<HighlightToken[]>>(
    ({ item, index }) => {
      const number = index + 1;
      const targeted = isTargetLine(targetRange, number);
      return (
        <SourceLineView
          tokens={item}
          number={number}
          targeted={targeted}
          flashKey={targeted && flashing ? navigationRevision : null}
        />
      );
    },
    [flashing, navigationRevision, targetRange],
  );
  if (!lines) return <FilePanelLoading />;
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

interface SourceLineProps {
  tokens: HighlightToken[];
  number: number;
  targeted: boolean;
  flashKey: number | null;
}

// Finishing the highlight replaces every line; the lines already highlighted stay as they were.
const SourceLineView = memo(function SourceLineView({
  tokens,
  number,
  targeted,
  flashKey,
}: SourceLineProps) {
  // A token's offset in its line identifies it; its text and style can repeat.
  let offset = 0;
  return (
    <View style={[styles.line, targeted && styles.targetLine]}>
      {flashKey === null ? null : <TargetLineFlash key={flashKey} />}
      <Text style={styles.gutter}>{number}</Text>
      <Text selectable style={styles.text}>
        {tokens.map((token) => {
          const key = offset;
          offset += token.text.length;
          return (
            <Text key={key} style={syntaxTokenStyleFor(token.style)}>
              {token.text}
            </Text>
          );
        })}
      </Text>
    </View>
  );
}, sameSourceLine);

function sameSourceLine(previous: SourceLineProps, next: SourceLineProps): boolean {
  return (
    previous.number === next.number &&
    previous.targeted === next.targeted &&
    previous.flashKey === next.flashKey &&
    previous.tokens.length === next.tokens.length &&
    previous.tokens.every(
      (token, index) =>
        token.text === next.tokens[index].text && token.style === next.tokens[index].style,
    )
  );
}

function sourceLineKey(_tokens: HighlightToken[], index: number): string {
  return String(index);
}

function sourceLineLayout(_data: ArrayLike<HighlightToken[]> | null | undefined, index: number) {
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

const flashStyles = RNStyleSheet.create({ fill: RNStyleSheet.absoluteFill });

const styles = StyleSheet.create((theme) => ({
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
