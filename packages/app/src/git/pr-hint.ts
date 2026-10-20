import { normalizeForge, type Forge } from "@/git/forge";
import type { PresentableCheck } from "@/git/check-presentation";

export interface PrHint {
  url: string;
  number: number;
  state: "open" | "merged" | "closed";
  /** Forge backing this change request, so badges render the right brand mark. */
  forge: Forge;
  checks?: PrHintCheck[];
  checksStatus?: "none" | "pending" | "success" | "failure";
  reviewDecision?: "approved" | "changes_requested" | "pending" | null;
}

/**
 * The part of a change request a compact badge draws: its number, its state, and the forge that
 * decides the number's prefix. Lighter than a `PrHint` because a badge needs no link or CI.
 */
export type PrBadgeModel = Pick<PrHint, "number" | "state" | "forge">;

export interface PrHintCheck extends PresentableCheck {
  name: string;
  url: string | null;
}

interface PrStatusLike {
  url: string;
  number?: number | null;
  state: string;
  isMerged: boolean;
  checks?: PrHintCheck[];
  checksStatus?: string;
  reviewDecision?: string | null;
  forge?: string;
}

function parsePullRequestNumber(url: string): number | null {
  try {
    const pathname = new URL(url).pathname;
    // GitHub uses /pull/N, Gitea/Forgejo /pulls/N, GitLab /-/merge_requests/N.
    // Match any so a non-GitHub change-request summary yields a hint (and brand mark).
    const match = pathname.match(/\/(?:pull|pulls|merge_requests)\/(\d+)(?:\/|$)/);
    if (!match) {
      return null;
    }

    const number = Number.parseInt(match[1], 10);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

function resolvePrState(status: PrStatusLike): PrHint["state"] {
  if (status.isMerged || status.state === "merged") return "merged";
  if (status.state === "open") return "open";
  return "closed";
}

/**
 * Resolve a badge for a change request.
 *
 * The wire carries the number directly, so prefer it. Parsing the URL is only the fallback: it
 * yields null for a noncanonical or absent URL even when the daemon sent a perfectly good number.
 */
export function selectPrBadgeFromStatus(
  status: PrStatusLike | null | undefined,
  forge?: string | null,
): PrBadgeModel | null {
  if (!status) return null;
  const number = status.number ?? (status.url ? parsePullRequestNumber(status.url) : null);
  if (number === null) return null;
  return {
    number,
    state: resolvePrState(status),
    forge: normalizeForge(forge ?? status.forge),
  };
}

export function selectPrHintFromStatus(
  status: PrStatusLike | null | undefined,
  forge?: string | null,
): PrHint | null {
  const badge = selectPrBadgeFromStatus(status, forge);
  if (!badge || !status?.url) {
    return null;
  }

  return {
    ...badge,
    url: status.url,
    checks: status.checks,
    checksStatus: status.checksStatus as PrHint["checksStatus"],
    reviewDecision: status.reviewDecision as PrHint["reviewDecision"],
  };
}
