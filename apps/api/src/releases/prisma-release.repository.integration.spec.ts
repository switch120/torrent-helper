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
          sourceTitleId: 100,
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
          sourceTitleId: 87917,
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
}
