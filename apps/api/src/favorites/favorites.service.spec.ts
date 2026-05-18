import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FavoritesService } from "./favorites.service";

describe("FavoritesService", () => {
  it("adds a TV release as an idempotent favorite with a TMDB snapshot", async () => {
    const prisma = {
      favoriteShow: {
        upsert: vi.fn().mockResolvedValue({
          showKey: "tmdb:100",
          tmdbId: 100,
          watchmodeId: 500,
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
        watchmodeId: 500,
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
    const service = new FavoritesService(prisma as never, repository as never, tmdb as never, () => new Date("2026-05-16T12:00:00.000Z"));

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
    });
  });

  it("rejects movies as favorites", async () => {
    const service = new FavoritesService(
      {} as never,
      { getReleaseByEventId: vi.fn().mockResolvedValue({ mediaType: "movie", title: "Movie" }) } as never,
      { isConfigured: vi.fn().mockReturnValue(false) } as never,
    );

    await expect(service.addFavorite(7, "movie-event")).rejects.toBeInstanceOf(BadRequestException);
  });
});
