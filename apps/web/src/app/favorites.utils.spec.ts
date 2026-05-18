import { describe, expect, it } from "vitest";
import type { FavoriteShowSummary } from "./release.models";
import { favoriteSortLabel, filterFavoriteShows, sortFavoriteShows } from "./favorites.utils";

const show = (input: Partial<FavoriteShowSummary> & Pick<FavoriteShowSummary, "showKey" | "title">): FavoriteShowSummary => ({
  tmdbId: null,
  watchmodeId: null,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
  status: null,
  isCanceled: false,
  currentSeasonNumber: null,
  numberOfSeasons: null,
  numberOfEpisodes: null,
  lastAirDate: null,
  lastEpisode: null,
  nextEpisode: null,
  releaseContext: null,
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
});
