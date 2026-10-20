import type { Locator } from "@playwright/test";
import { expect, test, type Page } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

const NARROW_TABLE = ["| Key | Value |", "| --- | --- |", "| a | 1 |", "| b | 2 |"].join("\n");

const TICKETS_TABLE = [
  "| # | Her point | Ticket(s) | Ticket status | Actual state |",
  "| - | --- | --- | --- | --- |",
  "| 1 | Offsetting bank name | AXO-252 | DONE | Correct. Fixed on the Oct 14 re-run. |",
  "| 2 | iPay bill payment details | AXO-253 | OPEN | Correct. PR #5301 is open. The ticket says \"Sphinx doesn't currently receive iPay\", which is only partly true now: we have the payee name, not the payee's bank. |",
  "| 3 | Loan alerts | AXO-254 bank on loan ACH payments | DONE | Correct |",
  '|  |  | AXO-266 account behind "Transfer from DDA" | DONE | Correct |',
  "|  |  | AXO-260 PC Lender income/employment | OPEN | Correct. Blocked on Axos data (not Day One). |",
  '|  |  | AXO-272 income "not documented" wording | IN_PROGRESS | Probably done (findings now mention PC Lender). I haven\'t checked the latest run yet, so this needs a second look before we close it out. |',
].join("\n");

const ASSISTANT_MARKDOWN = [
  "Short table:",
  "",
  NARROW_TABLE,
  "",
  "Eight of her 9 points already have tickets. Only point 6 (alert statuses) has none. Two of the existing tickets show the wrong status.",
  "",
  TICKETS_TABLE,
].join("\n");

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(locator: Locator): Promise<Box> {
  const result = await locator.boundingBox();
  if (!result) throw new Error("Expected a rendered element");
  return result;
}

function assistantTables(page: Page): Locator {
  return page.locator('[data-paseo-markdown-tag="table"]');
}

/** x and width of every cell, row by row. */
async function cellColumns(table: Locator): Promise<{ x: number; width: number }[][]> {
  return table.locator('[data-paseo-markdown-tag="tr"]').evaluateAll((rows) =>
    rows.map((row) =>
      Array.from(
        row.querySelectorAll('[data-paseo-markdown-tag="th"], [data-paseo-markdown-tag="td"]'),
      ).map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { x: Math.round(rect.x), width: Math.round(rect.width) };
      }),
    ),
  );
}

/** The chat's scroll viewport, which a widened table must stay inside. */
async function chatViewport(table: Locator): Promise<Box> {
  return table.evaluate((element) => {
    let node: HTMLElement | null = element.parentElement;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      node = node.parentElement;
    }
    throw new Error("Expected the table inside a scroll viewport");
  });
}

test.describe("markdown table layout", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("sizes columns to their content and widens wide tables into the chat", async ({ page }) => {
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "markdown-table-layout-",
      title: "Markdown table layout",
      initialPrompt: "Render the table fixture.",
      featureValues: { mockAssistantResponse: ASSISTANT_MARKDOWN },
    });

    try {
      await agent.client.waitForAgentUpsert(
        agent.agentId,
        (snapshot) => snapshot.status === "idle",
        30_000,
      );
      await openAgentRoute(page, agent);

      const tables = assistantTables(page);
      await expect(tables).toHaveCount(2);
      const narrowTable = tables.nth(0);
      const ticketsTable = tables.nth(1);
      const paragraph = page
        .locator('[data-paseo-markdown-tag="p"]')
        .filter({ hasText: "Eight of her 9 points" });

      const paragraphBox = await box(paragraph);
      const narrowBox = await box(narrowTable);
      const ticketsBox = await box(ticketsTable);
      const viewport = await chatViewport(ticketsTable);

      // A small table hugs its content and stays aligned with the prose.
      expect(narrowBox.width).toBeLessThan(paragraphBox.width / 3);
      expect(Math.abs(narrowBox.x - paragraphBox.x)).toBeLessThanOrEqual(1);

      // A wide table grows past the prose column on both sides, but not past the chat.
      expect(ticketsBox.x).toBeLessThan(paragraphBox.x - 20);
      expect(ticketsBox.x + ticketsBox.width).toBeGreaterThan(
        paragraphBox.x + paragraphBox.width + 20,
      );
      expect(ticketsBox.x).toBeGreaterThanOrEqual(viewport.x);
      expect(ticketsBox.x + ticketsBox.width).toBeLessThanOrEqual(viewport.x + viewport.width);

      // Columns line up across every row.
      const rows = await cellColumns(ticketsTable);
      expect(rows.length).toBe(7);
      for (const row of rows) {
        expect(row).toEqual(rows[0]);
      }

      // Short columns take little room; the long prose column takes the most.
      const widths = rows[0]!.map((cell) => cell.width);
      const [index, , , status, actual] = widths as [number, number, number, number, number];
      expect(index).toBeLessThan(40);
      expect(status).toBeLessThan(140);
      expect(actual).toBe(Math.max(...widths));

      // A one-line status never wraps.
      const statusCell = ticketsTable
        .locator('[data-paseo-markdown-tag="td"]')
        .filter({ hasText: "IN_PROGRESS" });
      const doneCell = ticketsTable
        .locator('[data-paseo-markdown-tag="td"]')
        .filter({ hasText: /^DONE$/ })
        .first();
      const inProgressText = await box(statusCell.locator("span, div[dir]").first());
      const doneText = await box(doneCell.locator("span, div[dir]").first());
      expect(inProgressText.height).toBeLessThanOrEqual(doneText.height + 1);

      // On a phone the columns keep their minimum widths and the table scrolls sideways.
      await page.setViewportSize({ width: 420, height: 1000 });
      await expect
        .poll(async () => (await cellColumns(ticketsTable))[0]![3]!.width)
        .toBeGreaterThanOrEqual(status);
      const scroller = await ticketsTable.evaluate((element) => {
        const parent = element.parentElement?.parentElement;
        return parent ? { client: parent.clientWidth, scroll: parent.scrollWidth } : null;
      });
      expect(scroller?.scroll).toBeGreaterThan(scroller?.client ?? Infinity);
    } finally {
      await agent.cleanup();
    }
  });
});
