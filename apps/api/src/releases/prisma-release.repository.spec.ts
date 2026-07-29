import { describe, expect, it, vi } from "vitest";
import { PrismaReleaseRepository } from "./prisma-release.repository";

describe("PrismaReleaseRepository", () => {
  it("preserves supplemental digital source metadata from cached movie rows", async () => {
    const prisma = {
      tmdbDigitalMovie: {
        findMany: vi.fn(async () => [
          {
            eventId: "dvdsreleasedates:digital:12740:2026-05-26",
            tmdbId: 1390300,
            title: "Over Your Dead Body",
            titleType: "movie",
            posterUrl: "https://www.dvdsreleasedates.com/posters/110/O/Over-Your-Dead-Body-2026.jpg",
            releaseDate: new Date("2026-05-26T00:00:00.000Z"),
            primaryReleaseDate: new Date("2026-04-24T00:00:00.000Z"),
            popularity: 89.04,
            voteCount: 30,
            voteAverage: 6.8,
            isFeaturedDigital: true,
            originalLanguage: "en",
            isInternational: false,
            isDubbed: false,
            raw: {
              sourceTitleId: 12740,
              releaseSource: "dvdsreleasedates",
              imdbId: "tt34685692",
              sourceId: 12740,
              sourceName: "Digital HD",
            },
          },
        ]),
      },
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.getTmdbDigitalMovies("2026-05-25", "2026-05-31")).resolves.toEqual([
      expect.objectContaining({
        eventId: "dvdsreleasedates:digital:12740:2026-05-26",
        sourceTitleId: 12740,
        releaseSource: "dvdsreleasedates",
        tmdbId: 1390300,
        imdbId: "tt34685692",
        sourceId: 12740,
        sourceName: "Digital HD",
      }),
    ]);
  });

  it("filters cached theatrical fallback movie rows from digital week reads", async () => {
    const prisma = {
      tmdbDigitalMovie: {
        findMany: vi.fn(async () => [
          {
            eventId: "tmdb:digital:1275779:2026-06-12",
            tmdbId: 1275779,
            title: "Disclosure Day",
            titleType: "movie",
            posterUrl: "https://image.tmdb.org/t/p/w342/disclosure.jpg",
            releaseDate: new Date("2026-06-12T00:00:00.000Z"),
            primaryReleaseDate: new Date("2026-06-02T00:00:00.000Z"),
            popularity: 339.09,
            voteCount: 380,
            voteAverage: 6.9,
            isFeaturedDigital: true,
            originalLanguage: "en",
            isInternational: false,
            isDubbed: false,
            raw: {
              sourceTitleId: 1275779,
              releaseSource: "tmdb",
              sourceName: "New release",
              isDigitalDateFallback: true,
            },
          },
          {
            eventId: "tmdb:digital:1110034:2026-06-12",
            tmdbId: 1110034,
            title: "Kraken",
            titleType: "movie",
            posterUrl: "https://image.tmdb.org/t/p/w342/kraken.jpg",
            releaseDate: new Date("2026-06-12T00:00:00.000Z"),
            primaryReleaseDate: new Date("2026-06-12T00:00:00.000Z"),
            popularity: 38.82,
            voteCount: 150,
            voteAverage: 6.2,
            isFeaturedDigital: true,
            originalLanguage: "no",
            isInternational: true,
            isDubbed: false,
            raw: {
              sourceTitleId: 1110034,
              releaseSource: "tmdb",
              sourceName: "Digital release",
              isDigitalDateFallback: false,
            },
          },
        ]),
      },
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.getTmdbDigitalMovies("2026-06-08", "2026-06-14")).resolves.toEqual([
      expect.objectContaining({
        eventId: "tmdb:digital:1110034:2026-06-12",
        title: "Kraken",
        sourceName: "Digital release",
      }),
    ]);
  });

  it("accepts TMDB digital movie cache rows written by the current client policy", async () => {
    const prisma = {
      tmdbDigitalWeekCache: {
        findUnique: vi.fn(async () => ({
          weekStart: new Date("2026-05-25T00:00:00.000Z"),
          weekEnd: new Date("2026-05-31T00:00:00.000Z"),
          fetchedAt: new Date("2026-05-28T12:00:00.000Z"),
          status: "fresh",
          warning: null,
          rawResponse: {
            digitalDatePolicy: "original-us-digital-only-v3",
          },
        })),
      },
      tmdbDigitalMovie: {
        count: vi.fn(async () => 0),
      },
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.getTmdbDigitalWeekCache("2026-05-25")).resolves.toEqual(
      expect.objectContaining({
        weekStart: "2026-05-25",
        weekEnd: "2026-05-31",
        status: "fresh",
      }),
    );
  });
});
