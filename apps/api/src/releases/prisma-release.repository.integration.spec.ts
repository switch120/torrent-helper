import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaReleaseRepository } from "./prisma-release.repository";

const describeIfDatabase =
  process.env.RUN_DB_INTEGRATION === "true" && process.env.DATABASE_URL
    ? describe
    : describe.skip;

describeIfDatabase("PrismaReleaseRepository integration", () => {
  let prisma: PrismaService;
  let repository: PrismaReleaseRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    repository = new PrismaReleaseRepository(prisma);
    await prisma.$connect();
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it("writes and rereads a WatchMode fetch cache idempotently", async () => {
    const input = {
      cacheKey: "watchmode:releases:20260511000000:20260517235959",
      requestedStartDate: "2026-05-11",
      requestedEndDate: "2026-05-17",
      coveredStartDate: "2026-05-11",
      coveredEndDate: "2026-05-24",
      fetchedAt: new Date("2026-05-16T12:00:00.000Z"),
      raw: { releases: [{ id: 1 }, { id: 2 }] },
      quota: {
        rateLimitLimit: 60,
        rateLimitRemaining: 59,
        accountQuota: 1000,
        accountQuotaUsed: 4,
      },
      releases: [
        {
          eventId: "1:203:2026-05-12:none",
          watchmodeId: 1,
          releaseSource: "watchmode" as const,
          releaseKind: "streaming" as const,
          title: "Movie",
          titleType: "movie",
          mediaType: "movie" as const,
          tmdbId: 10,
          tmdbType: "movie",
          imdbId: "tt1",
          posterUrl: null,
          releaseDate: "2026-05-12",
          sourceId: 203,
          sourceName: "Netflix",
          sourceType: "unknown" as const,
          seasonNumber: null,
          isOriginal: true,
        },
        {
          eventId: "2:204:2026-05-19:1",
          watchmodeId: 2,
          releaseSource: "watchmode" as const,
          releaseKind: "streaming" as const,
          title: "Series",
          titleType: "tv_series",
          mediaType: "tv" as const,
          tmdbId: 20,
          tmdbType: "tv",
          imdbId: "tt2",
          posterUrl: null,
          releaseDate: "2026-05-19",
          sourceId: 204,
          sourceName: "Prime Video",
          sourceType: "unknown" as const,
          seasonNumber: 1,
          isOriginal: false,
          voteAverage: 7.8,
        },
      ],
    };

    await repository.saveWatchModeFetch(input);
    await repository.saveWatchModeFetch(input);

    const cache = await repository.getFetchCoveringWeek("2026-05-18", "2026-05-24");
    const currentReleases = await repository.getWeekReleases("2026-05-11", "2026-05-17");
    const futureReleases = await repository.getWeekReleases("2026-05-18", "2026-05-24");

    expect(cache).toEqual(
      expect.objectContaining({
        cacheKey: input.cacheKey,
        coveredStartDate: "2026-05-11",
        coveredEndDate: "2026-05-24",
        status: "fresh",
        warning: null,
      }),
    );
    expect(currentReleases.map((release) => release.title)).toEqual(["Movie"]);
    expect(futureReleases.map((release) => release.title)).toEqual(["Series"]);
  });

  it("removes stale events when a refreshed fetch has fewer releases", async () => {
    const baseInput = {
      cacheKey: "watchmode:releases:20260518000000:20260524235959",
      requestedStartDate: "2026-05-18",
      requestedEndDate: "2026-05-24",
      coveredStartDate: "2026-05-18",
      coveredEndDate: "2026-06-07",
      fetchedAt: new Date("2026-05-16T12:00:00.000Z"),
      raw: { releases: [{ id: 2 }, { id: 3 }] },
      quota: {},
      releases: [
        {
          eventId: "2:203:2026-05-19:none",
          watchmodeId: 2,
          releaseSource: "watchmode" as const,
          releaseKind: "streaming" as const,
          title: "Kept",
          titleType: "movie",
          mediaType: "movie" as const,
          tmdbId: null,
          tmdbType: null,
          imdbId: null,
          posterUrl: null,
          releaseDate: "2026-05-19",
          sourceId: 203,
          sourceName: "Netflix",
          sourceType: "unknown" as const,
          seasonNumber: null,
          isOriginal: false,
        },
        {
          eventId: "3:203:2026-06-01:none",
          watchmodeId: 3,
          releaseSource: "watchmode" as const,
          releaseKind: "streaming" as const,
          title: "Removed",
          titleType: "movie",
          mediaType: "movie" as const,
          tmdbId: null,
          tmdbType: null,
          imdbId: null,
          posterUrl: null,
          releaseDate: "2026-06-01",
          sourceId: 203,
          sourceName: "Netflix",
          sourceType: "unknown" as const,
          seasonNumber: null,
          isOriginal: false,
        },
      ],
    };

    await repository.saveWatchModeFetch(baseInput);
    await repository.saveWatchModeFetch({
      ...baseInput,
      raw: { releases: [{ id: 2 }] },
      releases: [baseInput.releases[0]],
    });

    const futureReleases = await repository.getWeekReleases("2026-05-18", "2026-05-24");
    const staleReleases = await repository.getWeekReleases("2026-06-01", "2026-06-07");

    expect(futureReleases.map((release) => release.title)).toEqual(["Kept"]);
    expect(staleReleases).toHaveLength(0);
  });

  it("writes and rereads TMDB digital movie weeks idempotently", async () => {
    const input = {
      weekStart: "2026-06-08",
      weekEnd: "2026-06-14",
      fetchedAt: new Date("2026-05-16T12:00:00.000Z"),
      expiresAt: new Date("2026-05-16T18:00:00.000Z"),
      raw: { digitalDatePolicy: "original-us-digital-with-streaming-providers-v1", results: [{ id: 100 }] },
      releases: [
        {
          eventId: "tmdb:digital:100:2026-06-10",
          watchmodeId: 100,
          releaseSource: "tmdb" as const,
          releaseKind: "digital" as const,
          title: "Digital Movie",
          titleType: "movie",
          mediaType: "movie" as const,
          tmdbId: 100,
          tmdbType: "movie",
          imdbId: null,
          posterUrl: "https://image.tmdb.org/t/p/w342/poster.jpg",
          releaseDate: "2026-06-10",
          sourceId: 0,
          sourceName: "Digital release",
          sourceType: "digital" as const,
          seasonNumber: null,
          isOriginal: false,
        },
      ],
    };

    await repository.saveTmdbDigitalWeek(input);
    await repository.saveTmdbDigitalWeek(input);

    const cache = await repository.getTmdbDigitalWeekCache("2026-06-08");
    const movies = await repository.getTmdbDigitalMovies("2026-06-08", "2026-06-14");

    expect(cache).toEqual(
      expect.objectContaining({
        weekStart: "2026-06-08",
        weekEnd: "2026-06-14",
        status: "fresh",
      }),
    );
    expect(movies).toEqual([
      expect.objectContaining({
        eventId: "tmdb:digital:100:2026-06-10",
        releaseKind: "digital",
        sourceName: "Digital release",
        title: "Digital Movie",
        tmdbId: 100,
        voteAverage: 7.8,
      }),
    ]);
  });

  it("writes and rereads TMDB TV airing weeks idempotently", async () => {
    const input = {
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
      fetchedAt: new Date("2026-05-16T12:00:00.000Z"),
      expiresAt: new Date("2026-05-17T12:00:00.000Z"),
      raw: { discover: [{ provider: "Apple TV+" }] },
      releases: [
        {
          eventId: "tmdb:tv:87917:350:2026-05-15:5:8",
          watchmodeId: 87917,
          releaseSource: "tmdb" as const,
          releaseKind: "streaming" as const,
          title: "For All Mankind",
          titleType: "tv_series",
          mediaType: "tv" as const,
          tmdbId: 87917,
          tmdbType: "tv",
          imdbId: "tt7772588",
          posterUrl: "https://image.tmdb.org/t/p/w342/poster.jpg",
          releaseDate: "2026-05-15",
          sourceId: 350,
          sourceName: "Apple TV+",
          sourceType: "sub" as const,
          seasonNumber: 5,
          episodeNumber: 8,
          episodeName: "In the Week",
          isOriginal: false,
          primaryReleaseDate: "2019-11-01",
          popularity: 56.7,
          voteAverage: 8.1,
          voteCount: 1200,
        },
      ],
    };

    await repository.saveTmdbTvWeek(input);
    await repository.saveTmdbTvWeek(input);

    const cache = await repository.getTmdbTvWeekCache("2026-05-11");
    const airings = await repository.getTmdbTvAirings("2026-05-11", "2026-05-17");

    expect(cache).toEqual(
      expect.objectContaining({
        weekStart: "2026-05-11",
        weekEnd: "2026-05-17",
        status: "fresh",
      }),
    );
    expect(airings).toEqual([
      expect.objectContaining({
        eventId: "tmdb:tv:87917:350:2026-05-15:5:8",
        releaseKind: "streaming",
        sourceName: "Apple TV+",
        title: "For All Mankind",
        tmdbId: 87917,
        seasonNumber: 5,
        episodeNumber: 8,
        voteAverage: 8.1,
      }),
    ]);
  });
});

async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.downloadRecord.deleteMany();
  await prisma.torrentSearchCache.deleteMany();
  await prisma.releaseDetailCache.deleteMany();
  await prisma.tmdbTvAiring.deleteMany();
  await prisma.tmdbTvWeekCache.deleteMany();
  await prisma.tmdbDigitalMovie.deleteMany();
  await prisma.tmdbDigitalWeekCache.deleteMany();
  await prisma.releaseEvent.deleteMany();
  await prisma.watchModeFetchCache.deleteMany();
  await prisma.releaseTitle.deleteMany();
  await prisma.releaseSource.deleteMany();
}
