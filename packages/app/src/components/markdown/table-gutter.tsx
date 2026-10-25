import { createContext, useCallback, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { isWeb } from "@/constants/platform";
import { readMeasuredWidth } from "@/hooks/use-container-width";

// Keeps a widened table clear of the pane edge and of the chat outline rail.
const PANE_EDGE_INSET = 48;

/** How far, per side, a top-level table may grow past the centered text column. */
export function resolveMarkdownTableGutter(input: {
  paneWidth: number;
  contentMaxWidth: number;
}): number {
  return Math.max(0, Math.floor((input.paneWidth - input.contentMaxWidth) / 2) - PANE_EDGE_INSET);
}

// Read by the web table renderer. Native keeps it at zero: the library draws native tables.
// Only renderers that opt in with `wideTables` pass it on, so cards in the stream keep their
// tables inside their box.
export const MarkdownTableGutterContext = createContext(0);

/** Measures the pane around a centered reading column and shares the table gutter with it. */
export function MarkdownTableGutterMeasure({
  contentMaxWidth,
  children,
}: {
  contentMaxWidth: number;
  children: ReactNode;
}) {
  const [paneWidth, setPaneWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    // A retained tab hidden with display: none reports 0; keep the last real width.
    const width = readMeasuredWidth(event);
    if (width !== null) setPaneWidth(width);
  }, []);
  if (!isWeb) return children;
  const gutter = resolveMarkdownTableGutter({ paneWidth, contentMaxWidth });
  return (
    <>
      <View style={paneMeasureStyle} pointerEvents="none" onLayout={handleLayout} />
      <MarkdownTableGutterContext value={gutter}>{children}</MarkdownTableGutterContext>
    </>
  );
}

const paneMeasureStyle: ViewStyle = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 };
