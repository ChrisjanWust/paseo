import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ScrollView, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import type { ASTNode } from "react-native-markdown-display";
import { MarkdownTableCellText } from "@/components/markdown-text-selection";
import { isWeb } from "@/constants/platform";
import {
  measureMarkdownTableColumns,
  placeMarkdownTable,
  resolveMarkdownTableColumnWidths,
  resolveMarkdownTableGutter,
  type MarkdownTableColumnBounds,
} from "./table-layout";

type MarkdownTableStyles = Record<string, ViewStyle & { [key: string]: unknown }>;
type DataSet = ComponentProps<typeof View>["dataSet"];

// Until the table has measured the column it sits in, cells share the row by these weights.
const UNMEASURED_AVAILABLE_WIDTH = 640;

// How far past the text column, per side, a table may grow. Chat and the Markdown file preview
// measure it from the space between the centered text column and the pane edge. Only
// top-level tables opt in; tables in cards, quotes, and lists stay inside their box. Native
// keeps it at zero: Android does not hit-test children that overhang their parent.
const MarkdownTableGutterContext = createContext(0);

export function MarkdownTableGutterMeasure({
  contentMaxWidth,
  children,
}: {
  contentMaxWidth: number;
  children: ReactNode;
}) {
  const [paneWidth, setPaneWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPaneWidth(event.nativeEvent.layout.width);
  }, []);
  const gutter = isWeb ? resolveMarkdownTableGutter({ paneWidth, contentMaxWidth }) : 0;
  return (
    <>
      <View style={paneMeasureStyle} pointerEvents="none" onLayout={handleLayout} />
      <MarkdownTableGutterContext value={gutter}>{children}</MarkdownTableGutterContext>
    </>
  );
}

const paneMeasureStyle: ViewStyle = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 };

// For boxes that render markdown as its own document, such as a <details> body or the text
// beside inline images, whose top-level tables would otherwise grow out of the box.
export function MarkdownTableGutterReset({ children }: { children: ReactNode }) {
  return <MarkdownTableGutterContext value={0}>{children}</MarkdownTableGutterContext>;
}

interface MarkdownTableColumns {
  widths: readonly number[] | null;
  weights: readonly number[];
}

const MarkdownTableColumnsContext = createContext<MarkdownTableColumns | null>(null);

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function measureColumns(node: ASTNode, styles: MarkdownTableStyles): MarkdownTableColumnBounds[] {
  const td = styles.td ?? {};
  return measureMarkdownTableColumns(node, {
    fontSize: readNumber(td.fontSize, 15),
    cellPaddingX: readNumber(td.paddingHorizontal, readNumber(td.padding, 0)),
    cellBorderWidth: readNumber(td.borderRightWidth, 0),
  });
}

export function MarkdownTable({
  node,
  styles,
  dataSet,
  testID,
  growIntoGutter = false,
  children,
}: {
  node: ASTNode;
  styles: MarkdownTableStyles;
  dataSet?: DataSet;
  testID?: string;
  growIntoGutter?: boolean;
  children: ReactNode;
}) {
  const paneGutter = useContext(MarkdownTableGutterContext);
  const gutter = growIntoGutter ? paneGutter : 0;
  const [columnWidth, setColumnWidth] = useState<number | null>(null);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setColumnWidth(width);
  }, []);

  const bounds = useMemo(() => measureColumns(node, styles), [node, styles]);
  const tableBorderWidth = readNumber(styles.table?.borderWidth, 0);
  const placement = useMemo(
    () =>
      columnWidth === null
        ? null
        : placeMarkdownTable({ columns: bounds, columnWidth, gutter, tableBorderWidth }),
    [bounds, columnWidth, gutter, tableBorderWidth],
  );
  const columns = useMemo<MarkdownTableColumns>(
    () => ({
      widths: placement?.columnWidths ?? null,
      weights: resolveMarkdownTableColumnWidths(bounds, UNMEASURED_AVAILABLE_WIDTH),
    }),
    [bounds, placement],
  );

  const scrolls = placement?.scrolls ?? false;
  const tableStyle = useMemo(
    () => [
      styles._VIEW_SAFE_table,
      placement ? { width: placement.tableWidth } : null,
      placement && !scrolls ? { marginLeft: placement.offsetX } : null,
    ],
    [placement, scrolls, styles],
  );
  const scrollStyle = useMemo(
    () => (placement ? { width: placement.viewportWidth, marginLeft: placement.offsetX } : null),
    [placement],
  );

  const table = (
    <View style={tableStyle} dataSet={dataSet} testID={testID}>
      {children}
    </View>
  );

  return (
    <View style={wrapperStyle} onLayout={handleLayout}>
      <MarkdownTableColumnsContext value={columns}>
        {scrolls ? (
          <ScrollView horizontal style={scrollStyle} showsHorizontalScrollIndicator>
            {table}
          </ScrollView>
        ) : (
          table
        )}
      </MarkdownTableColumnsContext>
    </View>
  );
}

const wrapperStyle: ViewStyle = { alignSelf: "stretch" };

export function MarkdownTableCell({
  node,
  parent,
  style,
  dataSet,
  children,
}: {
  node: ASTNode;
  parent: ASTNode[];
  style: unknown;
  dataSet?: DataSet;
  children: ReactNode;
}) {
  const columns = useContext(MarkdownTableColumnsContext);
  const column = node.index;
  const isLastColumn = column === (parent[0]?.children.length ?? 0) - 1;
  const width = columns?.widths?.[column];
  const weight = columns?.weights[column] ?? 1;
  const cellStyle = useMemo(
    () => [
      style as ViewStyle,
      width === undefined
        ? { flexGrow: weight, flexShrink: 1, flexBasis: 0 }
        : { flexGrow: 0, flexShrink: 0, flexBasis: width, width },
      // The table's own border closes the row.
      isLastColumn ? lastColumnStyle : null,
    ],
    [isLastColumn, style, weight, width],
  );
  return (
    <MarkdownTableCellText>
      <View style={cellStyle} dataSet={dataSet}>
        {children}
      </View>
    </MarkdownTableCellText>
  );
}

const lastColumnStyle: ViewStyle = { borderRightWidth: 0 };

// Shared by every markdown surface that does not need its own table markup.
export const markdownTableRules = {
  table: (
    node: ASTNode,
    children: ReactNode[],
    _parent: ASTNode[],
    styles: MarkdownTableStyles,
  ) => (
    <MarkdownTable key={node.key} node={node} styles={styles}>
      {children}
    </MarkdownTable>
  ),
  th: (node: ASTNode, children: ReactNode[], parent: ASTNode[], styles: MarkdownTableStyles) => (
    <MarkdownTableCell key={node.key} node={node} parent={parent} style={styles._VIEW_SAFE_th}>
      {children}
    </MarkdownTableCell>
  ),
  td: (node: ASTNode, children: ReactNode[], parent: ASTNode[], styles: MarkdownTableStyles) => (
    <MarkdownTableCell key={node.key} node={node} parent={parent} style={styles._VIEW_SAFE_td}>
      {children}
    </MarkdownTableCell>
  ),
};
