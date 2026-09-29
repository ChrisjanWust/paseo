import { describe, expect, test } from "vitest";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { filterWorkspacesByRecency } from "./sidebar-recency-filter";

const NOW = Date.parse("2026-09-28T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function workspace(
  workspaceId: string,
  input: {
    hoursAgo: number | null;
    statusBucket?: SidebarWorkspaceEntry["statusBucket"];
  },
): SidebarWorkspaceEntry {
  return {
    workspaceKey: `host:${workspaceId}`,
    serverId: "host",
    workspaceId,
    projectViewKey: "alpha",
    projectName: "alpha",
    projectRootPath: "/repo/alpha",
    workspaceDirectory: `/repo/alpha/${workspaceId}`,
    workspaceDirectoryLabel: workspaceId,
    projectKind: "git",
    workspaceKind: "worktree",
    name: workspaceId,
    title: null,
    pinnedAt: null,
    labels: [],
    currentBranch: "main",
    statusBucket: input.statusBucket ?? "done",
    statusEnteredAt: input.hoursAgo === null ? null : new Date(NOW - input.hoursAgo * HOUR_MS),
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
  };
}

function visibleIds(
  workspaces: SidebarWorkspaceEntry[],
  recencyWindow: Parameters<typeof filterWorkspacesByRecency>[0]["recencyWindow"],
): string[] {
  return filterWorkspacesByRecency({ workspaces, recencyWindow, now: NOW }).map(
    (entry) => entry.workspaceId,
  );
}

describe("filterWorkspacesByRecency", () => {
  const workspaces = [
    workspace("one-hour", { hoursAgo: 1 }),
    workspace("eight-hours", { hoursAgo: 8 }),
    workspace("eighteen-hours", { hoursAgo: 18 }),
    workspace("thirty-hours", { hoursAgo: 30 }),
    workspace("five-days", { hoursAgo: 5 * 24 }),
    workspace("ten-days", { hoursAgo: 10 * 24 }),
    workspace("never", { hoursAgo: null }),
  ];

  test("keeps everything when no window is set", () => {
    expect(visibleIds(workspaces, "all")).toEqual(workspaces.map((entry) => entry.workspaceId));
  });

  test("keeps only workspaces active inside each window", () => {
    expect(visibleIds(workspaces, "6h")).toEqual(["one-hour"]);
    expect(visibleIds(workspaces, "12h")).toEqual(["one-hour", "eight-hours"]);
    expect(visibleIds(workspaces, "1d")).toEqual(["one-hour", "eight-hours", "eighteen-hours"]);
    expect(visibleIds(workspaces, "7d")).toEqual([
      "one-hour",
      "eight-hours",
      "eighteen-hours",
      "thirty-hours",
      "five-days",
    ]);
  });

  test("includes a workspace exactly on the window's edge", () => {
    expect(visibleIds([workspace("edge", { hoursAgo: 6 })], "6h")).toEqual(["edge"]);
  });

  // A turn that started before the window is still the most active thing on the sidebar.
  test("always keeps running workspaces", () => {
    expect(
      visibleIds([workspace("long-run", { hoursAgo: 9, statusBucket: "running" })], "6h"),
    ).toEqual(["long-run"]);
  });
});
