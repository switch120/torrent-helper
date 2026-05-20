import { describe, expect, it, vi } from "vitest";
import type { ReleaseRepository } from "./release.repository";
import type { NormalizedRelease } from "./release.types";
import { ReleasesService } from "./releases.service";
import type { TmdbClient } from "./tmdb.client";

describe("ReleasesService", () => {
  it("returns an empty week with a TMDB warning when release data is not configured", async () => {
    const repository = createRepository();
    const tmdb = createTmdb({ configured: false });
    const service = new ReleasesService(repository, tmdb, () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(result.movies).toEqual([]);
    expect(result.tv).toEqual([]);
    expect(result.cache.warning).toContain("TMDB_API_KEY");
    expect(tmdb.getDigitalMovieReleases).not.toHaveBeenCalled();
    expect(tmdb.getTvAirings).not.toHaveBeenCalled();
  });

  it("refreshes TMDB movie and TV caches, then returns grouped weekly releases", async () => {
    const movie = release({
      eventId: "tmdb:digital:100:2026-05-12",
      title: "Digital Movie",
      mediaType: "movie",
      releaseKind: "digital",
      releaseDate: "2026-05-12",
      tmdbId: 100,
      sourceName: "Digital release",
    });
    const tv = release({
      eventId: "tmdb:tv:200:350:2026-05-14:2:3",
      title: "Streaming Show",
      mediaType: "tv",
      releaseKind: "streaming",
      releaseDate: "2026-05-14",
      tmdbId: 200,
      sourceId: 350,
      sourceName: "Apple TV+",
      seasonNumber: 2,
      episodeNumber: 3,
    });
    const repository = createRepository({
      movies: [movie],
      tv: [tv],
    });
    const tmdb = createTmdb({
      movieResult: { releases: [movie], raw: { movies: [100] } },
      tvResult: { releases: [tv], raw: { tv: [200] } },
    });
    const service = new ReleasesService(repository, tmdb, () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.refreshWeek("2026-05-11");

    expect(tmdb.getDigitalMovieReleases).toHaveBeenCalledWith({
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
    });
    expect(tmdb.getTvAirings).toHaveBeenCalledWith({
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
    });
    expect(repository.saveTmdbDigitalWeek).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStart: "2026-05-11",
        weekEnd: "2026-05-17",
        releases: [movie],
      }),
    );
    expect(repository.saveTmdbTvWeek).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStart: "2026-05-11",
        weekEnd: "2026-05-17",
        releases: [tv],
      }),
    );
    expect(result.movies.map((item) => item.title)).toEqual(["Digital Movie"]);
    expect(result.tv.map((item) => item.title)).toEqual(["Streaming Show"]);
  });

  it("returns cached TMDB releases with a warning when refresh fails", async () => {
    const movie = release({
      eventId: "tmdb:digital:100:2026-05-12",
      title: "Cached Movie",
      mediaType: "movie",
      releaseKind: "digital",
      releaseDate: "2026-05-12",
      tmdbId: 100,
      sourceName: "Digital release",
    });
    const repository = createRepository({
      movieCache: {
        weekStart: "2026-05-11",
        weekEnd: "2026-05-17",
        fetchedAt: new Date("2026-05-15T12:00:00.000Z"),
        status: "fresh",
        warning: null,
      },
      movies: [movie],
    });
    const tmdb = createTmdb({
      getDigitalMovieReleases: vi.fn(async () => {
        throw new Error("TMDB 429: Too Many Requests");
      }),
      tvResult: { releases: [], raw: {} },
    });
    const service = new ReleasesService(repository, tmdb, () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.refreshWeek("2026-05-11");

    expect(result.movies.map((item) => item.title)).toEqual(["Cached Movie"]);
    expect(result.cache.warning).toContain("TMDB 429");
  });

  it("dedupes TMDB TV rows for the same episode across multiple source rows", async () => {
    const apple = release({
      eventId: "tmdb:tv:200:350:2026-05-14:2:3",
      title: "Shared Show",
      mediaType: "tv",
      releaseKind: "streaming",
      releaseDate: "2026-05-14",
      tmdbId: 200,
      sourceId: 350,
      sourceName: "Apple TV+",
      seasonNumber: 2,
      episodeNumber: 3,
    });
    const prime = {
      ...apple,
      eventId: "tmdb:tv:200:9:2026-05-14:2:3",
      sourceId: 9,
      sourceName: "Prime",
    };
    const repository = createRepository({
      movieCache: {
        weekStart: "2026-05-11",
        weekEnd: "2026-05-17",
        fetchedAt: new Date("2026-05-16T12:00:00.000Z"),
        status: "fresh",
        warning: null,
      },
      tvCache: {
        weekStart: "2026-05-11",
        weekEnd: "2026-05-17",
        fetchedAt: new Date("2026-05-16T12:00:00.000Z"),
        status: "fresh",
        warning: null,
      },
      tv: [apple, prime],
    });
    const service = new ReleasesService(repository, createTmdb(), () => new Date("2026-05-16T12:00:00.000Z"));

    const result = await service.getWeek("2026-05-11");

    expect(result.tv).toHaveLength(1);
    expect(result.tv[0].title).toBe("Shared Show");
  });
});

function createRepository(overrides: Partial<{
  movieCache: Awaited<ReturnType<ReleaseRepository["getTmdbDigitalWeekCache"]>>;
  tvCache: Awaited<ReturnType<ReleaseRepository["getTmdbTvWeekCache"]>>;
  movies: NormalizedRelease[];
  tv: NormalizedRelease[];
}> = {}): ReleaseRepository {
  return {
    getTmdbDigitalWeekCache: vi.fn(async () => overrides.movieCache ?? null),
    getTmdbDigitalMovies: vi.fn(async () => overrides.movies ?? []),
    saveTmdbDigitalWeek: vi.fn(),
    getTmdbTvWeekCache: vi.fn(async () => overrides.tvCache ?? null),
    getTmdbTvAirings: vi.fn(async () => overrides.tv ?? []),
    saveTmdbTvWeek: vi.fn(),
    getReleaseByEventId: vi.fn(),
    getReleaseDetail: vi.fn(),
    saveReleaseDetail: vi.fn(),
    getTorrentSearchCache: vi.fn(),
    saveTorrentSearchCache: vi.fn(),
    saveDownloadRecord: vi.fn(),
    getDownloadRecords: vi.fn(),
    findDownloadRecordByMagnet: vi.fn(),
    markDownloadRecordsCompleted: vi.fn(),
    deleteDownloadRecord: vi.fn(),
  };
}

function createTmdb(overrides: Partial<{
  configured: boolean;
  movieResult: Awaited<ReturnType<TmdbClient["getDigitalMovieReleases"]>>;
  tvResult: Awaited<ReturnType<TmdbClient["getTvAirings"]>>;
  getDigitalMovieReleases: TmdbClient["getDigitalMovieReleases"];
  getTvAirings: TmdbClient["getTvAirings"];
}> = {}): Pick<TmdbClient, "isConfigured" | "getDigitalMovieReleases" | "getTvAirings"> {
  return {
    isConfigured: vi.fn(() => overrides.configured ?? true),
    getDigitalMovieReleases: vi.fn(overrides.getDigitalMovieReleases ?? (async () => overrides.movieResult ?? { releases: [], raw: {} })),
    getTvAirings: vi.fn(overrides.getTvAirings ?? (async () => overrides.tvResult ?? { releases: [], raw: {} })),
  };
}

function release(overrides: Partial<NormalizedRelease> = {}): NormalizedRelease {
  return {
    eventId: "tmdb:digital:1:2026-05-12",
    sourceTitleId: 1,
    releaseSource: "tmdb",
    releaseKind: "digital",
    title: "Release",
    titleType: "movie",
    mediaType: "movie",
    tmdbId: 1,
    tmdbType: "movie",
    imdbId: null,
    posterUrl: null,
    releaseDate: "2026-05-12",
    sourceId: 0,
    sourceName: "Digital release",
    sourceType: "digital",
    seasonNumber: null,
    isOriginal: false,
    ...overrides,
  };
}
