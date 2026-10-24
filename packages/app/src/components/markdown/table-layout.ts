import type { ASTNode } from "react-native-markdown-display";
import { markdownNodeContainsType } from "@/utils/markdown-ast";

// Markdown tables render as flex rows, so nothing lines columns up across rows unless every
// cell is given the same explicit width. Widths come from an estimate of each column's text,
// in the spirit of the browser's auto table layout: a column wants its longest line on one
// line (max) and can wrap down to its longest word (min).

export interface MarkdownTableColumnBounds {
  min: number;
  max: number;
}

export interface MarkdownTableTextMetrics {
  fontSize: number;
  cellPaddingX: number;
  cellBorderWidth: number;
}

interface MarkdownTableCellText {
  column: number;
  text: string;
  header: boolean;
  image: boolean;
}

// A long URL or path would otherwise pin its column wide. Past this, the word wraps mid-word.
const MIN_CONTENT_MAX_CHARS = 18;
const IMAGE_CELL_MIN_WIDTH = 120;
const IMAGE_CELL_MAX_WIDTH = 240;
// Bold header glyphs run wider than body glyphs.
const HEADER_WIDTH_FACTOR = 1.06;
// Estimates are approximate; erring wide keeps a line that should fit from wrapping.
const WIDTH_SAFETY_FACTOR = 1.04;

const NARROW_GLYPHS = new Set("ijl.,:;'|!`");
const SEMI_NARROW_GLYPHS = new Set('tfr"-()[]{}/\\');
const WIDE_GLYPHS = new Set("mwMW@%");

function glyphWidthEm(char: string): number {
  if (char === " ") return 0.28;
  if (NARROW_GLYPHS.has(char)) return 0.3;
  if (SEMI_NARROW_GLYPHS.has(char)) return 0.4;
  if (WIDE_GLYPHS.has(char)) return 0.85;
  if (char >= "A" && char <= "Z") return 0.66;
  if (char >= "0" && char <= "9") return 0.58;
  // CJK and other full-width text.
  if (char.codePointAt(0)! >= 0x2e80) return 1;
  return 0.54;
}

export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    em += glyphWidthEm(char);
  }
  return em * fontSize * WIDTH_SAFETY_FACTOR;
}

function collectInlineText(node: ASTNode): string {
  if (node.type === "softbreak") return " ";
  if (node.type === "hardbreak") return "\n";
  if (node.children.length === 0) return node.content ?? "";
  return node.children.map(collectInlineText).join("");
}

function collectCells(node: ASTNode, cells: MarkdownTableCellText[]): void {
  if (node.type === "th" || node.type === "td") {
    cells.push({
      column: node.index,
      text: collectInlineText(node),
      header: node.type === "th",
      image: markdownNodeContainsType(node, "image"),
    });
    return;
  }
  for (const child of node.children) {
    collectCells(child, cells);
  }
}

export function measureMarkdownTableColumns(
  table: ASTNode,
  metrics: MarkdownTableTextMetrics,
): MarkdownTableColumnBounds[] {
  const cells: MarkdownTableCellText[] = [];
  collectCells(table, cells);

  const chrome = metrics.cellPaddingX * 2 + metrics.cellBorderWidth;
  const columns: MarkdownTableColumnBounds[] = [];
  for (const cell of cells) {
    const factor = cell.header ? HEADER_WIDTH_FACTOR : 1;
    const measure = (text: string) => estimateTextWidth(text, metrics.fontSize) * factor;
    const lines = cell.text.split("\n");
    const words = cell.text.split(/\s+/);
    let max = Math.max(0, ...lines.map(measure));
    let min = Math.min(
      max,
      Math.max(0, ...words.map((word) => measure(word.slice(0, MIN_CONTENT_MAX_CHARS)))),
    );
    // Images fill their cell, so sizing by alt text would shrink them to nothing.
    if (cell.image) {
      min = Math.max(min, IMAGE_CELL_MIN_WIDTH);
      max = Math.max(max, IMAGE_CELL_MAX_WIDTH);
    }
    const column = columns[cell.column] ?? { min: 0, max: 0 };
    columns[cell.column] = {
      min: Math.max(column.min, Math.ceil(min + chrome)),
      max: Math.max(column.max, Math.ceil(max + chrome)),
    };
  }
  // markdown-it pads every row to the header's column count, so there are no holes.
  return columns;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Fits columns into `available`. Columns that fit on one line keep their natural width; the
// space left is shared evenly by the long columns, so one long column cannot squeeze a
// medium one into wrapping when both could wrap a little. Never goes below a column's min,
// so the result can exceed `available` when even the minimums do not fit.
export function resolveMarkdownTableColumnWidths(
  columns: readonly MarkdownTableColumnBounds[],
  available: number,
): number[] {
  const maxes = columns.map((column) => column.max);
  if (sum(maxes) <= available) return maxes;
  const mins = columns.map((column) => column.min);
  if (sum(mins) >= available) return mins;

  // Water-fill: find the level L where sum(clamp(L, min, max)) === available.
  const widthsAt = (level: number) =>
    columns.map((column) => Math.min(column.max, Math.max(column.min, level)));
  let low = 0;
  let high = Math.max(...maxes);
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const level = (low + high) / 2;
    if (sum(widthsAt(level)) > available) {
      high = level;
    } else {
      low = level;
    }
  }
  // Hand the pixels lost to flooring back to the columns that are still wrapping.
  const widths = widthsAt(low).map(Math.floor);
  let remainder = Math.floor(available) - sum(widths);
  return widths.map((width, index) => {
    if (remainder <= 0 || width >= columns[index]!.max) return width;
    remainder -= 1;
    return width + 1;
  });
}

export interface MarkdownTablePlacement {
  columnWidths: number[];
  tableWidth: number;
  // Negative pulls the table left into the gutter so it widens around the text column.
  offsetX: number;
  // The viewport the table occupies; narrower than tableWidth when it has to scroll.
  viewportWidth: number;
  scrolls: boolean;
}

// `columnWidth` is the text column the table sits in. `gutter` is how far, per side, the
// table may grow past that column into the surrounding pane. Narrow tables stay aligned with
// the text; wide ones grow outward evenly; tables whose minimums still do not fit scroll.
export function placeMarkdownTable(input: {
  columns: readonly MarkdownTableColumnBounds[];
  columnWidth: number;
  gutter: number;
  tableBorderWidth: number;
}): MarkdownTablePlacement {
  const borders = input.tableBorderWidth * 2;
  const maxViewport = input.columnWidth + input.gutter * 2;
  const columnWidths = resolveMarkdownTableColumnWidths(input.columns, maxViewport - borders);
  const tableWidth = sum(columnWidths) + borders;
  const viewportWidth = Math.min(tableWidth, maxViewport);
  const overflow = Math.max(0, viewportWidth - input.columnWidth);
  return {
    columnWidths,
    tableWidth,
    offsetX: -overflow / 2,
    viewportWidth,
    scrolls: tableWidth > maxViewport,
  };
}

// Keeps a widened table clear of the pane edge and of the chat outline rail.
const PANE_EDGE_INSET = 48;

export function resolveMarkdownTableGutter(input: {
  paneWidth: number;
  contentMaxWidth: number;
}): number {
  return Math.max(0, Math.floor((input.paneWidth - input.contentMaxWidth) / 2) - PANE_EDGE_INSET);
}
