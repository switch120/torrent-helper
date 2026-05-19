import type { FetchCacheSnapshot, NormalizedRelease } from "./release.types";
import type { ReleaseDetail } from "./release-detail.types";
import type { WatchModeQuota } from "./watchmode.client";
import type { DownloadHistoryStatus } from "../downloads/download.types";
import type { TorrentResult, TorrentSearchQuality } from "../torrents/torrent.types";

export type DownloadRecordSnapshot = {
  id: number;
  userId: number | null;
  releaseEventId: string;
  tmdbId: number | null;
  title: string | null;
  transmissionTorrentId: number | null;
  torrentName: string;
  magnetLink: string;
  magnetHash: string | null;
  downloadDir: string;
  status: DownloadHistoryStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

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

export type TmdbTvWeekCacheSnapshot = TmdbDigitalWeekCacheSnapshot;
export type SaveTmdbTvWeekInput = SaveTmdbDigitalWeekInput;

export type TorrentSearchCacheSnapshot = {
  results: TorrentResult[];
  warning: string | null;
  hasSearchMetadata: boolean;
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
  getTmdbTvWeekCache(weekStart: string): Promise<TmdbTvWeekCacheSnapshot | null>;
  getTmdbTvAirings(
    weekStart: string,
    weekEnd: string,
  ): Promise<NormalizedRelease[]>;
  saveTmdbTvWeek(input: SaveTmdbTvWeekInput): Promise<void>;
  getReleaseByEventId(eventId: string): Promise<NormalizedRelease | null>;
  getReleaseDetail(eventId: string): Promise<ReleaseDetail | null>;
  saveReleaseDetail(detail: ReleaseDetail, fetchedAt: Date): Promise<void>;
  getTorrentSearchCache(
    eventId: string,
    quality: TorrentSearchQuality,
    now: Date,
  ): Promise<TorrentSearchCacheSnapshot | null>;
  saveTorrentSearchCache(input: {
    eventId: string;
    quality: TorrentSearchQuality;
    results: TorrentResult[];
    raw: unknown;
    fetchedAt: Date;
    expiresAt: Date;
  }): Promise<void>;
  saveDownloadRecord(input: {
    userId: number;
    releaseEventId: string;
    tmdbId: number | null;
    title: string;
    transmissionTorrentId: number | null;
    torrentName: string;
    magnetLink: string;
    magnetHash: string | null;
    downloadDir: string;
    status: DownloadHistoryStatus;
  }): Promise<DownloadRecordSnapshot>;
  getDownloadRecords(userId?: number): Promise<DownloadRecordSnapshot[]>;
  findDownloadRecordByMagnet(
    userId: number,
    magnetLink: string,
    magnetHash: string | null,
  ): Promise<DownloadRecordSnapshot | null>;
  markDownloadRecordsCompleted(transmissionTorrentId: number, completedAt: Date): Promise<number>;
  deleteDownloadRecord(userId: number, id: number): Promise<boolean>;
}
