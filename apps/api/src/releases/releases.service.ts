import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { getCacheDecision, getNextExpiry } from "./cache-policy";
import { RELEASE_REPOSITORY, TMDB_CLIENT, WATCHMODE_CLIENT } from "./release.tokens";
import type { ReleaseRepository } from "./release.repository";
import type { FetchCacheSnapshot, NormalizedRelease, ReleaseWeekResponse } from "./release.types";
import type { TmdbClient } from "./tmdb.client";
import type { WatchModeClient } from "./watchmode.client";
import { buildWeekWindow } from "./week.utils";

type Clock = () => Date;

@Injectable()
export class ReleasesService {
  private refreshChain: Promise<void> = Promise.resolve();

  constructor(
    @Inject(RELEASE_REPOSITORY) private readonly repository: ReleaseRepository,
    @Inject(WATCHMODE_CLIENT) private readonly watchMode: Pick<WatchModeClient, "getReleases">,
    @Inject(TMDB_CLIENT) private readonly tmdb: Pick<TmdbClient, "isConfigured" | "getDigitalMovieReleases">,
    private readonly clock: Clock = () => new Date(),
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
    const cache = await this.repository.getFetchCoveringWeek(window.weekStart, window.weekEnd);
    const now = this.clock();
    const decision = getCacheDecision({
      weekStart: window.weekStart,
      now,
      cache,
      forceRefresh,
    });

    if (decision.shouldFetch) {
      try {
        await this.queueRefresh(() => this.fetchAndCache(window, now, forceRefresh));
      } catch (error) {
        const cachedReleases = await this.repository.getWeekReleases(window.weekStart, window.weekEnd);
        if (cache) {
          return this.toResponse(window.weekStart, window.weekEnd, cachedReleases, {
            ...cache,
            status: "stale",
            warning: error instanceof Error ? error.message : "WatchMode refresh failed.",
          });
        }

        throw new ServiceUnavailableException(
          error instanceof Error ? error.message : "WatchMode refresh failed.",
        );
      }
    }

    const tmdbWarning = await this.ensureTmdbDigitalMovies(window, now, forceRefresh);

    const releases = [
      ...(await this.repository.getWeekReleases(window.weekStart, window.weekEnd)),
      ...(await this.repository.getTmdbDigitalMovies(window.weekStart, window.weekEnd)),
    ];
    const freshCache = await this.repository.getFetchCoveringWeek(window.weekStart, window.weekEnd);
    return this.toResponse(window.weekStart, window.weekEnd, releases, freshCache, tmdbWarning);
  }

  private async fetchAndCache(
    window: ReturnType<typeof buildWeekWindow>,
    now: Date,
    forceRefresh: boolean,
  ): Promise<void> {
    if (!forceRefresh) {
      const cache = await this.repository.getFetchCoveringWeek(window.weekStart, window.weekEnd);
      const decision = getCacheDecision({
        weekStart: window.weekStart,
        now,
        cache,
        forceRefresh: false,
      });

      if (!decision.shouldFetch) return;
    }

    const result = await this.watchMode.getReleases({
      startDate: window.watchModeStart,
      endDate: window.watchModeEnd,
    });
    const coverage = getFetchCoverage(window, result.releases);

    await this.repository.saveWatchModeFetch({
      cacheKey: `watchmode:releases:${window.watchModeStart}:${window.watchModeEnd}`,
      requestedStartDate: window.weekStart,
      requestedEndDate: window.weekEnd,
      coveredStartDate: coverage.coveredStartDate,
      coveredEndDate: coverage.coveredEndDate,
      fetchedAt: now,
      releases: result.releases,
      raw: result.raw,
      quota: result.quota,
    });
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
    const decision = getCacheDecision({
      weekStart: window.weekStart,
      now,
      cache,
      forceRefresh,
    });

    if (!decision.shouldFetch) return null;

    try {
      const result = await this.tmdb.getDigitalMovieReleases({
        weekStart: window.weekStart,
        weekEnd: window.weekEnd,
      });

      await this.repository.saveTmdbDigitalWeek({
        weekStart: window.weekStart,
        weekEnd: window.weekEnd,
        fetchedAt: now,
        expiresAt: getNextExpiry(window.weekStart, now),
        releases: result.releases,
        raw: result.raw,
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "TMDB digital movie refresh failed.";
    }
  }

  private queueRefresh(refresh: () => Promise<void>): Promise<void> {
    const run = this.refreshChain.catch(() => undefined).then(refresh);
    this.refreshChain = run.catch(() => undefined);
    return run;
  }

  private toResponse(
    weekStart: string,
    weekEnd: string,
    releases: NormalizedRelease[],
    cache: FetchCacheSnapshot | null,
    warning: string | null = null,
  ): ReleaseWeekResponse {
    const sorted = [...releases].sort(compareRelease);
    const expiresAt = cache?.fetchedAt ? getNextExpiry(weekStart, cache.fetchedAt) : null;

    return {
      weekStart,
      weekEnd,
      cache: {
        status: cache?.status || "fresh",
        fetchedAt: cache?.fetchedAt?.toISOString() || null,
        expiresAt: expiresAt?.toISOString() || null,
        warning: [cache?.warning, warning].filter(Boolean).join(" ") || null,
      },
      movies: sorted.filter((release) => release.mediaType === "movie"),
      tv: sorted.filter((release) => release.mediaType === "tv"),
    };
  }
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

function getFetchCoverage(
  window: ReturnType<typeof buildWeekWindow>,
  releases: NormalizedRelease[],
): { coveredStartDate: string; coveredEndDate: string } {
  const releaseWeeks = releases.map((release) => buildWeekWindow(release.releaseDate));

  return {
    coveredStartDate: minDate([
      window.weekStart,
      ...releaseWeeks.map((releaseWeek) => releaseWeek.weekStart),
    ]),
    coveredEndDate: maxDate([
      window.weekEnd,
      ...releaseWeeks.map((releaseWeek) => releaseWeek.weekEnd),
    ]),
  };
}

function minDate(values: string[]): string {
  return values.reduce((earliest, value) => (value < earliest ? value : earliest));
}

function maxDate(values: string[]): string {
  return values.reduce((latest, value) => (value > latest ? value : latest));
}
