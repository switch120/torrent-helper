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
                  vote_average: 7.8,
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
        voteAverage: 7.8,
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

  it("discovers weekly TV airings, uses TMDB networks for display, and dedupes provider buckets", async () => {
    const calls: string[] = [];
    const client = new TmdbClient({
      apiKey: "tmdb-key",
      tvProviderGroups: [
        {
          sourceId: 350,
          sourceName: "Apple TV+",
          providerIds: [350],
        },
        {
          sourceId: 9,
          sourceName: "Prime Video",
          providerIds: [9],
        },
      ],
      fetchImpl: async (url) => {
        calls.push(url);

        if (url.includes("/discover/tv")) {
          return new Response(
            JSON.stringify({
              page: 1,
              total_pages: 1,
              results: [
                {
                  id: 241609,
                  name: "Your Friends & Neighbors",
                  original_name: "Your Friends & Neighbors",
                  overview: "A rich life gets complicated.",
                  poster_path: "/your-friends.jpg",
                  first_air_date: "2019-11-01",
                  popularity: 56.7,
                  vote_average: 8.1,
                  vote_count: 1200,
                },
              ],
            }),
          );
        }

        if (url.includes("/3/tv/241609/season/2")) {
          return new Response(
            JSON.stringify({
              season_number: 2,
              episodes: [
                {
                  name: "In the Week",
                  air_date: "2026-05-15",
                  season_number: 2,
                  episode_number: 7,
                },
                {
                  name: "Too Late",
                  air_date: "2026-05-22",
                  season_number: 2,
                  episode_number: 8,
                },
              ],
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 241609,
            name: "Your Friends & Neighbors",
            original_name: "Your Friends & Neighbors",
            poster_path: "/your-friends.jpg",
            first_air_date: "2019-11-01",
            external_ids: { imdb_id: "tt31867398" },
            networks: [{ id: 2552, name: "Apple TV+" }],
            seasons: [
              {
                season_number: 2,
                air_date: "2026-04-10",
                episode_count: 10,
              },
            ],
          }),
        );
      },
    });

    const result = await client.getTvAirings({
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
    });

    expect(calls[0]).toContain("/3/discover/tv");
    expect(calls[0]).toContain("air_date.gte=2026-05-11");
    expect(calls[0]).toContain("air_date.lte=2026-05-17");
    expect(calls[0]).toContain("with_watch_providers=350");
    expect(calls.some((url) => url.includes("with_watch_providers=9"))).toBe(true);
    expect(result.releases).toEqual([
      expect.objectContaining({
        eventId: "tmdb:tv:241609:2026-05-15:2:7",
        releaseSource: "tmdb",
        releaseKind: "streaming",
        sourceName: "Apple TV+",
        sourceId: 2552,
        sourceType: "unknown",
        title: "Your Friends & Neighbors",
        mediaType: "tv",
        tmdbId: 241609,
        tmdbType: "tv",
        imdbId: "tt31867398",
        releaseDate: "2026-05-15",
        seasonNumber: 2,
        episodeNumber: 7,
        episodeName: "In the Week",
        voteAverage: 8.1,
        voteCount: 1200,
      }),
    ]);
    expect(result.releases).toHaveLength(1);
  });

  it("starts provider discovery together and hydrates duplicate TV shows once", async () => {
    const calls: string[] = [];
    const pendingDiscover = new Map<string, (response: Response) => void>();
    let tvDetailCalls = 0;
    let seasonDetailCalls = 0;
    const discoverResponse = () =>
      new Response(
        JSON.stringify({
          page: 1,
          total_pages: 1,
          results: [
            {
              id: 241609,
              name: "Your Friends & Neighbors",
              poster_path: "/your-friends.jpg",
              first_air_date: "2026-04-11",
              popularity: 56.7,
              vote_average: 8.1,
              vote_count: 1200,
            },
          ],
        }),
      );

    const client = new TmdbClient({
      apiKey: "tmdb-key",
      tvProviderGroups: [
        { sourceId: 350, sourceName: "Apple TV+", providerIds: [350] },
        { sourceId: 9, sourceName: "Prime Video", providerIds: [9] },
      ],
      fetchImpl: async (url) => {
        calls.push(url);

        if (url.includes("/discover/tv")) {
          const key = url.includes("with_watch_providers=350") ? "apple" : "prime";
          return new Promise<Response>((resolve) => pendingDiscover.set(key, resolve));
        }

        if (url.includes("/3/tv/241609/season/2")) {
          seasonDetailCalls += 1;
          return new Response(
            JSON.stringify({
              season_number: 2,
              episodes: [
                {
                  name: "In the Week",
                  air_date: "2026-05-15",
                  season_number: 2,
                  episode_number: 7,
                },
              ],
            }),
          );
        }

        tvDetailCalls += 1;
        return new Response(
          JSON.stringify({
            id: 241609,
            name: "Your Friends & Neighbors",
            first_air_date: "2026-04-11",
            networks: [{ id: 2552, name: "Apple TV+" }],
            seasons: [{ season_number: 2, air_date: "2026-04-11", episode_count: 10 }],
          }),
        );
      },
    });

    const resultPromise = client.getTvAirings({
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
    });
    await Promise.resolve();
    const discoverCallsBeforeFirstResponse = calls.filter((url) => url.includes("/discover/tv")).length;

    pendingDiscover.get("apple")?.(discoverResponse());
    for (let attempt = 0; attempt < 10 && !pendingDiscover.has("prime"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(pendingDiscover.has("prime")).toBe(true);
    pendingDiscover.get("prime")?.(discoverResponse());

    const result = await resultPromise;

    expect(discoverCallsBeforeFirstResponse).toBe(2);
    expect(tvDetailCalls).toBe(1);
    expect(seasonDetailCalls).toBe(1);
    expect(result.releases).toHaveLength(1);
  });
});
