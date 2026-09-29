import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import type { SidebarRecencyWindow } from "@/stores/sidebar-view-store";

const HOUR_MS = 60 * 60 * 1000;

const RECENCY_WINDOW_MS: Record<Exclude<SidebarRecencyWindow, "all">, number> = {
  "6h": 6 * HOUR_MS,
  "12h": 12 * HOUR_MS,
  "1d": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
};

export function hasActiveSidebarRecencyWindow(window: SidebarRecencyWindow): boolean {
  return window !== "all";
}

/**
 * Keeps the workspaces whose last activity falls inside the window.
 *
 * Last activity is `statusEnteredAt`, the same instant the row's "Last activity" timestamp shows,
 * so the filter and the row can never disagree about what counts as recent. A running workspace
 * always passes: it entered `running` when its turn started, which can be longer ago than the
 * window, but it is the most active thing on the sidebar. A workspace with no timestamp has no
 * activity to put inside the window, so it is hidden.
 */
export function filterWorkspacesByRecency(input: {
  workspaces: readonly SidebarWorkspaceEntry[];
  recencyWindow: SidebarRecencyWindow;
  now: number;
}): SidebarWorkspaceEntry[] {
  const { workspaces, recencyWindow, now } = input;
  if (recencyWindow === "all") return [...workspaces];
  const cutoff = now - RECENCY_WINDOW_MS[recencyWindow];
  return workspaces.filter((workspace) => {
    if (workspace.statusBucket === "running") return true;
    const time = workspace.statusEnteredAt?.getTime();
    return time !== undefined && Number.isFinite(time) && time >= cutoff;
  });
}
