import { isPaseoToolName } from "@getpaseo/protocol/tool-name-normalization";
import type { ThoughtItem, ToolCallItem } from "@/types/stream";
import { describeToolCall, isActivityItemRunning, type ActivityRun } from "../grouping";

const DIRECT_PASEO_TOOL_PREFIX = "paseo_";
const DIRECT_SEARCH_TOOL_SUFFIX_PATTERN = /(?:^|[_.:/])(?:web_search|llm_context)$/;

export interface OverviewSummary {
  editedFileCount: number;
  commandCount: number;
  readFileCount: number;
  searchCount: number;
  otherToolCount: number;
  paseoCallCount: number;
}

export interface OverviewThoughtSegment {
  kind: "thought";
  id: string;
  item: ThoughtItem;
  isLoading: boolean;
}

export interface OverviewToolsSegment {
  kind: "tools";
  id: string;
  calls: readonly ToolCallItem[];
  summary: OverviewSummary;
  isLoading: boolean;
}

/** One selectable step in an activity group. A segment's id is its first item's id, so it stays put as the run grows. */
export type OverviewSegment = OverviewThoughtSegment | OverviewToolsSegment;

export interface OverviewActivityGroup {
  mode: "overview";
  run: ActivityRun;
  segments: readonly OverviewSegment[];
}

function isPaseoCall(name: string, normalizedName: string): boolean {
  return isPaseoToolName(name) || normalizedName.startsWith(DIRECT_PASEO_TOOL_PREFIX);
}

function isSearchCall(name: string): boolean {
  return DIRECT_SEARCH_TOOL_SUFFIX_PATTERN.test(name);
}

function buildToolsSegment(calls: readonly ToolCallItem[]): OverviewToolsSegment {
  const first = calls[0];
  if (!first) {
    throw new Error("Cannot summarize an empty tool call segment");
  }
  const editedFiles = new Set<string>();
  const readFiles = new Set<string>();
  let isLoading = false;
  let commandCount = 0;
  let searchCount = 0;
  let otherToolCount = 0;
  let paseoCallCount = 0;

  for (const call of calls) {
    const descriptor = describeToolCall(call);
    const normalizedName = descriptor.name.trim().toLowerCase();
    isLoading ||= isActivityItemRunning(call);
    if (isPaseoCall(descriptor.name, normalizedName)) {
      paseoCallCount += 1;
    } else if (descriptor.detail.type === "edit" || descriptor.detail.type === "write") {
      editedFiles.add(descriptor.detail.filePath);
    } else if (descriptor.detail.type === "shell") {
      commandCount += 1;
    } else if (descriptor.detail.type === "read") {
      readFiles.add(descriptor.detail.filePath);
    } else if (descriptor.detail.type === "search" || isSearchCall(normalizedName)) {
      searchCount += 1;
    } else {
      otherToolCount += 1;
    }
  }

  return {
    kind: "tools",
    id: first.id,
    calls,
    isLoading,
    summary: {
      editedFileCount: editedFiles.size,
      commandCount,
      readFileCount: readFiles.size,
      searchCount,
      otherToolCount,
      paseoCallCount,
    },
  };
}

export function buildOverviewGroup(run: ActivityRun): OverviewActivityGroup {
  const segments: OverviewSegment[] = [];
  let pendingCalls: ToolCallItem[] = [];
  const flushCalls = () => {
    if (pendingCalls.length > 0) {
      segments.push(buildToolsSegment(pendingCalls));
      pendingCalls = [];
    }
  };

  for (const item of run.items) {
    if (item.kind === "tool_call") {
      pendingCalls.push(item);
      continue;
    }
    flushCalls();
    segments.push({
      kind: "thought",
      id: item.id,
      item,
      isLoading: isActivityItemRunning(item),
    });
  }
  flushCalls();

  return {
    mode: "overview",
    run,
    segments,
  };
}
