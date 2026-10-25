import type { Locator } from "@playwright/test";
import { expect, test, type Page } from "../support/fixtures";
import { openFileExplorer, openFileFromExplorer } from "../support/helpers/file-explorer";
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

const TABLES_MARKDOWN = [
  "Short table:",
  "",
  NARROW_TABLE,
  "",
  "Eight of her 9 points already have tickets. Only point 6 (alert statuses) has none. Two of the existing tickets show the wrong status.",
  "",
  TICKETS_TABLE,
  "",
  "- A table inside a list item stays in the text column:",
  "",
  "  " + TICKETS_TABLE.split("\n").join("\n  "),
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

/** The nearest scrolling ancestor, which a widened table must stay inside. */
async function scrollViewport(table: Locator): Promise<Box> {
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

/** Checks the three tables in TABLES_MARKDOWN against the text column they sit in. */
async function expectTableLayout(page: Page, scope: Locator, column: Box): Promise<void> {
  const tables = scope.locator("table");
  await expect(tables).toHaveCount(3);
  const paragraph = scope.getByText("Eight of her 9 points");
  await tables.nth(1).scrollIntoViewIfNeeded();
  const paragraphBox = await box(paragraph);
  const columnRight = column.x + column.width;
  const narrowBox = await box(tables.nth(0));
  const ticketsBox = await box(tables.nth(1));
  const nestedBox = await box(tables.nth(2));
  const viewport = await scrollViewport(tables.nth(1));

  // A small table hugs its content and stays aligned with the prose.
  expect(narrowBox.width).toBeLessThan(column.width / 3);
  expect(Math.abs(narrowBox.x - paragraphBox.x)).toBeLessThanOrEqual(1);

  // A wide table grows evenly past the text column on both sides, but not past the pane.
  const leftGrowth = paragraphBox.x - ticketsBox.x;
  const rightGrowth = ticketsBox.x + ticketsBox.width - columnRight;
  expect(leftGrowth).toBeGreaterThan(20);
  expect(rightGrowth).toBeGreaterThan(20);
  expect(Math.abs(leftGrowth - rightGrowth)).toBeLessThanOrEqual(paragraphBox.x - column.x + 2);
  expect(ticketsBox.x).toBeGreaterThanOrEqual(viewport.x);
  expect(ticketsBox.x + ticketsBox.width).toBeLessThanOrEqual(viewport.x + viewport.width);
  // No ancestor clips the part that overhangs the text column.
  const edgeHits = await tables.nth(1).evaluate((element, rect) => {
    const y = rect.y + 8;
    return [rect.x + 4, rect.x + rect.width - 4].map((x) =>
      element.contains(document.elementFromPoint(x, y)),
    );
  }, ticketsBox);
  expect(edgeHits).toEqual([true, true]);

  // A table inside a list item stays inside the text column.
  expect(nestedBox.x).toBeGreaterThanOrEqual(paragraphBox.x);
  expect(nestedBox.x + nestedBox.width).toBeLessThanOrEqual(columnRight + 1);

  // On a phone the table keeps its column minimums and scrolls sideways.
  await page.setViewportSize({ width: 420, height: 1000 });
  await expect
    .poll(() =>
      tables.nth(1).evaluate((element) => {
        const scroller = element.parentElement;
        return scroller ? scroller.scrollWidth - scroller.clientWidth : 0;
      }),
    )
    .toBeGreaterThan(0);
}

test.describe("markdown table layout", () => {
  test("sizes tables to their content and widens wide ones into the chat", async ({ page }) => {
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "markdown-table-layout-",
      title: "Markdown table layout",
      initialPrompt: "Render the table fixture.",
      featureValues: { mockAssistantResponse: TABLES_MARKDOWN },
    });

    try {
      await agent.client.waitForAgentUpsert(
        agent.agentId,
        (snapshot) => snapshot.status === "idle",
        30_000,
      );
      await page.setViewportSize({ width: 1600, height: 1000 });
      await openAgentRoute(page, agent);

      const message = page.locator(".enrm-text").filter({ hasText: "Eight of her 9 points" });
      await expect(message.locator("table")).toHaveCount(3);
      await expectTableLayout(page, message, await box(message));
    } finally {
      await agent.cleanup();
    }
  });

  test("widens wide tables into the margins of a Markdown file preview", async ({ page }) => {
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "markdown-table-preview-",
      title: "Markdown table preview",
      initialPrompt: "Say hello.",
      repo: { files: [{ path: "TABLES.md", content: TABLES_MARKDOWN }] },
    });

    try {
      await agent.client.waitForFinish(agent.agentId, 30_000);
      await page.setViewportSize({ width: 2560, height: 1080 });
      await openAgentRoute(page, agent);
      await openFileExplorer(page);
      await openFileFromExplorer(page, "TABLES.md");

      const frame = page.getByTestId("markdown-preview-frame");
      await expect(frame.locator("table")).toHaveCount(3);
      // Wrapped text stops short of the column's right edge by a font-dependent amount, so
      // the column comes from the rendered Markdown, not the paragraph.
      await expectTableLayout(page, frame, await box(frame.locator(".enrm-text")));
    } finally {
      await agent.cleanup();
    }
  });
});
