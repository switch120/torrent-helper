import type { NormalizedRelease, ReleaseMediaType } from "./release.types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type WatchModeQuota = {
  rateLimitLimit?: number;
  rateLimitRemaining?: number;
  accountQuota?: number;
  accountQuotaUsed?: number;
};

export type WatchModeReleaseResult = {
  releases: NormalizedRelease[];
  raw: unknown;
  quota: WatchModeQuota;
};

type WatchModeClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

type WatchModeApiRelease = {
  id: number;
  title: string;
  type: string;
  tmdb_id?: number | null;
  tmdb_type?: string | null;
  imdb_id?: string | null;
  season_number?: number | null;
  poster_url?: string | null;
  source_release_date: string;
  source_id: number;
  source_name: string;
  is_original?: 0 | 1 | boolean | null;
};

type WatchModeApiResponse = {
  releases?: WatchModeApiRelease[];
};

export class WatchModeClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: WatchModeClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.watchmode.com";
    this.fetchImpl = config.fetchImpl || fetch;
  }

  async getReleases(input: {
    startDate: number;
    endDate: number;
  }): Promise<WatchModeReleaseResult> {
    if (!this.apiKey) {
      throw new Error("WATCHMODE_API_KEY is required to fetch release data.");
    }

    const url = new URL("/v1/releases/", this.baseUrl);
    url.searchParams.set("apiKey", this.apiKey);
    url.searchParams.set("start_date", String(input.startDate));
    url.searchParams.set("end_date", String(input.endDate));
    url.searchParams.set("limit", "250");

    const response = await this.fetchImpl(url.toString());
    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      const statusMessage = response.statusText || "WatchMode request failed";
      throw new Error(`WatchMode ${response.status}: ${statusMessage}`);
    }

    const body = raw as WatchModeApiResponse;
    return {
      releases: (body.releases || []).map(normalizeRelease),
      raw,
      quota: readQuota(response.headers),
    };
  }
}

function normalizeRelease(release: WatchModeApiRelease): NormalizedRelease {
  const seasonNumber = release.season_number ?? null;
  const releaseDate = release.source_release_date;
  const mediaType = classifyMediaType(release.type);

  return {
    eventId: [
      release.id,
      release.source_id,
      releaseDate,
      seasonNumber ?? "none",
    ].join(":"),
    watchmodeId: release.id,
    releaseSource: "watchmode",
    releaseKind: "streaming",
    title: release.title,
    titleType: release.type,
    mediaType,
    tmdbId: release.tmdb_id ?? null,
    tmdbType: release.tmdb_type ?? null,
    imdbId: release.imdb_id ?? null,
    posterUrl: release.poster_url ?? null,
    releaseDate,
    sourceId: release.source_id,
    sourceName: release.source_name,
    sourceType: "unknown",
    seasonNumber,
    isOriginal: release.is_original === true || release.is_original === 1,
  };
}

function classifyMediaType(titleType: string): ReleaseMediaType {
  if (["tv_series", "tv_miniseries", "tv_special"].includes(titleType)) {
    return "tv";
  }

  return "movie";
}

function readQuota(headers: Headers): WatchModeQuota {
  return {
    rateLimitLimit: readNumberHeader(headers, "x-ratelimit-limit"),
    rateLimitRemaining: readNumberHeader(headers, "x-ratelimit-remaining"),
    accountQuota: readNumberHeader(headers, "x-account-quota"),
    accountQuotaUsed: readNumberHeader(headers, "x-account-quota-used"),
  };
}

function readNumberHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
