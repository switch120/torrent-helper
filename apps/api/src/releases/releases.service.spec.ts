import { describe, expect, it, vi } from "vitest";
import { ReleasesService } from "./releases.service";
import type { ReleaseRepository } from "./release.repository";
import type { NormalizedRelease } from "./release.types";
import type { TmdbDigitalReleaseResult, TmdbTvAiringResult } from "./tmdb.client";
import type { WatchModeReleaseResult } from "./watchmode.client";

describe("ReleasesService", () => {
  it("returns cached releases without fetching when the week cache is fresh", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue({
      cacheKey: "releases:20260511000000:20260517235959",
      coveredStartDate: "2026-05-11",
      coveredEndDate: "2026-06-14",
      fetchedAt: new Date("2026-05-16T08:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    repository.getWeekReleases.mockResolvedValue([
      release({ title: "Cached Movie", mediaType: "movie" }),
    ]);
    const watchMode = createWatchMode();
    const tmdb = createTmdb({ configured: false });
    const service = new ReleasesService(repository, watchMode, tmdb, () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-18");

    expect(watchMode.getReleases).not.toHaveBeenCalled();
    expect(tmdb.getDigitalMovieReleases).not.toHaveBeenCalled();
    expect(result.cache.status).toBe("fresh");
    expect(result.movies).toHaveLength(1);
    expect(result.tv).toHaveLength(0);
  });

  it("fetches, stores, and groups a missing week", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([
      release({ title: "Movie", mediaType: "movie" }),
      release({ title: "Series", mediaType: "tv" }),
    ]);
    const watchMode = createWatchMode({
      releases: [
        release({ title: "Movie", mediaType: "movie" }),
        release({ title: "Series", mediaType: "tv" }),
      ],
    });
    const service = new ReleasesService(repository, watchMode, createTmdb({ configured: false }), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(watchMode.getReleases).toHaveBeenCalledWith({
      startDate: 20260511,
      endDate: 20260517,
    });
    expect(repository.saveWatchModeFetch).toHaveBeenCalled();
    expect(result.movies.map((item) => item.title)).toEqual(["Movie"]);
    expect(result.tv.map((item) => item.title)).toEqual(["Series"]);
  });

  it("saves wider WatchMode responses and filters to the selected week when reading", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([
      release({ title: "In Week", mediaType: "movie", releaseDate: "2026-05-12" }),
    ]);
    const watchMode = createWatchMode({
      releases: [
        release({ title: "In Week", mediaType: "movie", releaseDate: "2026-05-12" }),
        release({ title: "Too Early", mediaType: "movie", releaseDate: "2026-05-10" }),
        release({ title: "Too Late", mediaType: "tv", releaseDate: "2026-05-18" }),
      ],
    });
    const service = new ReleasesService(repository, watchMode, createTmdb({ configured: false }), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(repository.saveWatchModeFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        releases: [
          expect.objectContaining({
            title: "In Week",
            releaseDate: "2026-05-12",
          }),
          expect.objectContaining({
            title: "Too Early",
            releaseDate: "2026-05-10",
          }),
          expect.objectContaining({
            title: "Too Late",
            releaseDate: "2026-05-18",
          }),
        ],
      }),
    );
    expect(result.movies.map((item) => item.title)).toEqual(["In Week"]);
  });

  it("caches every week represented in a wider WatchMode response", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([
      release({ title: "Selected Week", mediaType: "movie", releaseDate: "2026-05-12" }),
    ]);
    const watchMode = createWatchMode({
      releases: [
        release({ title: "Selected Week", mediaType: "movie", releaseDate: "2026-05-12" }),
        release({ title: "Next Week", mediaType: "tv", releaseDate: "2026-05-19" }),
      ],
    });
    const service = new ReleasesService(repository, watchMode, createTmdb({ configured: false }), () => new Date("2026-05-16T12:00:00.000Z"));

    await service.getWeek("2026-05-11");

    expect(repository.saveWatchModeFetch).toHaveBeenCalledTimes(1);
    expect(repository.saveWatchModeFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedStartDate: "2026-05-11",
        requestedEndDate: "2026-05-17",
        coveredStartDate: "2026-05-11",
        coveredEndDate: "2026-05-24",
        releases: [
          expect.objectContaining({ title: "Selected Week" }),
          expect.objectContaining({ title: "Next Week" }),
        ],
      }),
    );
  });

  it("caches the selected week even when WatchMode returns no releases in that week", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([]);
    const watchMode = createWatchMode({
      releases: [
        release({ title: "Next Week", mediaType: "tv", releaseDate: "2026-05-19" }),
      ],
    });
    const service = new ReleasesService(repository, watchMode, createTmdb({ configured: false }), () => new Date("2026-05-16T12:00:00.000Z"));

    await service.getWeek("2026-05-11");

    expect(repository.saveWatchModeFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedStartDate: "2026-05-11",
        requestedEndDate: "2026-05-17",
        coveredStartDate: "2026-05-11",
        coveredEndDate: "2026-05-24",
        releases: [expect.objectContaining({ title: "Next Week" })],
      }),
    );
  });

  it("serializes overlapping refreshes and reuses weeks warmed by the first fetch", async () => {
    const repository = createStatefulRepository();
    const watchMode = createWatchMode({
      releases: [
        release({ title: "Selected Week", mediaType: "movie", releaseDate: "2026-05-12" }),
        release({ title: "Next Week", mediaType: "tv", releaseDate: "2026-05-19" }),
      ],
    });
    watchMode.getReleases.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        releases: [
          release({ title: "Selected Week", mediaType: "movie", releaseDate: "2026-05-12" }),
          release({ title: "Next Week", mediaType: "tv", releaseDate: "2026-05-19" }),
        ],
        raw: { releases: [] },
        quota: {},
      };
    });
    const service = new ReleasesService(repository, watchMode, createTmdb({ configured: false }), () => new Date("2026-05-16T12:00:00.000Z"));

    const [current, future] = await Promise.all([
      service.getWeek("2026-05-11"),
      service.getWeek("2026-05-18"),
    ]);

    expect(watchMode.getReleases).toHaveBeenCalledTimes(1);
    expect(current.movies.map((item) => item.title)).toEqual(["Selected Week"]);
    expect(future.tv.map((item) => item.title)).toEqual(["Next Week"]);
  });

  it("returns stale cached releases with a warning when WatchMode fails", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue({
      cacheKey: "releases:20260511000000:20260517235959",
      coveredStartDate: "2026-05-11",
      coveredEndDate: "2026-05-17",
      fetchedAt: new Date("2026-05-15T00:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    repository.getWeekReleases.mockResolvedValue([
      release({ title: "Old Movie", mediaType: "movie" }),
    ]);
    const watchMode = createWatchMode();
    watchMode.getReleases.mockRejectedValue(new Error("quota exceeded"));
    const service = new ReleasesService(repository, watchMode, createTmdb({ configured: false }), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(result.cache.status).toBe("stale");
    expect(result.cache.warning).toContain("quota exceeded");
    expect(result.movies.map((item) => item.title)).toEqual(["Old Movie"]);
  });

  it("returns an empty week with a warning when WatchMode fails without cached data", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([]);
    const watchMode = createWatchMode();
    watchMode.getReleases.mockRejectedValue(new Error("WATCHMODE_API_KEY is required"));
    const service = new ReleasesService(repository, watchMode, createTmdb({ configured: false }), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(result.cache.warning).toContain("WATCHMODE_API_KEY is required");
    expect(result.movies).toEqual([]);
    expect(result.tv).toEqual([]);
  });

  it("returns a bad request error for invalid week dates", async () => {
    const repository = createRepository();
    const watchMode = createWatchMode();
    const service = new ReleasesService(repository, watchMode, createTmdb({ configured: false }), () => new Date("2026-05-16T12:00:00.000Z"));

    await expect(service.getWeek("not-a-date")).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: 'Expected date in YYYY-MM-DD format, received "not-a-date".',
      },
    });
    expect(repository.getFetchCoveringWeek).not.toHaveBeenCalled();
    expect(watchMode.getReleases).not.toHaveBeenCalled();
  });

  it("adds cached TMDB digital movies into the movie silo", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue({
      cacheKey: "watchmode:releases:20260511000000:20260517235959",
      coveredStartDate: "2026-05-11",
      coveredEndDate: "2026-05-17",
      fetchedAt: new Date("2026-05-16T08:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    repository.getTmdbDigitalWeekCache.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([
      release({ title: "WatchMode Movie", mediaType: "movie", releaseDate: "2026-05-12" }),
    ]);
    repository.getTmdbDigitalMovies.mockResolvedValue([
      release({
        eventId: "tmdb:digital:100:2026-05-13",
        watchmodeId: 100,
        releaseSource: "tmdb",
        releaseKind: "digital",
        title: "TMDB Digital Movie",
        sourceId: 0,
        sourceName: "Digital release",
        sourceType: "digital",
        tmdbId: 100,
        releaseDate: "2026-05-13",
        isOriginal: false,
      }),
    ]);
    const tmdbRelease = release({
      eventId: "tmdb:digital:100:2026-05-13",
      watchmodeId: 100,
      releaseSource: "tmdb",
      releaseKind: "digital",
      title: "TMDB Digital Movie",
      sourceId: 0,
      sourceName: "Digital release",
      sourceType: "digital",
      tmdbId: 100,
      releaseDate: "2026-05-13",
      isOriginal: false,
    });
    const watchMode = createWatchMode();
    const tmdb = createTmdb({ releases: [tmdbRelease] });
    const service = new ReleasesService(repository, watchMode, tmdb, () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(repository.saveTmdbDigitalWeek).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStart: "2026-05-11",
        weekEnd: "2026-05-17",
        releases: [expect.objectContaining({ title: "TMDB Digital Movie" })],
      }),
    );
    expect(result.movies.map((item) => item.title)).toEqual([
      "TMDB Digital Movie",
    ]);
  });

  it("adds cached TMDB TV airings into the TV silo when WatchMode misses weekly episodes", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue({
      cacheKey: "watchmode:releases:20260511000000:20260517235959",
      coveredStartDate: "2026-05-11",
      coveredEndDate: "2026-05-17",
      fetchedAt: new Date("2026-05-16T08:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    repository.getWeekReleases.mockResolvedValue([]);
    repository.getTmdbTvAirings.mockResolvedValue([
      release({
        eventId: "tmdb:tv:87917:350:2026-05-15:5:8",
        watchmodeId: 87917,
        releaseSource: "tmdb",
        releaseKind: "streaming",
        title: "For All Mankind",
        titleType: "tv_series",
        mediaType: "tv",
        tmdbId: 87917,
        tmdbType: "tv",
        sourceId: 350,
        sourceName: "Apple TV+",
        sourceType: "sub",
        releaseDate: "2026-05-15",
        seasonNumber: 5,
        episodeNumber: 8,
        episodeName: "In the Week",
      }),
    ]);
    const tmdbTvRelease = release({
      eventId: "tmdb:tv:87917:350:2026-05-15:5:8",
      watchmodeId: 87917,
      releaseSource: "tmdb",
      releaseKind: "streaming",
      title: "For All Mankind",
      titleType: "tv_series",
      mediaType: "tv",
      tmdbId: 87917,
      tmdbType: "tv",
      sourceId: 350,
      sourceName: "Apple TV+",
      sourceType: "sub",
      releaseDate: "2026-05-15",
      seasonNumber: 5,
      episodeNumber: 8,
      episodeName: "In the Week",
    });
    const tmdb = createTmdb({ tvReleases: [tmdbTvRelease] });
    const service = new ReleasesService(repository, createWatchMode(), tmdb, () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(repository.saveTmdbTvWeek).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStart: "2026-05-11",
        weekEnd: "2026-05-17",
        releases: [expect.objectContaining({ title: "For All Mankind" })],
      }),
    );
    expect(result.tv.map((item) => item.title)).toEqual(["For All Mankind"]);
  });

  it("uses TMDB weekly data as the primary release surface when TMDB is configured", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([
      release({
        eventId: "wm:tv:bad-provider",
        title: "Your Friends & Neighbors",
        mediaType: "tv",
        releaseSource: "watchmode",
        sourceName: "Prime Video",
        releaseDate: "2026-05-14",
      }),
    ]);
    repository.getTmdbDigitalMovies.mockResolvedValue([
      release({
        eventId: "tmdb:digital:100:2026-05-12",
        watchmodeId: 100,
        releaseSource: "tmdb",
        releaseKind: "digital",
        title: "TMDB Movie",
        mediaType: "movie",
        tmdbId: 100,
        sourceName: "Digital release",
        sourceType: "digital",
        releaseDate: "2026-05-12",
      }),
    ]);
    repository.getTmdbTvAirings.mockResolvedValue([
      release({
        eventId: "tmdb:tv:241609:2026-05-14:2:7",
        watchmodeId: 241609,
        releaseSource: "tmdb",
        releaseKind: "streaming",
        title: "Your Friends & Neighbors",
        titleType: "tv_series",
        mediaType: "tv",
        tmdbId: 241609,
        tmdbType: "tv",
        sourceId: 2552,
        sourceName: "Apple TV+",
        sourceType: "unknown",
        releaseDate: "2026-05-14",
        seasonNumber: 2,
        episodeNumber: 7,
      }),
    ]);
    const watchMode = createWatchMode();
    const service = new ReleasesService(repository, watchMode, createTmdb(), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(watchMode.getReleases).not.toHaveBeenCalled();
    expect(repository.getWeekReleases).not.toHaveBeenCalled();
    expect(result.movies.map((item) => item.title)).toEqual(["TMDB Movie"]);
    expect(result.tv.map((item) => item.sourceName)).toEqual(["Apple TV+"]);
  });

  it("does not force-refresh cached past TMDB weeks", async () => {
    const repository = createRepository();
    repository.getTmdbDigitalWeekCache.mockResolvedValue({
      weekStart: "2026-05-04",
      weekEnd: "2026-05-10",
      fetchedAt: new Date("2026-05-12T12:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    repository.getTmdbTvWeekCache.mockResolvedValue({
      weekStart: "2026-05-04",
      weekEnd: "2026-05-10",
      fetchedAt: new Date("2026-05-12T12:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    repository.getTmdbDigitalMovies.mockResolvedValue([
      release({
        eventId: "tmdb:digital:100:2026-05-05",
        releaseSource: "tmdb",
        releaseKind: "digital",
        title: "Cached Digital",
        mediaType: "movie",
        tmdbId: 100,
        releaseDate: "2026-05-05",
        sourceName: "Digital release",
        sourceType: "digital",
      }),
    ]);
    const tmdb = createTmdb();
    const service = new ReleasesService(repository, createWatchMode(), tmdb, () => new Date("2026-05-18T12:00:00.000Z"));

    const result = await service.refreshWeek("2026-05-04");

    expect(tmdb.getDigitalMovieReleases).not.toHaveBeenCalled();
    expect(tmdb.getTvAirings).not.toHaveBeenCalled();
    expect(result.movies.map((item) => item.title)).toEqual(["Cached Digital"]);
    expect(result.cache.warning).toBeNull();
  });

  it("serializes overlapping TMDB week refreshes and reuses the cache warmed by the first fetch", async () => {
    const repository = createRepository();
    let digitalCacheWarmed = false;
    repository.getTmdbDigitalWeekCache.mockImplementation(async () =>
      digitalCacheWarmed
        ? {
            weekStart: "2026-05-18",
            weekEnd: "2026-05-24",
            fetchedAt: new Date("2026-05-18T12:00:00.000Z"),
            status: "fresh",
            warning: null,
          }
        : null,
    );
    repository.saveTmdbDigitalWeek.mockImplementation(async () => {
      digitalCacheWarmed = true;
    });
    repository.getTmdbTvWeekCache.mockResolvedValue({
      weekStart: "2026-05-18",
      weekEnd: "2026-05-24",
      fetchedAt: new Date("2026-05-18T12:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    const tmdbRelease = release({
      eventId: "tmdb:digital:100:2026-05-19",
      releaseSource: "tmdb",
      releaseKind: "digital",
      title: "Warmed Digital",
      mediaType: "movie",
      tmdbId: 100,
      releaseDate: "2026-05-19",
      sourceName: "Digital release",
      sourceType: "digital",
    });
    repository.getTmdbDigitalMovies.mockResolvedValue([tmdbRelease]);
    const tmdb = createTmdb({ releases: [tmdbRelease] });
    tmdb.getDigitalMovieReleases.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { releases: [tmdbRelease], raw: { results: [] } };
    });
    const service = new ReleasesService(repository, createWatchMode(), tmdb, () => new Date("2026-05-18T12:00:00.000Z"));

    const [first, second] = await Promise.all([
      service.getWeek("2026-05-18"),
      service.getWeek("2026-05-18"),
    ]);

    expect(tmdb.getDigitalMovieReleases).toHaveBeenCalledTimes(1);
    expect(first.movies.map((item) => item.title)).toEqual(["Warmed Digital"]);
    expect(second.movies.map((item) => item.title)).toEqual(["Warmed Digital"]);
  });

  it("collapses duplicate TMDB TV cached rows for the same episode", async () => {
    const repository = createRepository();
    repository.getTmdbTvAirings.mockResolvedValue([
      release({
        eventId: "tmdb:tv:241609:350:2026-05-14:2:7",
        watchmodeId: 241609,
        releaseSource: "tmdb",
        releaseKind: "streaming",
        title: "Your Friends & Neighbors",
        titleType: "tv_series",
        mediaType: "tv",
        tmdbId: 241609,
        tmdbType: "tv",
        sourceId: 2552,
        sourceName: "Apple TV+",
        sourceType: "unknown",
        releaseDate: "2026-05-14",
        seasonNumber: 2,
        episodeNumber: 7,
      }),
      release({
        eventId: "tmdb:tv:241609:9:2026-05-14:2:7",
        watchmodeId: 241609,
        releaseSource: "tmdb",
        releaseKind: "streaming",
        title: "Your Friends & Neighbors",
        titleType: "tv_series",
        mediaType: "tv",
        tmdbId: 241609,
        tmdbType: "tv",
        sourceId: 9,
        sourceName: "Prime Video",
        sourceType: "sub",
        releaseDate: "2026-05-14",
        seasonNumber: 2,
        episodeNumber: 7,
      }),
    ]);
    const service = new ReleasesService(repository, createWatchMode(), createTmdb(), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(result.tv).toHaveLength(1);
    expect(result.tv[0]).toEqual(expect.objectContaining({
      eventId: "tmdb:tv:241609:350:2026-05-14:2:7",
      sourceName: "Apple TV+",
    }));
  });

  it("keeps returning TMDB-primary weekly rows when WatchMode fails without a cache", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([]);
    repository.getTmdbDigitalMovies.mockResolvedValue([
      release({
        eventId: "tmdb:digital:100:2026-05-12",
        watchmodeId: 100,
        releaseSource: "tmdb",
        releaseKind: "digital",
        title: "Digital Movie",
        mediaType: "movie",
        tmdbId: 100,
        sourceName: "Digital release",
        sourceType: "digital",
        releaseDate: "2026-05-12",
      }),
    ]);
    const watchMode = createWatchMode();
    watchMode.getReleases.mockRejectedValue(new Error("WATCHMODE_API_KEY is required"));
    const service = new ReleasesService(repository, watchMode, createTmdb(), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(result.movies.map((item) => item.title)).toEqual(["Digital Movie"]);
    expect(watchMode.getReleases).not.toHaveBeenCalled();
    expect(result.cache.warning).toBeNull();
  });

  it("returns a TMDB warning without falling back to WatchMode rows when TMDB refresh fails", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue({
      cacheKey: "watchmode:releases:20260511000000:20260517235959",
      coveredStartDate: "2026-05-11",
      coveredEndDate: "2026-05-17",
      fetchedAt: new Date("2026-05-16T08:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    repository.getTmdbDigitalWeekCache.mockResolvedValue(null);
    repository.getWeekReleases.mockResolvedValue([
      release({ title: "WatchMode Movie", mediaType: "movie", releaseDate: "2026-05-12" }),
    ]);
    const watchMode = createWatchMode();
    const tmdb = createTmdb();
    tmdb.getDigitalMovieReleases.mockRejectedValue(new Error("TMDB 401: Unauthorized"));
    const service = new ReleasesService(repository, watchMode, tmdb, () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(watchMode.getReleases).not.toHaveBeenCalled();
    expect(result.movies).toEqual([]);
    expect(result.cache.warning).toBe("TMDB 401: Unauthorized");
  });

  it("puts featured TMDB digital movies first and moves old catalog digital rows lower", async () => {
    const repository = createRepository();
    repository.getFetchCoveringWeek.mockResolvedValue({
      cacheKey: "watchmode:releases:20260511000000:20260517235959",
      coveredStartDate: "2026-05-11",
      coveredEndDate: "2026-05-17",
      fetchedAt: new Date("2026-05-16T08:00:00.000Z"),
      status: "fresh",
      warning: null,
    });
    repository.getWeekReleases.mockResolvedValue([
      release({
        eventId: "wm:movie:2026-05-12",
        title: "Streaming Movie",
        mediaType: "movie",
        releaseKind: "streaming",
        releaseDate: "2026-05-12",
        sourceName: "Apple TV",
      }),
    ]);
    repository.getTmdbDigitalMovies.mockResolvedValue([
      release({
        eventId: "tmdb:digital:550:2026-05-12",
        watchmodeId: 550,
        releaseSource: "tmdb",
        releaseKind: "digital",
        title: "Old Catalog Classic",
        tmdbId: 550,
        sourceId: 0,
        sourceName: "Digital release",
        sourceType: "digital",
        releaseDate: "2026-05-12",
        primaryReleaseDate: "1999-10-15",
        popularity: 120,
        voteCount: 30000,
        isFeaturedDigital: false,
      }),
      release({
        eventId: "tmdb:digital:999:2026-05-13",
        watchmodeId: 999,
        releaseSource: "tmdb",
        releaseKind: "digital",
        title: "Big New Movie",
        tmdbId: 999,
        sourceId: 0,
        sourceName: "Digital release",
        sourceType: "digital",
        releaseDate: "2026-05-13",
        primaryReleaseDate: "2025-12-25",
        popularity: 80,
        voteCount: 500,
        isFeaturedDigital: true,
      }),
    ]);
    const service = new ReleasesService(repository, createWatchMode(), createTmdb(), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(result.movies.map((item) => item.title)).toEqual([
      "Big New Movie",
      "Old Catalog Classic",
    ]);
  });
});

function createRepository() {
  return {
    getFetchCoveringWeek: vi.fn(),
    getWeekReleases: vi.fn(),
    saveWatchModeFetch: vi.fn(),
    getTmdbDigitalWeekCache: vi.fn().mockResolvedValue(null),
    getTmdbDigitalMovies: vi.fn().mockResolvedValue([]),
    saveTmdbDigitalWeek: vi.fn().mockResolvedValue(undefined),
    getTmdbTvWeekCache: vi.fn().mockResolvedValue(null),
    getTmdbTvAirings: vi.fn().mockResolvedValue([]),
    saveTmdbTvWeek: vi.fn().mockResolvedValue(undefined),
    getReleaseByEventId: vi.fn().mockResolvedValue(null),
    getReleaseDetail: vi.fn().mockResolvedValue(null),
    saveReleaseDetail: vi.fn().mockResolvedValue(undefined),
    getTorrentSearchCache: vi.fn().mockResolvedValue(null),
    saveTorrentSearchCache: vi.fn().mockResolvedValue(undefined),
    saveDownloadRecord: vi.fn(),
    getDownloadRecords: vi.fn().mockResolvedValue([]),
    findDownloadRecordByMagnet: vi.fn().mockResolvedValue(null),
    markDownloadRecordsCompleted: vi.fn().mockResolvedValue(0),
    deleteDownloadRecord: vi.fn().mockResolvedValue(false),
  } satisfies ReleaseRepository;
}

function createWatchMode(result: Partial<WatchModeReleaseResult> = {}) {
  return {
    getReleases: vi.fn().mockResolvedValue({
      releases: [],
      raw: { releases: [] },
      quota: {},
      ...result,
    }),
  };
}

function createTmdb(result: Partial<TmdbDigitalReleaseResult> & { configured?: boolean; tvReleases?: TmdbTvAiringResult["releases"] } = {}) {
  return {
    isConfigured: vi.fn().mockReturnValue(result.configured ?? true),
    getDigitalMovieReleases: vi.fn().mockResolvedValue({
      releases: [],
      raw: { results: [] },
      ...result,
    }),
    getTvAirings: vi.fn().mockResolvedValue({
      releases: result.tvReleases || [],
      raw: { results: [] },
    }),
  };
}

function createStatefulRepository(): ReleaseRepository {
  const caches = new Map<string, {
    cacheKey: string;
    coveredStartDate: string;
    coveredEndDate: string;
    fetchedAt: Date;
    status: "fresh";
    warning: null;
  }>();
  const releases = new Map<string, ReturnType<typeof release>[]>();

  return {
    getFetchCoveringWeek: vi.fn(async (weekStart: string, weekEnd: string) => {
      return [...caches.values()].find(
        (cache) =>
          cache.coveredStartDate <= weekStart && cache.coveredEndDate >= weekEnd,
      ) || null;
    }),
    getWeekReleases: vi.fn(async (weekStart: string, weekEnd: string) =>
      [...releases.values()].flat().filter(
        (release) => release.releaseDate >= weekStart && release.releaseDate <= weekEnd,
      ),
    ),
    saveWatchModeFetch: vi.fn(async (input) => {
      caches.set(input.cacheKey, {
        cacheKey: input.cacheKey,
        coveredStartDate: input.coveredStartDate,
        coveredEndDate: input.coveredEndDate,
        fetchedAt: input.fetchedAt,
        status: "fresh",
        warning: null,
      });
      releases.set(input.cacheKey, input.releases);
    }),
    getTmdbDigitalWeekCache: vi.fn(async () => null),
    getTmdbDigitalMovies: vi.fn(async () => []),
    saveTmdbDigitalWeek: vi.fn(async () => undefined),
    getTmdbTvWeekCache: vi.fn(async () => null),
    getTmdbTvAirings: vi.fn(async () => []),
    saveTmdbTvWeek: vi.fn(async () => undefined),
    getReleaseByEventId: vi.fn(async () => null),
    getReleaseDetail: vi.fn(async () => null),
    saveReleaseDetail: vi.fn(async () => undefined),
    getTorrentSearchCache: vi.fn(async () => null),
    saveTorrentSearchCache: vi.fn(async () => undefined),
    saveDownloadRecord: vi.fn(async () => ({
      id: 1,
      userId: 1,
      releaseEventId: "event",
      tmdbId: 10,
      title: "Movie",
      transmissionTorrentId: 1,
      torrentName: "Torrent",
      magnetLink: "magnet:?xt=urn:btih:abc",
      magnetHash: "abc",
      downloadDir: "/data/Movies/Sourced",
      status: "pending" as const,
      createdAt: new Date("2026-05-16T12:00:00.000Z"),
      updatedAt: new Date("2026-05-16T12:00:00.000Z"),
      completedAt: null,
    })),
    getDownloadRecords: vi.fn(async () => []),
    findDownloadRecordByMagnet: vi.fn(async () => null),
    markDownloadRecordsCompleted: vi.fn(async () => 0),
    deleteDownloadRecord: vi.fn(async () => false),
  };
}

function release(overrides: Partial<NormalizedRelease>): NormalizedRelease {
  return { ...baseRelease(), ...overrides };
}

function baseRelease(): NormalizedRelease {
  return {
    eventId: "1:203:2026-05-12:none",
    watchmodeId: 1,
    releaseSource: "watchmode" as const,
    releaseKind: "streaming" as const,
    title: "Movie",
    mediaType: "movie" as const,
    titleType: "movie",
    tmdbId: 10,
    tmdbType: "movie",
    imdbId: "tt1",
    posterUrl: "https://example.test/poster.jpg",
    releaseDate: "2026-05-12",
    sourceId: 203,
    sourceName: "Netflix",
    sourceType: "unknown" as const,
    seasonNumber: null,
    isOriginal: true,
    primaryReleaseDate: null,
    popularity: null,
    voteCount: null,
    isFeaturedDigital: false,
    episodeNumber: null,
    episodeName: null,
  };
}
