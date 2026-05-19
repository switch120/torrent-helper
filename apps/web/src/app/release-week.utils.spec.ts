import { describe, expect, it } from "vitest";
import {
  addWeeks,
  buildReleaseSections,
  cacheLabel,
  canHideShow,
  collectAddableProviderFilters,
  collectProviderFilters,
  collectHiddenShowFilters,
  DEFAULT_SELECTED_PROVIDERS,
  formatTmdbRating,
  ratingToneClass,
  formatWeekRange,
  normalizeWeekStartParam,
  providerKey,
  providerKeyFromName,
  showKey,
  startOfIsoWeek,
  weekEndFromStart,
} from "./release-week.utils";
import type { DigitalRelease, ReleaseWeekResponse } from "./release.models";

describe("release week utilities", () => {
  it("uses Monday as the selected week boundary", () => {
    expect(startOfIsoWeek(new Date("2026-05-16T12:00:00.000Z"))).toBe("2026-05-11");
    expect(weekEndFromStart("2026-05-11")).toBe("2026-05-17");
    expect(addWeeks("2026-05-11", 1)).toBe("2026-05-18");
    expect(addWeeks("2026-05-11", -1)).toBe("2026-05-04");
  });

  it("formats compact week ranges for the header", () => {
    expect(formatWeekRange("2026-05-11", "2026-05-17")).toBe("May 11 - May 17, 2026");
  });

  it("formats TMDB audience ratings when vote data is available", () => {
    expect(formatTmdbRating({ voteAverage: 7.84, voteCount: 1250 })).toBe("TMDB 7.8 · 1.3k votes");
    expect(formatTmdbRating({ voteAverage: 6.42, voteCount: null })).toBe("TMDB 6.4");
    expect(formatTmdbRating({ voteAverage: null, voteCount: 1250 })).toBeNull();
    expect(formatTmdbRating({ voteAverage: 0, voteCount: 0 })).toBeNull();
  });

  it("classifies TMDB ratings into cool, warm, and hot visual tones", () => {
    expect(ratingToneClass({ voteAverage: null })).toBe("rating-chip is-unrated");
    expect(ratingToneClass({ voteAverage: 0 })).toBe("rating-chip is-unrated");
    expect(ratingToneClass({ voteAverage: 5.9 })).toBe("rating-chip is-cool");
    expect(ratingToneClass({ voteAverage: 7.2 })).toBe("rating-chip is-warm");
    expect(ratingToneClass({ voteAverage: 8.1 })).toBe("rating-chip is-hot");
  });

  it("normalizes a remembered date to its Monday week start", () => {
    expect(normalizeWeekStartParam("2026-05-14")).toBe("2026-05-11");
    expect(normalizeWeekStartParam("not-a-date")).toBeNull();
    expect(normalizeWeekStartParam(null)).toBeNull();
  });

  it("builds stable Movies and TV sections", () => {
    const response: ReleaseWeekResponse = {
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
      cache: {
        status: "fresh",
        fetchedAt: "2026-05-16T12:00:00.000Z",
        expiresAt: "2026-05-17T12:00:00.000Z",
        warning: null,
      },
      movies: [
        {
          eventId: "movie",
          watchmodeId: 1,
          releaseSource: "watchmode",
          releaseKind: "streaming",
          title: "Movie",
          titleType: "movie",
          mediaType: "movie",
          tmdbId: 10,
          tmdbType: "movie",
          imdbId: "tt1",
          posterUrl: null,
          releaseDate: "2026-05-12",
          sourceId: 203,
          sourceName: "Netflix",
          sourceType: "unknown",
          seasonNumber: null,
          isOriginal: true,
        },
        {
          eventId: "digital-movie",
          watchmodeId: 100,
          releaseSource: "tmdb",
          releaseKind: "digital",
          title: "Digital Movie",
          titleType: "movie",
          mediaType: "movie",
          tmdbId: 100,
          tmdbType: "movie",
          imdbId: null,
          posterUrl: null,
          releaseDate: "2026-05-13",
          sourceId: 0,
          sourceName: "Digital release",
          sourceType: "digital",
          seasonNumber: null,
          isOriginal: false,
        },
      ],
      tv: [
        {
          eventId: "tv",
          watchmodeId: 2,
          releaseSource: "watchmode",
          releaseKind: "streaming",
          title: "Series",
          titleType: "tv_series",
          mediaType: "tv",
          tmdbId: 20,
          tmdbType: "tv",
          imdbId: "tt2",
          posterUrl: null,
          releaseDate: "2026-05-14",
          sourceId: 204,
          sourceName: "Prime Video",
          sourceType: "unknown",
          seasonNumber: 1,
          isOriginal: false,
        },
      ],
    };

    expect(buildReleaseSections(response, new Set([providerKeyFromName("Hulu")]))).toEqual([
      { title: "Movies", count: 2, hiddenCount: 0, emptyText: "No movie releases cached for this week.", releases: response.movies },
      { title: "TV", count: 0, hiddenCount: 0, emptyText: "No TV releases cached for this week.", releases: [] },
    ]);
  });

  it("normalizes provider filters, counts consolidated TV rows, and keeps seed labels selected", () => {
    const appleTvWatchMode = tvRelease({
      eventId: "watchmode-apple",
      releaseSource: "watchmode",
      sourceId: 371,
      sourceName: "AppleTV+",
      title: "For All Mankind",
      tmdbId: 942,
    });
    const appleTvTmdb = tvRelease({
      eventId: "tmdb-apple",
      releaseSource: "tmdb",
      sourceId: 350,
      sourceName: "Apple TV+",
      title: "For All Mankind",
      tmdbId: 942,
    });
    const hulu = tvRelease({
      eventId: "hulu",
      sourceId: 15,
      sourceName: "Hulu",
      title: "The Bear",
      tmdbId: 136315,
    });
    const response = responseWith({ tv: [appleTvWatchMode, appleTvTmdb, hulu] });

    expect(
      collectProviderFilters(response, new Set(DEFAULT_SELECTED_PROVIDERS.map((provider) => provider.key)), [
        ...DEFAULT_SELECTED_PROVIDERS,
        { key: "watchmode:999", name: "AMC", hidden: false },
      ]).filter((provider) => ["provider:appletv", "provider:hulu", "provider:amc"].includes(provider.key)),
    ).toEqual([
      { key: "provider:appletv", name: "Apple TV+", hidden: false, selected: true, count: 1, disabled: false },
      { key: "provider:hulu", name: "Hulu", hidden: false, selected: true, count: 1, disabled: false },
      { key: "provider:amc", name: "AMC", hidden: false, selected: false, count: 0, disabled: true },
    ]);
  });

  it("lists addable providers outside the current selected set with zero-count options last", () => {
    const response = responseWith({
      tv: [
        tvRelease({ eventId: "hulu", sourceName: "Hulu", title: "Hulu Show", tmdbId: 1 }),
        tvRelease({ eventId: "amc", sourceName: "AMC", title: "AMC Show", tmdbId: 2 }),
      ],
    });
    const filters = collectProviderFilters(response, new Set([providerKeyFromName("Hulu")]), [
      { key: "provider:hulu", name: "Hulu", hidden: false },
      { key: "provider:netflix", name: "Netflix", hidden: false },
    ]);

    expect(collectAddableProviderFilters(filters)).toEqual([
      { key: "provider:amc", name: "AMC", hidden: false, selected: false, count: 1, disabled: false },
      { key: "provider:netflix", name: "Netflix", hidden: false, selected: false, count: 0, disabled: true },
    ]);
  });

  it("counts providers from the same filtered TV rows shown in the section", () => {
    const favorite = tvRelease({
      eventId: "favorite",
      title: "Favorite Show",
      tmdbId: 100,
      sourceName: "Hulu",
    });
    const hidden = tvRelease({
      eventId: "hidden",
      title: "Hidden Show",
      tmdbId: 101,
      sourceName: "Hulu",
    });
    const otherProvider = tvRelease({
      eventId: "other-provider",
      title: "Other Provider Show",
      tmdbId: 102,
      sourceName: "Netflix",
    });
    const response = responseWith({ tv: [favorite, hidden, otherProvider] });
    const selectedProviders = new Set([providerKeyFromName("Hulu")]);
    const hiddenShows = new Set([showKey(hidden)]);

    expect(
      buildReleaseSections(response, selectedProviders, hiddenShows, {
        showOnlyFavorites: true,
        favoriteShowKeys: new Set([showKey(favorite)]),
      })[1].count,
    ).toBe(1);
    expect(
      collectProviderFilters(response, selectedProviders, DEFAULT_SELECTED_PROVIDERS, {
        hiddenShowKeys: hiddenShows,
        showOnlyFavorites: true,
        favoriteShowKeys: new Set([showKey(favorite)]),
      }).find((provider) => provider.key === providerKeyFromName("Hulu"))?.count,
    ).toBe(1);
  });

  it("lists hidden shows from the current week so they can be restored individually", () => {
    const hidden = tvRelease({
      eventId: "hidden",
      title: "Hidden Show",
      tmdbId: 101,
      posterUrl: "/hidden.jpg",
    });
    const visible = tvRelease({
      eventId: "visible",
      title: "Visible Show",
      tmdbId: 102,
    });

    expect(collectHiddenShowFilters(responseWith({ tv: [hidden, visible] }), new Set([showKey(hidden)]))).toEqual([
      {
        key: "tmdb:101",
        title: "Hidden Show",
        posterUrl: "/hidden.jpg",
        releaseDate: "2026-05-14",
        seasonNumber: 1,
        episodeNumber: 1,
      },
    ]);
  });

  it("consolidates TV rows for the same show, date, and season across providers and episode specificity", () => {
    const huluEpisode = tvRelease({
      eventId: "hulu-episode",
      sourceId: 15,
      sourceName: "Hulu",
      title: "90 Day Fiance: Pillow Talk",
      tmdbId: 200,
      seasonNumber: 13,
      episodeNumber: 36,
      voteAverage: null,
      voteCount: null,
    });
    const maxEpisode = tvRelease({
      eventId: "max-episode",
      sourceId: 1899,
      sourceName: "MAX",
      title: "90 Day Fiance: Pillow Talk",
      tmdbId: 200,
      seasonNumber: 13,
      episodeNumber: 36,
    });
    const huluSeason = tvRelease({
      eventId: "hulu-season",
      sourceId: 15,
      sourceName: "Hulu",
      title: "90 Day Fiance: Pillow Talk",
      tmdbId: 200,
      seasonNumber: 13,
      episodeNumber: null,
      voteAverage: 7.6,
      voteCount: 1800,
    });

    const sections = buildReleaseSections(responseWith({ tv: [huluEpisode, maxEpisode, huluSeason] }));

    expect(sections[1].count).toBe(1);
    expect(sections[1].releases[0]).toMatchObject({
      eventId: "hulu-episode",
      episodeNumber: 36,
      voteAverage: 7.6,
      voteCount: 1800,
      sources: [
        { key: "provider:hulu", name: "Hulu" },
        { key: "provider:max", name: "Max" },
      ],
    });
  });

  it("consolidates daily TV airings into one visible show card for the week", () => {
    const monday = tvRelease({
      eventId: "chronicles-monday",
      title: "Chronicles of the Sun",
      tmdbId: 300,
      sourceName: "Prime Video",
      releaseDate: "2026-05-04",
      seasonNumber: 8,
      episodeNumber: 104,
    });
    const friday = tvRelease({
      eventId: "chronicles-friday",
      title: "Chronicles of the Sun",
      tmdbId: 300,
      sourceName: "The Roku Channel",
      releaseDate: "2026-05-08",
      seasonNumber: 8,
      episodeNumber: 108,
    });

    const sections = buildReleaseSections(responseWith({ tv: [monday, friday] }));

    expect(sections[1].count).toBe(1);
    expect(sections[1].releases[0]).toMatchObject({
      title: "Chronicles of the Sun",
      seasonNumber: 8,
      sources: [
        { key: "provider:prime", name: "Prime" },
        { key: "provider:therokuchannel", name: "The Roku Channel" },
      ],
    });
  });

  it("hides selected TV shows behind the section counter", () => {
    const show = {
      eventId: "tv",
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
      releaseDate: "2026-05-14",
      sourceId: 204,
      sourceName: "Prime Video",
      sourceType: "unknown" as const,
      seasonNumber: 1,
      isOriginal: false,
    };
    const response: ReleaseWeekResponse = {
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
      cache: {
        status: "fresh",
        fetchedAt: "2026-05-16T12:00:00.000Z",
        expiresAt: "2026-05-17T12:00:00.000Z",
        warning: null,
      },
      movies: [],
      tv: [show],
    };

    expect(showKey(show)).toBe("tmdb:20");
    expect(buildReleaseSections(response, new Set([providerKeyFromName("Prime")]), new Set([showKey(show)]))[1]).toEqual({
      title: "TV",
      count: 0,
      hiddenCount: 1,
      emptyText: "No TV releases cached for this week.",
      releases: [],
    });
  });

  it("requires favorite shows to be unfavorited before they can be hidden", () => {
    const favorite = tvRelease({
      eventId: "favorite",
      title: "Favorite Show",
      tmdbId: 101,
    });
    const nonFavorite = tvRelease({
      eventId: "plain",
      title: "Plain Show",
      tmdbId: 102,
    });

    expect(canHideShow(favorite, new Set([showKey(favorite)]))).toBe(false);
    expect(canHideShow(nonFavorite, new Set([showKey(favorite)]))).toBe(true);
    expect(canHideShow({ ...favorite, mediaType: "movie" }, new Set([showKey(favorite)]))).toBe(false);
  });

  it("filters TV releases to favorite shows when requested", () => {
    const favoriteShow = {
      eventId: "favorite-tv",
      watchmodeId: 2,
      releaseSource: "watchmode" as const,
      releaseKind: "streaming" as const,
      title: "Favorite",
      titleType: "tv_series",
      mediaType: "tv" as const,
      tmdbId: 20,
      tmdbType: "tv",
      imdbId: "tt2",
      posterUrl: null,
      releaseDate: "2026-05-14",
      sourceId: 204,
      sourceName: "Prime Video",
      sourceType: "unknown" as const,
      seasonNumber: 1,
      isOriginal: false,
    };
    const otherShow = {
      ...favoriteShow,
      eventId: "other-tv",
      title: "Other",
      tmdbId: 21,
      watchmodeId: 3,
    };
    const response: ReleaseWeekResponse = {
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
      cache: {
        status: "fresh",
        fetchedAt: "2026-05-16T12:00:00.000Z",
        expiresAt: "2026-05-17T12:00:00.000Z",
        warning: null,
      },
      movies: [],
      tv: [favoriteShow, otherShow],
    };

    const sections = buildReleaseSections(response, new Set([providerKeyFromName("Prime")]), new Set(), {
      showOnlyFavorites: true,
      favoriteShowKeys: new Set([showKey(favoriteShow)]),
    });

    expect(sections[1].releases).toEqual([favoriteShow]);
    expect(sections[1].hiddenCount).toBe(0);
  });

  it("filters provider-backed TV to the selected provider allow-list", () => {
    const netflixMovie = {
      eventId: "movie-netflix",
      watchmodeId: 1,
      releaseSource: "watchmode" as const,
      releaseKind: "streaming" as const,
      title: "Netflix Movie",
      titleType: "movie",
      mediaType: "movie" as const,
      tmdbId: 10,
      tmdbType: "movie",
      imdbId: null,
      posterUrl: null,
      releaseDate: "2026-05-12",
      sourceId: 203,
      sourceName: "Netflix",
      sourceType: "unknown" as const,
      seasonNumber: null,
      isOriginal: false,
    };
    const huluShow = {
      eventId: "tv-hulu",
      watchmodeId: 2,
      releaseSource: "watchmode" as const,
      releaseKind: "streaming" as const,
      title: "Hulu Show",
      titleType: "tv_series",
      mediaType: "tv" as const,
      tmdbId: 20,
      tmdbType: "tv",
      imdbId: null,
      posterUrl: null,
      releaseDate: "2026-05-13",
      sourceId: 157,
      sourceName: "Hulu",
      sourceType: "unknown" as const,
      seasonNumber: null,
      isOriginal: false,
    };
    const response: ReleaseWeekResponse = {
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
      cache: {
        status: "fresh",
        fetchedAt: "2026-05-16T12:00:00.000Z",
        expiresAt: null,
        warning: null,
      },
      movies: [netflixMovie],
      tv: [huluShow],
    };

    expect(buildReleaseSections(response, new Set([providerKey(huluShow)]))).toEqual([
      { title: "Movies", count: 1, hiddenCount: 0, emptyText: "No movie releases cached for this week.", releases: [netflixMovie] },
      { title: "TV", count: 1, hiddenCount: 0, emptyText: "No TV releases cached for this week.", releases: [huluShow] },
    ]);
  });

  it("hides international and dubbed releases unless language filters include them", () => {
    const domesticMovie = movieRelease({ eventId: "movie-domestic", title: "Domestic Movie" });
    const internationalMovie = movieRelease({
      eventId: "movie-international",
      title: "International Movie",
      originalLanguage: "th",
      isInternational: true,
    });
    const dubbedShow = tvRelease({
      eventId: "tv-dubbed",
      title: "Dubbed Show",
      isDubbed: true,
    });
    const response = responseWith({
      movies: [domesticMovie, internationalMovie],
      tv: [dubbedShow],
    });

    expect(buildReleaseSections(response, null)[0].releases.map((release) => release.title)).toEqual([
      "Domestic Movie",
    ]);
    expect(buildReleaseSections(response, null)[1].releases).toEqual([]);
    expect(
      buildReleaseSections(response, null, new Set(), {
        showInternational: true,
        showDubbed: true,
      }).map((section) => section.releases.map((release) => release.title)),
    ).toEqual([["Domestic Movie", "International Movie"], ["Dubbed Show"]]);
  });

  it("describes cache state quietly", () => {
    expect(cacheLabel("idle", null)).toBe("Choose a week");
    expect(cacheLabel("loading", null)).toBe("Refreshing");
    expect(cacheLabel("error", "WatchMode 401")).toBe("WatchMode 401");
  });
});

function responseWith(overrides: Partial<ReleaseWeekResponse>): ReleaseWeekResponse {
  return {
    weekStart: "2026-05-11",
    weekEnd: "2026-05-17",
    cache: {
      status: "fresh",
      fetchedAt: "2026-05-16T12:00:00.000Z",
      expiresAt: "2026-05-17T12:00:00.000Z",
      warning: null,
    },
    movies: [],
    tv: [],
    ...overrides,
  };
}

function tvRelease(overrides: Partial<DigitalRelease>): DigitalRelease {
  return {
    eventId: "tv",
    watchmodeId: 2,
    releaseSource: "watchmode",
    releaseKind: "streaming",
    title: "Series",
    titleType: "tv_series",
    mediaType: "tv",
    tmdbId: 20,
    tmdbType: "tv",
    imdbId: null,
    posterUrl: null,
    releaseDate: "2026-05-14",
    sourceId: 204,
    sourceName: "Prime Video",
    sourceType: "unknown",
    seasonNumber: 1,
    episodeNumber: 1,
    isOriginal: false,
    ...overrides,
  };
}

function movieRelease(overrides: Partial<DigitalRelease>): DigitalRelease {
  return {
    eventId: "movie",
    watchmodeId: 1,
    releaseSource: "tmdb",
    releaseKind: "digital",
    title: "Movie",
    titleType: "movie",
    mediaType: "movie",
    tmdbId: 10,
    tmdbType: "movie",
    imdbId: null,
    posterUrl: null,
    releaseDate: "2026-05-14",
    sourceId: 0,
    sourceName: "Digital release",
    sourceType: "digital",
    seasonNumber: null,
    isOriginal: false,
    ...overrides,
  };
}
