import { classifyWeek } from "./week.utils";
import type { FetchCacheSnapshot } from "./release.types";

export type CacheDecision = {
  shouldFetch: boolean;
  reason: "missing" | "refresh-requested" | "frozen-past" | "expired" | "fresh";
};

export type CacheDecisionInput = {
  weekStart: string;
  now?: Date;
  cache?: Pick<FetchCacheSnapshot, "status" | "fetchedAt"> | null;
  forceRefresh?: boolean;
};

export function getCacheDecision(input: CacheDecisionInput): CacheDecision {
  if (input.forceRefresh) {
    return { shouldFetch: true, reason: "refresh-requested" };
  }

  if (!input.cache?.fetchedAt) {
    return { shouldFetch: true, reason: "missing" };
  }

  const now = input.now || new Date();
  const kind = classifyWeek(input.weekStart, now);
  if (kind === "past") {
    return { shouldFetch: false, reason: "frozen-past" };
  }

  const expiresAt = getNextExpiry(input.weekStart, input.cache.fetchedAt);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return { shouldFetch: true, reason: "expired" };
  }

  return { shouldFetch: false, reason: "fresh" };
}

export function getNextExpiry(weekStart: string, fetchedAt: Date): Date | null {
  const kind = classifyWeek(weekStart, fetchedAt);
  if (kind === "past") return null;

  const hours = kind === "current" ? 24 : 6;
  return new Date(fetchedAt.getTime() + hours * 60 * 60 * 1000);
}
