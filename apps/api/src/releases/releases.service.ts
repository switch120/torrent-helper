import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { getCacheDecision, getNextExpiry } from "./cache-policy";
import { DvdReleaseDatesClient } from "./dvd-release-dates.client";
import { RELEASE_REPOSITORY, TMDB_CLIENT } from "./release.tokens";
import type { ReleaseRepository } from "./release.repository";
import type { FetchCacheSnapshot, NormalizedRelease, ReleaseWeekResponse } from "./release.types";
import type { DvdDigitalRelease } from "./dvd-release-dates.client";
import { isInternationalLanguage, normalizeOriginalLanguage } from "./release-language";
import type { TmdbClient, TmdbMovieLookup } from "./tmdb.client";
import { buildWeekWindow } from "./week.utils";

type Clock = () => Date;

@Injectable()
export class ReleasesService {
  private refreshChain: Promise<void> = Promise.resolve();

  constructor(
    @Inject(RELEASE_REPOSITORY) private readonly repository: ReleaseRepository,
    @Inject(TMDB_CLIENT) private readonly tmdb: Pick<TmdbClient, "isConfigured" | "getDigitalMovieReleases" | "getTvAirings" | "findMovieByImdbId">,
    @Optional()
    private readonly clock: Clock = () => new Date(),
    @Optional()
    private readonly dvdReleaseDates: Pick<DvdReleaseDatesClient, "getDigitalMovieReleases"> = new DvdReleaseDatesClient(),
  ) {}

  async getWeek(weekStartInput: string): Promise<ReleaseWeekResponse> {
    return this.loadWeek(weekStartInput, false);
  }

  async refreshWeek(weekStartInput: string): Promise<ReleaseWeekResponse> {
    return this.loadWeek(weekStartInput, true);
  }

  private async loadWeek(
    weekStartInput: string,
    forceRefresh: boolean,
  ): Promise<ReleaseWeekResponse> {
    const window = this.buildWindow(weekStartInput);
    const now = this.clock();
    const tmdbConfigured = this.tmdb.isConfigured();

    if (!tmdbConfigured) {
      return this.toResponse(
        window.weekStart,
        window.weekEnd,
        [],
        null,
        "TMDB_API_KEY or TMDB_READ_ACCESS_TOKEN is required to fetch release data.",
      );
    }

    const tmdbWarning = await this.ensureTmdbDigitalMovies(window, now, forceRefresh);
    const tmdbTvWarning = await this.ensureTmdbTvAirings(window, now, forceRefresh);
    const releases = [
      ...(await this.repository.getTmdbDigitalMovies(window.weekStart, window.weekEnd)),
      ...(await this.repository.getTmdbTvAirings(window.weekStart, window.weekEnd)),
    ];
    const cache = await this.getTmdbCacheSnapshot(window.weekStart, window.weekEnd);

    return this.toResponse(
      window.weekStart,
      window.weekEnd,
      dedupeReleases(releases),
      cache,
      joinWarnings(tmdbWarning, tmdbTvWarning),
    );
  }

  private buildWindow(weekStartInput: string): ReturnType<typeof buildWeekWindow> {
    try {
      return buildWeekWindow(weekStartInput);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid release week start date.",
      );
    }
  }

  private async ensureTmdbDigitalMovies(
    window: ReturnType<typeof buildWeekWindow>,
    now: Date,
    forceRefresh: boolean,
  ): Promise<string | null> {
    if (!this.tmdb.isConfigured()) return null;

    const cache = await this.repository.getTmdbDigitalWeekCache(window.weekStart);
    const decision = getRefreshDecision({
      weekStart: window.weekStart,
      now,
      cache,
      forceRefresh,
    });

    if (!decision.shouldFetch) return null;

    return this.queueRefresh(async () => {
      const latestCache = await this.repository.getTmdbDigitalWeekCache(window.weekStart);
      const latestDecision = getRefreshDecision({
        weekStart: window.weekStart,
        now,
        cache: latestCache,
        forceRefresh,
      });

      if (!latestDecision.shouldFetch) return null;

      try {
        const result = await this.tmdb.getDigitalMovieReleases({
          weekStart: window.weekStart,
          weekEnd: window.weekEnd,
        });
        const supplemental = await this.getSupplementalDigitalMovies(window, result.releases);
        const releases = dedupeReleases([...result.releases, ...supplemental.releases]);

        await this.repository.saveTmdbDigitalWeek({
          weekStart: window.weekStart,
          weekEnd: window.weekEnd,
          fetchedAt: now,
          expiresAt: getNextExpiry(window.weekStart, now),
          releases,
          raw: withSupplementalRaw(result.raw, supplemental.raw),
        });
        return supplemental.warning;
      } catch (error) {
        return error instanceof Error ? error.message : "TMDB digital movie refresh failed.";
      }
    });
  }

  private async ensureTmdbTvAirings(
    window: ReturnType<typeof buildWeekWindow>,
    now: Date,
    forceRefresh: boolean,
  ): Promise<string | null> {
    if (!this.tmdb.isConfigured()) return null;

    const cache = await this.repository.getTmdbTvWeekCache(window.weekStart);
    const decision = getRefreshDecision({
      weekStart: window.weekStart,
      now,
      cache,
      forceRefresh,
    });

    if (!decision.shouldFetch) return null;

    return this.queueRefresh(async () => {
      const latestCache = await this.repository.getTmdbTvWeekCache(window.weekStart);
      const latestDecision = getRefreshDecision({
        weekStart: window.weekStart,
        now,
        cache: latestCache,
        forceRefresh,
      });

      if (!latestDecision.shouldFetch) return null;

      try {
        const result = await this.tmdb.getTvAirings({
          weekStart: window.weekStart,
          weekEnd: window.weekEnd,
        });

        await this.repository.saveTmdbTvWeek({
          weekStart: window.weekStart,
          weekEnd: window.weekEnd,
          fetchedAt: now,
          expiresAt: getNextExpiry(window.weekStart, now),
          releases: result.releases,
          raw: result.raw,
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "TMDB TV refresh failed.";
      }
    });
  }

  private async getTmdbCacheSnapshot(
    weekStart: string,
    weekEnd: string,
  ): Promise<FetchCacheSnapshot | null> {
    const caches = [
      await this.repository.getTmdbDigitalWeekCache(weekStart),
      await this.repository.getTmdbTvWeekCache(weekStart),
    ].filter((cache): cache is NonNullable<typeof cache> => Boolean(cache));

    if (caches.length === 0) return null;

    const fetchedAt = caches
      .map((cache) => cache.fetchedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;

    return {
      cacheKey: `tmdb:week:${weekStart}:${weekEnd}`,
      coveredStartDate: weekStart,
      coveredEndDate: weekEnd,
      fetchedAt,
      status: caches.some((cache) => cache.status === "stale") ? "stale" : "fresh",
      warning: joinWarnings(...caches.map((cache) => cache.warning)),
    };
  }

  private queueRefresh<T>(refresh: () => Promise<T>): Promise<T> {
    const run = this.refreshChain.catch(() => undefined).then(refresh);
    this.refreshChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async getSupplementalDigitalMovies(
    window: ReturnType<typeof buildWeekWindow>,
    tmdbReleases: NormalizedRelease[],
  ): Promise<{
    releases: NormalizedRelease[];
    raw: unknown;
    warning: string | null;
  }> {
    try {
      const result = await this.dvdReleaseDates.getDigitalMovieReleases({
        weekStart: window.weekStart,
        weekEnd: window.weekEnd,
      });
      return {
        releases: await this.normalizeDvdDigitalMovies(result.releases, tmdbReleases),
        raw: result.raw,
        warning: null,
      };
    } catch (error) {
      return {
        releases: [],
        raw: { error: error instanceof Error ? error.message : "DVDsReleaseDates refresh failed." },
        warning: error instanceof Error ? error.message : "DVDsReleaseDates refresh failed.",
      };
    }
  }

  private async normalizeDvdDigitalMovies(
    releases: DvdDigitalRelease[],
    tmdbReleases: NormalizedRelease[],
  ): Promise<NormalizedRelease[]> {
    const existingKeys = new Set(
      tmdbReleases
        .filter((release) => release.tmdbId)
        .map((release) => `${release.tmdbId}:${release.releaseDate}`),
    );
    const normalized: NormalizedRelease[] = [];

    for (const release of releases) {
      if (!release.imdbId) continue;
      const tmdbMovie = await this.tmdb.findMovieByImdbId(release.imdbId);
      if (!tmdbMovie || existingKeys.has(`${tmdbMovie.id}:${release.releaseDate}`)) continue;
      normalized.push(normalizeDvdDigitalMovie(release, tmdbMovie));
    }

    return normalized;
  }

  private toResponse(
    weekStart: string,
    weekEnd: string,
    releases: NormalizedRelease[],
    cache: FetchCacheSnapshot | null,
    warning: string | null = null,
  ): ReleaseWeekResponse {
    const sorted = [...releases].sort(compareRelease);
    const expiresAt = cache?.fetchedAt ? getNextExpiry(weekStart, cache.fetchedAt, this.clock()) : null;

    return {
      weekStart,
      weekEnd,
      cache: {
        status: cache?.status || "fresh",
        fetchedAt: cache?.fetchedAt?.toISOString() || null,
        expiresAt: expiresAt?.toISOString() || null,
        warning: joinWarnings(cache?.warning || null, warning),
      },
      movies: sorted.filter((release) => release.mediaType === "movie"),
      tv: sorted.filter((release) => release.mediaType === "tv"),
    };
  }
}

function getRefreshDecision(input: Parameters<typeof getCacheDecision>[0]) {
  return getCacheDecision(input);
}

function normalizeDvdDigitalMovie(release: DvdDigitalRelease, tmdbMovie: TmdbMovieLookup): NormalizedRelease {
  const originalLanguage = normalizeOriginalLanguage(tmdbMovie.originalLanguage);
  return {
    eventId: `dvdsreleasedates:digital:${release.sourceTitleId}:${release.releaseDate}`,
    sourceTitleId: release.sourceTitleId,
    releaseSource: "dvdsreleasedates",
    releaseKind: "digital",
    title: release.title || tmdbMovie.title,
    titleType: "movie",
    mediaType: "movie",
    tmdbId: tmdbMovie.id,
    tmdbType: "movie",
    imdbId: release.imdbId,
    posterUrl: release.posterUrl || tmdbMovie.posterUrl,
    releaseDate: release.releaseDate,
    sourceId: release.sourceTitleId,
    sourceName: "Digital HD",
    sourceType: "digital",
    seasonNumber: null,
    isOriginal: false,
    primaryReleaseDate: tmdbMovie.releaseDate,
    popularity: tmdbMovie.popularity,
    voteAverage: tmdbMovie.voteAverage ?? release.imdbRating,
    voteCount: tmdbMovie.voteCount,
    isFeaturedDigital: true,
    isDigitalDateFallback: false,
    originalLanguage,
    isInternational: isInternationalLanguage(originalLanguage),
    isDubbed: false,
  };
}

function withSupplementalRaw(raw: unknown, supplementalRaw: unknown): unknown {
  if (isRecord(raw)) {
    return {
      ...raw,
      supplementalDigitalReleases: {
        dvdsReleaseDates: supplementalRaw,
      },
    };
  }

  return {
    tmdb: raw,
    supplementalDigitalReleases: {
      dvdsReleaseDates: supplementalRaw,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareRelease(a: NormalizedRelease, b: NormalizedRelease): number {
  const priority = getReleasePriority(a) - getReleasePriority(b);
  if (priority !== 0) return priority;

  if (a.isFeaturedDigital || b.isFeaturedDigital) {
    const popularity = (b.popularity ?? 0) - (a.popularity ?? 0);
    if (popularity !== 0) return popularity;

    const voteCount = (b.voteCount ?? 0) - (a.voteCount ?? 0);
    if (voteCount !== 0) return voteCount;
  }

  return (
    a.releaseDate.localeCompare(b.releaseDate) ||
    a.title.localeCompare(b.title) ||
    a.sourceName.localeCompare(b.sourceName)
  );
}

function getReleasePriority(release: NormalizedRelease): number {
  if (release.mediaType !== "movie") return 3;
  if (release.releaseKind === "digital" && release.isFeaturedDigital) return 0;
  if (release.releaseKind === "streaming") return 1;
  if (release.releaseKind === "digital") return 2;
  return 3;
}

function dedupeReleases(releases: NormalizedRelease[]): NormalizedRelease[] {
  const byKey = new Map<string, NormalizedRelease>();

  for (const release of releases) {
    const key = dedupeKey(release);
    const existing = byKey.get(key);
    if (!existing || shouldReplaceRelease(existing, release)) {
      byKey.set(key, release);
    }
  }

  return [...byKey.values()];
}

function dedupeKey(release: NormalizedRelease): string {
  const base = [
    release.mediaType,
    release.tmdbId || release.sourceTitleId || release.title.toLowerCase(),
    release.releaseDate,
    release.seasonNumber ?? "none",
    release.episodeNumber ?? "none",
  ];

  if (release.mediaType === "tv" && release.releaseSource === "tmdb") {
    return base.join(":");
  }

  return [...base, normalizeSourceName(release.sourceName)].join(":");
}

function shouldReplaceRelease(existing: NormalizedRelease, next: NormalizedRelease): boolean {
  if (existing.releaseSource !== "tmdb" && next.releaseSource === "tmdb") return true;
  if (existing.releaseSource === "tmdb" && next.releaseSource !== "tmdb") return false;
  if (existing.sourceName === "TV airing" && next.sourceName !== "TV airing") return true;
  return false;
}

function normalizeSourceName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function joinWarnings(...warnings: Array<string | null>): string | null {
  return [...new Set(warnings.filter(Boolean))].join(" ") || null;
}
