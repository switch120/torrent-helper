import { addDays, classifyWeek, parseDateOnly } from "./week.utils";
import type { FetchCacheSnapshot } from "./release.types";

export type CacheDecision = {
  shouldFetch: boolean;
  reason: "missing" | "refresh-requested" | "expired" | "fresh";
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
  const expiresAt = getNextExpiry(input.weekStart, input.cache.fetchedAt, now);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return { shouldFetch: true, reason: "expired" };
  }

  return { shouldFetch: false, reason: "fresh" };
}

export function getNextExpiry(weekStart: string, fetchedAt: Date, now: Date = fetchedAt): Date | null {
  if (classifyWeek(weekStart, now) === "past" && wasFetchedAfterWeekCompleted(weekStart, fetchedAt)) {
    return null;
  }
  return new Date(fetchedAt.getTime() + 24 * 60 * 60 * 1000);
}

function wasFetchedAfterWeekCompleted(weekStart: string, fetchedAt: Date): boolean {
  const nextWeekStart = addDays(parseDateOnly(weekStart), 7);
  return fetchedAt.getTime() >= nextWeekStart.getTime();
}
