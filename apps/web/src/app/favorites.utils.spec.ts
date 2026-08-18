import { describe, expect, it } from "vitest";
import type { FavoriteShowSummary } from "./release.models";
import {
  favoriteLifecycleLabel,
  favoriteSeriesStageLabel,
  favoriteSortLabel,
  filterFavoriteShows,
  sortFavoriteShows,
} from "./favorites.utils";

const show = (input: Partial<FavoriteShowSummary> & Pick<FavoriteShowSummary, "showKey" | "title">): FavoriteShowSummary => ({
  tmdbId: null,
  sourceTitleId: null,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
  status: null,
  isCanceled: false,
  currentSeasonNumber: null,
  numberOfSeasons: null,
  numberOfEpisodes: null,
  firstAirDate: null,
  lastAirDate: null,
  lastEpisode: null,
  nextEpisode: null,
  releaseContext: null,
  preferredDownloadDir: null,
  fetchedAt: null,
  ...input,
});

describe("favorite show list utilities", () => {
  it("sorts by newest last episode first", () => {
    const favorites = [
      show({ showKey: "older", title: "Older", lastEpisode: { name: null, seasonNumber: null, episodeNumber: null, airDate: "2026-05-02" } }),
      show({ showKey: "none", title: "No Episode" }),
      show({ showKey: "newer", title: "Newer", lastEpisode: { name: null, seasonNumber: null, episodeNumber: null, airDate: "2026-05-10" } }),
    ];

    expect(sortFavoriteShows(favorites, "lastEpisode").map((favorite) => favorite.showKey)).toEqual(["newer", "older", "none"]);
  });

  it("sorts by soonest next episode first", () => {
    const favorites = [
      show({ showKey: "later", title: "Later", nextEpisode: { name: null, seasonNumber: null, episodeNumber: null, airDate: "2026-05-20" } }),
      show({ showKey: "sooner", title: "Sooner", nextEpisode: { name: null, seasonNumber: null, episodeNumber: null, airDate: "2026-05-11" } }),
      show({ showKey: "none", title: "No Episode" }),
    ];

    expect(sortFavoriteShows(favorites, "nextEpisode").map((favorite) => favorite.showKey)).toEqual(["sooner", "later", "none"]);
  });

  it("sorts by name and filters shows without a known next date", () => {
    const favorites = [
      show({ showKey: "z", title: "Zeta", isCanceled: true, nextEpisode: { name: null, seasonNumber: null, episodeNumber: null, airDate: "2026-05-20" } }),
      show({ showKey: "a", title: "Alpha", isCanceled: false, nextEpisode: { name: null, seasonNumber: null, episodeNumber: null, airDate: "2026-05-21" } }),
      show({ showKey: "m", title: "Middle", isCanceled: false }),
    ];

    expect(sortFavoriteShows(favorites, "name").map((favorite) => favorite.showKey)).toEqual(["a", "m", "z"]);
    expect(filterFavoriteShows(favorites, true).map((favorite) => favorite.showKey)).toEqual(["z", "m"]);
  });

  it("labels favorite sort modes for the UI", () => {
    expect(favoriteSortLabel("lastEpisode")).toBe("Last episode");
    expect(favoriteSortLabel("nextEpisode")).toBe("Next episode");
    expect(favoriteSortLabel("name")).toBe("Name");
  });

  it("separates the upstream lifecycle from the series stage", () => {
    const lanterns = show({
      showKey: "tmdb:95350",
      title: "Lanterns",
      status: "Returning Series",
      currentSeasonNumber: 1,
      numberOfSeasons: 1,
      firstAirDate: "2026-08-16",
      lastEpisode: { name: "Pilot", seasonNumber: 1, episodeNumber: 1, airDate: "2026-08-16" },
      nextEpisode: { name: "Episode 2", seasonNumber: 1, episodeNumber: 2, airDate: "2026-08-23" },
    });

    expect(favoriteLifecycleLabel(lanterns)).toBe("Active");
    expect(favoriteSeriesStageLabel(lanterns, new Date("2026-08-17T12:00:00.000Z"))).toBe("New series");
  });

  it("distinguishes established first seasons, returning seasons, and planned premieres", () => {
    expect(favoriteSeriesStageLabel(show({
      showKey: "first-season",
      title: "First Season",
      currentSeasonNumber: 1,
      firstAirDate: "2026-01-01",
    }), new Date("2026-08-17T12:00:00.000Z"))).toBe("First season");
    expect(favoriteSeriesStageLabel(show({
      showKey: "returning",
      title: "Returning",
      currentSeasonNumber: 2,
      numberOfSeasons: 2,
    }), new Date("2026-08-17T12:00:00.000Z"))).toBe("Returning");
    expect(favoriteSeriesStageLabel(show({
      showKey: "planned",
      title: "Planned",
      status: "Planned",
      currentSeasonNumber: 1,
      firstAirDate: "2026-09-01",
    }), new Date("2026-08-17T12:00:00.000Z"))).toBeNull();
    expect(favoriteLifecycleLabel(show({
      showKey: "ended",
      title: "Ended",
      status: "Ended",
    }))).toBe("Ended");
  });
});
