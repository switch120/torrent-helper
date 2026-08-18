import { describe, expect, it, vi } from "vitest";
import { PrismaReleaseRepository } from "./prisma-release.repository";

describe("PrismaReleaseRepository", () => {
  it("creates and releases atomic user-scoped download claims", async () => {
    const prisma = {
      downloadClaim: {
        create: vi.fn().mockResolvedValue({ userId: 7 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.claimDownload(7, "hash:abcdef")).resolves.toBe(true);
    await repository.releaseDownloadClaim(7, "hash:abcdef");

    expect(prisma.downloadClaim.create).toHaveBeenCalledWith({
      data: { userId: 7, magnetKey: "hash:abcdef" },
    });
    expect(prisma.downloadClaim.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, magnetKey: "hash:abcdef" },
    });
  });

  it("returns false when a concurrent download claim already exists", async () => {
    const prisma = {
      downloadClaim: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
      },
      $executeRaw: vi.fn().mockResolvedValue(0),
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.claimDownload(7, "hash:abcdef")).resolves.toBe(false);
  });

  it("recovers a stale orphan claim before retrying the atomic create", async () => {
    const prisma = {
      downloadClaim: {
        create: vi
          .fn()
          .mockRejectedValueOnce({ code: "P2002" })
          .mockResolvedValueOnce({ userId: 7 }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.claimDownload(7, "hash:abcdef")).resolves.toBe(true);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.downloadClaim.create).toHaveBeenCalledTimes(2);
  });

  it("removes the download claim when deleting its last history record", async () => {
    const transaction = {
      downloadRecord: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            magnetHash: "ABCDEF",
            magnetLink: "magnet:?xt=urn:btih:ABCDEF",
          })
          .mockResolvedValueOnce(null),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      downloadClaim: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.deleteDownloadRecord(7, 12)).resolves.toBe(true);

    expect(transaction.downloadClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        magnetKey: {
          in: expect.arrayContaining([
            "hash:abcdef",
            expect.stringMatching(/^link:[a-f0-9]{32}$/),
          ]),
        },
      },
    });
  });

  it("removes the original link claim after Transmission returns a hash for a btmh magnet", async () => {
    const magnetLink = "magnet:?xt=urn:btmh:1220abcdef";
    const transaction = {
      downloadRecord: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            magnetHash: "0123456789ABCDEF",
            magnetLink,
          })
          .mockResolvedValueOnce(null),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      downloadClaim: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.deleteDownloadRecord(7, 12)).resolves.toBe(true);
    expect(transaction.downloadClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        magnetKey: {
          in: expect.arrayContaining([
            "hash:0123456789abcdef",
            expect.stringMatching(/^link:[a-f0-9]{32}$/),
          ]),
        },
      },
    });
  });

  it("keeps the claim while another matching history record remains", async () => {
    const transaction = {
      downloadRecord: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            magnetHash: "ABCDEF",
            magnetLink: "magnet:?xt=urn:btih:ABCDEF",
          })
          .mockResolvedValueOnce({ id: 13 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      downloadClaim: {
        deleteMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.deleteDownloadRecord(7, 12)).resolves.toBe(true);
    expect(transaction.downloadClaim.deleteMany).not.toHaveBeenCalled();
  });

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

  it("invalidates TV cache rows written before provider and network discovery", async () => {
    const prisma = {
      tmdbTvWeekCache: {
        findUnique: vi.fn(async () => ({
          weekStart: new Date("2026-08-10T00:00:00.000Z"),
          weekEnd: new Date("2026-08-16T00:00:00.000Z"),
          fetchedAt: new Date("2026-08-17T12:00:00.000Z"),
          status: "fresh",
          warning: null,
          rawResponse: { discover: [] },
        })),
      },
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.getTmdbTvWeekCache("2026-08-10")).resolves.toBeNull();
  });

  it("accepts current TV cache rows and restores provider sources from airing raw data", async () => {
    const prisma = {
      tmdbTvWeekCache: {
        findUnique: vi.fn(async () => ({
          weekStart: new Date("2026-08-10T00:00:00.000Z"),
          weekEnd: new Date("2026-08-16T00:00:00.000Z"),
          fetchedAt: new Date("2026-08-17T12:00:00.000Z"),
          status: "fresh",
          warning: null,
          rawResponse: { sourcingPolicy: "us-provider-network-v2" },
        })),
      },
      tmdbTvAiring: {
        count: vi.fn(async () => 0),
        findMany: vi.fn(async () => [
          {
            eventId: "tmdb:tv:95350:2026-08-16:1:1",
            tmdbId: 95350,
            title: "Lanterns",
            titleType: "tv_series",
            posterUrl: null,
            releaseDate: new Date("2026-08-16T00:00:00.000Z"),
            firstAirDate: new Date("2026-08-16T00:00:00.000Z"),
            providerId: 49,
            providerName: "HBO",
            seasonNumber: 1,
            episodeNumber: 1,
            episodeName: "Pilot",
            imdbId: "tt31186205",
            popularity: 200,
            voteAverage: 8.4,
            voteCount: 500,
            originalLanguage: "en",
            isInternational: false,
            isDubbed: false,
            raw: {
              sources: [
                {
                  key: "provider:max",
                  name: "Max",
                  releaseSource: "tmdb",
                  sourceId: 1899,
                  sourceType: "sub",
                },
              ],
            },
          },
        ]),
      },
    };
    const repository = new PrismaReleaseRepository(prisma as never);

    await expect(repository.getTmdbTvWeekCache("2026-08-10")).resolves.toEqual(
      expect.objectContaining({ weekStart: "2026-08-10", status: "fresh" }),
    );
    await expect(repository.getTmdbTvAirings("2026-08-10", "2026-08-16")).resolves.toEqual([
      expect.objectContaining({
        title: "Lanterns",
        sourceName: "HBO",
        sources: [expect.objectContaining({ name: "Max", sourceId: 1899 })],
      }),
    ]);
  });
});
