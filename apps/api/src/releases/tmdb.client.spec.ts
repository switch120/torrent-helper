import { describe, expect, it } from "vitest";
import { TmdbClient } from "./tmdb.client";

describe("TmdbClient", () => {
  it("discovers US digital movies and hydrates their digital release date", async () => {
    const calls: string[] = [];
    const client = new TmdbClient({
      apiKey: "tmdb-key",
      fetchImpl: async (url) => {
        calls.push(url);

        if (url.includes("/discover/movie")) {
          return new Response(
            JSON.stringify({
              page: 1,
              total_pages: 1,
              results: [
                {
                  id: 100,
                  title: "Digital Movie",
                  original_title: "Digital Movie",
                  overview: "A movie with a digital street date.",
                  poster_path: "/poster.jpg",
                  release_date: "2026-01-01",
                  popularity: 80.5,
                  vote_count: 120,
                },
              ],
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 100,
            results: [
              {
                iso_3166_1: "US",
                release_dates: [
                  {
                    certification: "",
                    descriptors: [],
                    iso_639_1: "",
                    note: "Digital",
                    release_date: "2026-05-12T00:00:00.000Z",
                    type: 4,
                  },
                ],
              },
            ],
          }),
        );
      },
    });

    const result = await client.getDigitalMovieReleases({
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
    });

    expect(calls[0]).toContain("/3/discover/movie");
    expect(calls[0]).toContain("api_key=tmdb-key");
    expect(calls[0]).toContain("region=US");
    expect(calls[0]).toContain("with_release_type=4");
    expect(calls[0]).toContain("release_date.gte=2026-05-11");
    expect(calls[0]).toContain("release_date.lte=2026-05-17");
    expect(calls[1]).toContain("/3/movie/100/release_dates");
    expect(result.releases).toEqual([
      expect.objectContaining({
        eventId: "tmdb:digital:100:2026-05-12",
        releaseSource: "tmdb",
        releaseKind: "digital",
        sourceName: "Digital release",
        title: "Digital Movie",
        tmdbId: 100,
        releaseDate: "2026-05-12",
        primaryReleaseDate: "2026-01-01",
        popularity: 80.5,
        voteCount: 120,
        isFeaturedDigital: true,
      }),
    ]);
  });

  it("keeps older catalog digital dates out of the featured lane", async () => {
    const client = new TmdbClient({
      apiKey: "tmdb-key",
      fetchImpl: async (url) => {
        if (url.includes("/discover/movie")) {
          return new Response(
            JSON.stringify({
              page: 1,
              total_pages: 1,
              results: [
                {
                  id: 550,
                  title: "Fight Club",
                  poster_path: "/fight-club.jpg",
                  release_date: "1999-10-15",
                  popularity: 120,
                  vote_count: 30000,
                },
              ],
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 550,
            results: [
              {
                iso_3166_1: "US",
                release_dates: [
                  {
                    release_date: "1999-10-15T00:00:00.000Z",
                    type: 3,
                  },
                  {
                    release_date: "2026-05-12T00:00:00.000Z",
                    type: 4,
                  },
                ],
              },
            ],
          }),
        );
      },
    });

    const result = await client.getDigitalMovieReleases({
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
    });

    expect(result.releases).toEqual([
      expect.objectContaining({
        title: "Fight Club",
        primaryReleaseDate: "1999-10-15",
        popularity: 120,
        voteCount: 30000,
        isFeaturedDigital: false,
      }),
    ]);
  });

  it("is disabled without an API key or read access token", () => {
    expect(new TmdbClient().isConfigured()).toBe(false);
  });
});
