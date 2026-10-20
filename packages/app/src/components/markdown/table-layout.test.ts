import type { ASTNode } from "react-native-markdown-display";
import { describe, expect, it } from "vitest";
// The renderer's own markdown → AST pipeline, so the tests read the nodes table rules receive.
// @ts-expect-error untyped internal module
import parseMarkdownAst from "react-native-markdown-display/src/lib/parser";
import { createMarkdownParser } from "@/utils/markdown-parser";
import {
  measureMarkdownTableColumns,
  placeMarkdownTable,
  resolveMarkdownTableColumnWidths,
  resolveMarkdownTableGutter,
  type MarkdownTableColumnBounds,
} from "./table-layout";

const METRICS = { fontSize: 15, cellPaddingX: 8, cellBorderWidth: 1 };

function parseTable(markdown: string): ASTNode {
  const nodes: ASTNode[] = parseMarkdownAst(
    markdown,
    (ast: ASTNode[]) => ast,
    createMarkdownParser({ linkify: true }),
  );
  const table = nodes.find((node) => node.type === "table");
  if (!table) throw new Error("no table in markdown");
  return table;
}

const TICKETS_TABLE = [
  "| # | Her point | Ticket(s) | Ticket status | Actual state |",
  "| - | --- | --- | --- | --- |",
  "| 1 | Offsetting bank name | AXO-252 | DONE | Correct. Fixed on the Oct 14 re-run. |",
  "| 2 | iPay bill payment details | AXO-253 | OPEN | Correct. PR #5301 is open. The ticket says \"Sphinx doesn't currently receive iPay\", which is only partly true now: we have the payee name, not the payee's bank. |",
  "| 3 | Loan alerts | AXO-254 bank on loan ACH payments | IN_PROGRESS | Correct |",
].join("\n");

describe("measureMarkdownTableColumns", () => {
  it("gives short columns much less room than long ones", () => {
    const columns = measureMarkdownTableColumns(parseTable(TICKETS_TABLE), METRICS);

    expect(columns).toHaveLength(5);
    const [index, , , status, actual] = columns as [
      MarkdownTableColumnBounds,
      MarkdownTableColumnBounds,
      MarkdownTableColumnBounds,
      MarkdownTableColumnBounds,
      MarkdownTableColumnBounds,
    ];
    expect(index.max).toBeLessThan(40);
    expect(status.max).toBeLessThan(150);
    expect(actual.max).toBeGreaterThan(900);
    expect(actual.min).toBeLessThan(actual.max);
  });

  it("caps a long unbroken word so it cannot pin its column wide", () => {
    const columns = measureMarkdownTableColumns(
      parseTable("| Path |\n| --- |\n| packages/app/src/components/markdown/table-layout.ts |"),
      METRICS,
    );

    expect(columns[0]!.min).toBeLessThan(columns[0]!.max / 2);
  });
});

describe("resolveMarkdownTableColumnWidths", () => {
  it("keeps natural widths when everything fits", () => {
    const columns = [
      { min: 20, max: 30 },
      { min: 50, max: 120 },
    ];
    expect(resolveMarkdownTableColumnWidths(columns, 800)).toEqual([30, 120]);
  });

  it("lets columns that fit keep their width and shares the rest between long ones", () => {
    const columns = [
      { min: 30, max: 30 },
      { min: 80, max: 600 },
      { min: 80, max: 900 },
      { min: 60, max: 100 },
    ];

    const widths = resolveMarkdownTableColumnWidths(columns, 800);

    expect(widths[0]).toBe(30);
    expect(widths[3]).toBe(100);
    expect(Math.abs(widths[1]! - widths[2]!)).toBeLessThanOrEqual(1);
    expect(widths.reduce((total, width) => total + width, 0)).toBeLessThanOrEqual(800);
    expect(widths.reduce((total, width) => total + width, 0)).toBeGreaterThan(796);
  });

  it("never goes below a column's minimum", () => {
    const columns = Array.from({ length: 10 }, () => ({ min: 90, max: 300 }));
    expect(resolveMarkdownTableColumnWidths(columns, 400)).toEqual(columns.map(() => 90));
  });
});

describe("placeMarkdownTable", () => {
  const narrow = [
    { min: 30, max: 30 },
    { min: 60, max: 120 },
  ];
  const wide = [
    { min: 80, max: 700 },
    { min: 80, max: 700 },
  ];

  it("keeps a narrow table at its natural width, aligned with the text", () => {
    const placement = placeMarkdownTable({
      columns: narrow,
      columnWidth: 800,
      gutter: 200,
      tableBorderWidth: 1,
    });
    expect(placement).toEqual({
      columnWidths: [30, 120],
      tableWidth: 152,
      offsetX: -0,
      viewportWidth: 152,
      scrolls: false,
    });
  });

  it("grows a wide table evenly into the gutters, up to the pane", () => {
    const placement = placeMarkdownTable({
      columns: wide,
      columnWidth: 800,
      gutter: 200,
      tableBorderWidth: 1,
    });
    expect(placement.tableWidth).toBe(1200);
    expect(placement.offsetX).toBe(-200);
    expect(placement.scrolls).toBe(false);
  });

  it("stays inside the text column when there is no gutter", () => {
    const placement = placeMarkdownTable({
      columns: wide,
      columnWidth: 800,
      gutter: 0,
      tableBorderWidth: 1,
    });
    expect(placement.tableWidth).toBe(800);
    expect(placement.offsetX).toBe(-0);
  });

  it("scrolls when even the column minimums do not fit", () => {
    const placement = placeMarkdownTable({
      columns: Array.from({ length: 6 }, () => ({ min: 90, max: 300 })),
      columnWidth: 360,
      gutter: 0,
      tableBorderWidth: 1,
    });
    expect(placement.scrolls).toBe(true);
    expect(placement.tableWidth).toBe(542);
    expect(placement.viewportWidth).toBe(360);
  });
});

describe("resolveMarkdownTableGutter", () => {
  it("opens no gutter until the pane is wider than the message column", () => {
    expect(resolveMarkdownTableGutter({ paneWidth: 820, contentMaxWidth: 820 })).toBe(0);
    expect(resolveMarkdownTableGutter({ paneWidth: 400, contentMaxWidth: 820 })).toBe(0);
  });

  it("leaves room at the pane edges for the outline rail", () => {
    expect(resolveMarkdownTableGutter({ paneWidth: 1420, contentMaxWidth: 820 })).toBe(252);
  });
});
