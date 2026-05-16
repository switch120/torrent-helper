import type { FetchCacheSnapshot, NormalizedRelease } from "./release.types";
import type { WatchModeQuota } from "./watchmode.client";

export type SaveWatchModeFetchInput = {
  cacheKey: string;
  requestedStartDate: string;
  requestedEndDate: string;
  coveredStartDate: string;
  coveredEndDate: string;
  fetchedAt: Date;
  releases: NormalizedRelease[];
  raw: unknown;
  quota: WatchModeQuota;
};

export type TmdbDigitalWeekCacheSnapshot = {
  weekStart: string;
  weekEnd: string;
  fetchedAt: Date | null;
  status: "fresh" | "stale";
  warning: string | null;
};

export type SaveTmdbDigitalWeekInput = {
  weekStart: string;
  weekEnd: string;
  fetchedAt: Date;
  expiresAt: Date | null;
  releases: NormalizedRelease[];
  raw: unknown;
};

export interface ReleaseRepository {
  getFetchCoveringWeek(
    weekStart: string,
    weekEnd: string,
  ): Promise<FetchCacheSnapshot | null>;
  getWeekReleases(
    weekStart: string,
    weekEnd: string,
  ): Promise<NormalizedRelease[]>;
  saveWatchModeFetch(input: SaveWatchModeFetchInput): Promise<void>;
  getTmdbDigitalWeekCache(weekStart: string): Promise<TmdbDigitalWeekCacheSnapshot | null>;
  getTmdbDigitalMovies(
    weekStart: string,
    weekEnd: string,
  ): Promise<NormalizedRelease[]>;
  saveTmdbDigitalWeek(input: SaveTmdbDigitalWeekInput): Promise<void>;
}
