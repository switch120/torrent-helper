import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { TorrentResult } from "../torrents/torrent.types";
import { FavoritesService, selectTopEpisodeTorrents } from "./favorites.service";

describe("FavoritesService", () => {
  it("adds a TV release as an idempotent favorite with a TMDB snapshot", async () => {
    const prisma = {
      favoriteShow: {
        upsert: vi.fn().mockResolvedValue({
          showKey: "tmdb:100",
          tmdbId: 100,
          sourceTitleId: 500,
          title: "Example Show",
          posterUrl: "poster",
          backdropUrl: "backdrop",
          overview: "A show",
          status: "Returning Series",
          isCanceled: false,
          currentSeasonNumber: 2,
          numberOfSeasons: 2,
          numberOfEpisodes: 12,
          lastAirDate: new Date("2026-05-01T00:00:00.000Z"),
          lastEpisode: { name: "Last", seasonNumber: 2, episodeNumber: 1, airDate: "2026-05-01" },
          nextEpisode: { name: "Next", seasonNumber: 2, episodeNumber: 2, airDate: "2026-05-08" },
          releaseContext: { sourceName: "Hulu", seasonNumber: 2 },
          preferredDownloadDir: "/data/TV/Example Show",
          fetchedAt: new Date("2026-05-16T12:00:00.000Z"),
        }),
      },
    };
    const repository = {
      getReleaseByEventId: vi.fn().mockResolvedValue({
        eventId: "event-1",
        mediaType: "tv",
        title: "Example Show",
        tmdbId: 100,
        sourceTitleId: 500,
        posterUrl: "release-poster",
        sourceName: "Hulu",
        releaseDate: "2026-05-01",
        seasonNumber: 2,
      }),
    };
    const tmdb = {
      isConfigured: vi.fn().mockReturnValue(true),
      getTvDetail: vi.fn().mockResolvedValue({
        id: 100,
        name: "Example Show",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        overview: "A show",
        status: "Returning Series",
        number_of_seasons: 2,
        number_of_episodes: 12,
        last_air_date: "2026-05-01",
        last_episode_to_air: { name: "Last", season_number: 2, episode_number: 1, air_date: "2026-05-01" },
        next_episode_to_air: { name: "Next", season_number: 2, episode_number: 2, air_date: "2026-05-08" },
      }),
    };
    const service = new FavoritesService(
      prisma as never,
      repository as never,
      tmdb as never,
      { searchRelease: vi.fn() } as never,
      { addDownloadForRelease: vi.fn() } as never,
      () => new Date("2026-05-16T12:00:00.000Z"),
    );

    const favorite = await service.addFavorite(7, "event-1");

    expect(repository.getReleaseByEventId).toHaveBeenCalledWith("event-1");
    expect(prisma.favoriteShow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_showKey: { userId: 7, showKey: "tmdb:100" } },
      }),
    );
    expect(favorite).toMatchObject({
      showKey: "tmdb:100",
      title: "Example Show",
      status: "Returning Series",
      currentSeasonNumber: 2,
      lastEpisode: { name: "Last", seasonNumber: 2, episodeNumber: 1, airDate: "2026-05-01" },
      nextEpisode: { name: "Next", seasonNumber: 2, episodeNumber: 2, airDate: "2026-05-08" },
      preferredDownloadDir: "/data/TV/Example Show",
    });
  });

  it("rejects movies as favorites", async () => {
    const service = new FavoritesService(
      {} as never,
      { getReleaseByEventId: vi.fn().mockResolvedValue({ mediaType: "movie", title: "Movie" }) } as never,
      { isConfigured: vi.fn().mockReturnValue(false) } as never,
      { searchRelease: vi.fn() } as never,
      { addDownloadForRelease: vi.fn() } as never,
    );

    await expect(service.addFavorite(7, "movie-event")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("loads and maps an owned favorite season from TMDB", async () => {
    const prisma = {
      favoriteShow: {
        findUnique: vi.fn().mockResolvedValue({
          showKey: "tmdb:100",
          tmdbId: 100,
          numberOfSeasons: 3,
        }),
      },
    };
    const tmdb = {
      isConfigured: vi.fn().mockReturnValue(true),
      getTvSeasonDetail: vi.fn().mockResolvedValue({
        season_number: 2,
        air_date: "2026-01-01",
        overview: "Second season",
        poster_path: "/season-two.jpg",
        episodes: [
          {
            name: "Second",
            season_number: 2,
            episode_number: 2,
            air_date: "2026-01-08",
            overview: "Episode two",
          },
          {
            name: "First",
            season_number: 2,
            episode_number: 1,
            air_date: "2026-01-01",
            overview: "Episode one",
          },
        ],
      }),
    };
    const service = new FavoritesService(
      prisma as never,
      {} as never,
      tmdb as never,
      { searchRelease: vi.fn() } as never,
      { addDownloadForRelease: vi.fn() } as never,
    );

    const season = await service.getSeason(7, "tmdb:100", 2);

    expect(prisma.favoriteShow.findUnique).toHaveBeenCalledWith({
      where: { userId_showKey: { userId: 7, showKey: "tmdb:100" } },
    });
    expect(tmdb.getTvSeasonDetail).toHaveBeenCalledWith(100, 2);
    expect(season).toEqual({
      showKey: "tmdb:100",
      seasonNumber: 2,
      airDate: "2026-01-01",
      overview: "Second season",
      posterUrl: "https://image.tmdb.org/t/p/w500/season-two.jpg",
      episodes: [
        {
          name: "First",
          seasonNumber: 2,
          episodeNumber: 1,
          airDate: "2026-01-01",
          overview: "Episode one",
        },
        {
          name: "Second",
          seasonNumber: 2,
          episodeNumber: 2,
          airDate: "2026-01-08",
          overview: "Episode two",
        },
      ],
    });
  });

  it("searches a specific favorite episode at 2160p and returns five healthy results", async () => {
    const results = Array.from({ length: 7 }, (_, index) =>
      torrent({
        id: `torrent-${index}`,
        title: `Example Show S02E03 2160p result ${index}`,
        seeders: index + 1,
        leechers: 1,
      }),
    );
    const prowlarr = {
      searchRelease: vi.fn().mockResolvedValue({ results, warning: null }),
    };
    const service = new FavoritesService(
      {
        favoriteShow: {
          findUnique: vi.fn().mockResolvedValue({
            showKey: "tmdb:100",
            tmdbId: 100,
            sourceTitleId: 500,
            title: "Example Show",
            posterUrl: "poster",
          }),
        },
      } as never,
      {} as never,
      { isConfigured: vi.fn().mockReturnValue(true) } as never,
      prowlarr as never,
      { addDownloadForRelease: vi.fn() } as never,
    );

    const response = await service.searchEpisodeTorrents(7, "tmdb:100", 2, 3, "invalid");

    expect(prowlarr.searchRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "tmdb:100:s2:e3",
        title: "Example Show",
        mediaType: "tv",
        tmdbId: 100,
        seasonNumber: 2,
        episodeNumber: 3,
      }),
      "2160p",
    );
    expect(response.results).toHaveLength(5);
    expect(response.results.map((result) => result.seeders)).toEqual([7, 6, 5, 4, 3]);
  });

  it("adds an owned favorite episode to Transmission with the TV path and duplicate prevention", async () => {
    const workflow = {
      addDownloadForRelease: vi.fn().mockResolvedValue({
        download: null,
        historyRecord: { id: 9, status: "pending", downloadDir: "/data/TV" },
        duplicate: false,
        warning: null,
      }),
    };
    const prisma = {
      favoriteShow: {
        findUnique: vi.fn().mockResolvedValue({
          showKey: "tmdb:100",
          tmdbId: 100,
          sourceTitleId: 500,
          title: "Example Show",
          posterUrl: "poster",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new FavoritesService(
      prisma as never,
      {} as never,
      { isConfigured: vi.fn().mockReturnValue(true) } as never,
      { searchRelease: vi.fn() } as never,
      workflow as never,
    );
    const magnetLink = "magnet:?xt=urn:btih:episode";

    await service.addEpisodeDownload(7, "tmdb:100", 2, 3, { magnetLink });

    expect(workflow.addDownloadForRelease).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        eventId: "tmdb:100:s2:e3",
        title: "Example Show",
        mediaType: "tv",
        seasonNumber: 2,
        episodeNumber: 3,
      }),
      { magnetLink, downloadDir: "/data/TV" },
      { preventDuplicate: true },
    );
    expect(prisma.favoriteShow.update).toHaveBeenCalledWith({
      where: { userId_showKey: { userId: 7, showKey: "tmdb:100" } },
      data: { preferredDownloadDir: "/data/TV" },
    });
  });
});

describe("selectTopEpisodeTorrents", () => {
  it("balances swarm availability with seed count before quality and confidence", () => {
    const results = selectTopEpisodeTorrents([
      torrent({ id: "unhealthy", title: "Unhealthy", seeders: 10, leechers: 100 }),
      torrent({ id: "healthy", title: "Healthy", seeders: 9, leechers: 0 }),
      torrent({ id: "quality", title: "Quality", seeders: 9, leechers: 0, quality: "2160p" }),
    ]);

    expect(results.map((result) => result.id)).toEqual(["quality", "healthy", "unhealthy"]);
  });
});

function torrent(overrides: Partial<TorrentResult> = {}): TorrentResult {
  return {
    id: "torrent",
    title: "Example Show S02E03 1080p",
    indexer: "Indexer",
    magnetLink: "magnet:?xt=urn:btih:example",
    sizeBytes: 2_000_000_000,
    seeders: 10,
    leechers: 1,
    quality: "1080p",
    publishedAt: null,
    confidence: 90,
    ...overrides,
  };
}
