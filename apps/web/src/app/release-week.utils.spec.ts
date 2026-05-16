import { describe, expect, it } from "vitest";
import {
  addWeeks,
  buildReleaseSections,
  cacheLabel,
  formatWeekRange,
  providerKey,
  startOfIsoWeek,
  weekEndFromStart,
} from "./release-week.utils";
import type { ReleaseWeekResponse } from "./release.models";

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
      tv: [],
    };

    expect(buildReleaseSections(response, new Set([providerKey(response.movies[0])]))).toEqual([
      { title: "Movies", count: 1, emptyText: "No movie releases cached for this week.", releases: [response.movies[1]] },
      { title: "TV", count: 0, emptyText: "No TV releases cached for this week.", releases: [] },
    ]);
  });

  it("describes cache state quietly", () => {
    expect(cacheLabel("idle", null)).toBe("Choose a week");
    expect(cacheLabel("loading", null)).toBe("Refreshing");
    expect(cacheLabel("error", "WatchMode 401")).toBe("WatchMode 401");
  });
});
