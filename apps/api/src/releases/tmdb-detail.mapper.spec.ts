import { describe, expect, it } from "vitest";
import { applyCastExternalIds, mapTmdbMovieDetail, mapTmdbTvDetail } from "./tmdb-detail.mapper";
import type { NormalizedRelease } from "./release.types";

describe("TMDB detail mapping", () => {
  it("maps movie details into a release detail hero shape", () => {
    const release = baseRelease({ title: "Project Hail Mary", mediaType: "movie" });

    const detail = mapTmdbMovieDetail(release, {
      id: 687163,
      title: "Project Hail Mary",
      overview: "A science mission becomes a survival story.",
      backdrop_path: "/backdrop.jpg",
      poster_path: "/poster.jpg",
      release_date: "2026-03-09",
      runtime: 132,
      genres: [{ id: 878, name: "Science Fiction" }],
      credits: {
        cast: [
          { id: 1, name: "Ryan Gosling", character: "Ryland Grace", order: 0, profile_path: "/ryan.jpg" },
          { id: 2, name: "Sandra Huller", character: "Eva Stratt", order: 1, profile_path: null },
        ],
      },
      external_ids: { imdb_id: "tt12042730" },
    });

    expect(detail).toMatchObject({
      eventId: "event-1",
      mediaType: "movie",
      title: "Project Hail Mary",
      overview: "A science mission becomes a survival story.",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      releaseDate: "2026-03-09",
      runtimeMinutes: 132,
      genres: ["Science Fiction"],
      imdbId: "tt12042730",
    });
    expect(detail.cast.map((member) => member.name)).toEqual(["Ryan Gosling", "Sandra Huller"]);
  });

  it("maps TV details with selected season context", () => {
    const release = baseRelease({ title: "Welcome to Wrexham", mediaType: "tv", seasonNumber: 5 });

    const detail = mapTmdbTvDetail(
      release,
      {
        id: 126929,
        name: "Welcome to Wrexham",
        overview: "A football club keeps climbing.",
        backdrop_path: "/tv-backdrop.jpg",
        poster_path: "/tv-poster.jpg",
        first_air_date: "2022-08-24",
        genres: [{ id: 99, name: "Documentary" }],
        aggregate_credits: {
          cast: [{ id: 10, name: "Rob McElhenney", roles: [{ character: "Self" }], order: 0 }],
        },
        external_ids: { imdb_id: "tt14674086" },
      },
      {
        season_number: 5,
        air_date: "2026-05-14",
        episode_count: 8,
        overview: "Season five release.",
      },
    );

    expect(detail).toMatchObject({
      eventId: "event-1",
      mediaType: "tv",
      title: "Welcome to Wrexham",
      releaseDate: "2026-05-14",
      seasonNumber: 5,
      episodeCount: 8,
      genres: ["Documentary"],
      imdbId: "tt14674086",
    });
    expect(detail.cast[0]).toMatchObject({ name: "Rob McElhenney", character: "Self" });
  });

  it("adds IMDb links to cast members when external ids are available", () => {
    const detail = mapTmdbMovieDetail(baseRelease(), {
      id: 1,
      title: "Movie",
      credits: {
        cast: [
          { id: 10, name: "Actor One", character: "Lead", order: 0 },
          { id: 20, name: "Actor Two", character: "Support", order: 1 },
        ],
      },
    });

    const enriched = applyCastExternalIds(detail, new Map([[10, "nm1234567"]]));

    expect(enriched.cast[0]).toMatchObject({
      id: 10,
      imdbId: "nm1234567",
      imdbUrl: "https://www.imdb.com/name/nm1234567/",
    });
    expect(enriched.cast[1].imdbUrl).toBeNull();
  });
});

function baseRelease(overrides: Partial<NormalizedRelease> = {}): NormalizedRelease {
  return {
    eventId: "event-1",
    watchmodeId: 1,
    releaseSource: "watchmode",
    releaseKind: "streaming",
    title: "Release",
    titleType: "movie",
    mediaType: "movie",
    tmdbId: 10,
    tmdbType: "movie",
    imdbId: null,
    posterUrl: null,
    releaseDate: "2026-05-12",
    sourceId: 203,
    sourceName: "Netflix",
    sourceType: "unknown",
    seasonNumber: null,
    isOriginal: false,
    ...overrides,
  };
}
