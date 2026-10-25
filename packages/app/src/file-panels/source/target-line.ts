import type { WorkspaceFileLocation } from "@/workspace/file-open";

// How long a linked line flashes before settling into its persistent highlight.
export const TARGET_LINE_FLASH_MS = 1200;

export interface TargetLineRange {
  start: number;
  end: number;
}

export function resolveTargetLineRange(
  location: Pick<WorkspaceFileLocation, "lineStart" | "lineEnd">,
  lineCount: number,
): TargetLineRange | null {
  if (!location.lineStart || lineCount < 1) return null;
  const start = Math.min(location.lineStart, lineCount);
  const end = Math.min(Math.max(location.lineEnd ?? start, start), lineCount);
  return { start, end };
}

export function isTargetLine(range: TargetLineRange | null, line: number): boolean {
  return range !== null && line >= range.start && line <= range.end;
}
