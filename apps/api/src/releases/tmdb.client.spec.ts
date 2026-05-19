import { describe, expect, it } from "vitest";
import { TmdbClient } from "./tmdb.client";

describe("TmdbClient", () => {
  it("retries TMDB rate limit responses before failing the request", async () => {
    let calls = 0;
    const client = new TmdbClient({
      apiKey: "tmdb-key",
      retryDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({ status_message: "Too many requests" }), {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "Retry-After": "0" },
          });
        }

        return new Response(
          JSON.stringify({
            id: 100,
            title: "Recovered Movie",
          }),
        );
      },
    });

    await expect(client.getMovieDetail(100)).resolves.toEqual(expect.objectContaining({ title: "Recovered Movie" }));
    expect(calls).toBe(2);
  });

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
                  original_language: "th",
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
    expect(calls.some((url) => url.includes("with_release_type=2"))).toBe(true);
    expect(calls.some((url) => url.includes("with_release_type=3"))).toBe(true);
    expect(calls.some((url) => url.includes("/3/movie/100/release_dates"))).toBe(true);
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
        originalLanguage: "th",
        isInternational: true,
        isDubbed: false,
      }),
    ]);
    expect(result.raw).toEqual(
      expect.objectContaining({
        digitalDatePolicy: "original-us-digital-with-provider-backed-fallback-v2",
      }),
    );
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

  it("ignores later digital availability when the original digital release was earlier", async () => {
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
                  id: 901,
                  title: "The Bride!",
                  poster_path: "/bride.jpg",
                  release_date: "2026-03-06",
                  popularity: 48,
                  vote_count: 200,
                },
              ],
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 901,
            results: [
              {
                iso_3166_1: "US",
                release_dates: [
                  {
                    release_date: "2026-03-06T00:00:00.000Z",
                    type: 3,
                  },
                  {
                    note: "Premium digital",
                    release_date: "2026-04-07T00:00:00.000Z",
                    type: 4,
                  },
                  {
                    note: "Streaming availability",
                    release_date: "2026-05-22T00:00:00.000Z",
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
      weekStart: "2026-05-18",
      weekEnd: "2026-05-24",
    });

    expect(result.releases).toEqual([]);
  });

  it("includes same-week new movie releases when TMDB has no explicit digital date", async () => {
    const client = new TmdbClient({
      apiKey: "tmdb-key",
      fetchImpl: async (url) => {
        if (url.includes("/discover/movie") && url.includes("with_release_type=4")) {
          return new Response(JSON.stringify({ page: 1, total_pages: 1, results: [] }));
        }

        if (url.includes("/discover/movie")) {
          return new Response(
            JSON.stringify({
              page: 1,
              total_pages: 1,
              results: [
                {
                  id: 1398050,
                  title: "Driver's Ed",
                  poster_path: "/drivers-ed.jpg",
                  release_date: "2026-05-14",
                  popularity: 8.6541,
                  vote_count: 6,
                },
              ],
            }),
          );
        }

        if (url.includes("/watch/providers")) {
          return new Response(
            JSON.stringify({
              id: 1398050,
              results: {
                US: {
                  buy: [
                    {
                      provider_id: 2,
                      provider_name: "Apple TV Store",
                    },
                  ],
                },
              },
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 1398050,
            results: [
              {
                iso_3166_1: "US",
                release_dates: [
                  {
                    note: "Limited",
                    release_date: "2026-05-15T00:00:00.000Z",
                    type: 3,
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
        eventId: "tmdb:digital:1398050:2026-05-15",
        title: "Driver's Ed",
        releaseDate: "2026-05-15",
        sourceName: "New release",
        isFeaturedDigital: true,
        isDigitalDateFallback: true,
      }),
    ]);
  });

  it("excludes same-week theatrical movies when TMDB has no digital availability", async () => {
    const client = new TmdbClient({
      apiKey: "tmdb-key",
      fetchImpl: async (url) => {
        if (url.includes("/discover/movie") && url.includes("with_release_type=4")) {
          return new Response(JSON.stringify({ page: 1, total_pages: 1, results: [] }));
        }

        if (url.includes("/discover/movie")) {
          return new Response(
            JSON.stringify({
              page: 1,
              total_pages: 1,
              results: [
                {
                  id: 1005331,
                  title: "The Mandalorian and Grogu",
                  poster_path: "/mandalorian.jpg",
                  release_date: "2026-05-22",
                  popularity: 100.5,
                  vote_count: 1000,
                },
              ],
            }),
          );
        }

        if (url.includes("/watch/providers")) {
          return new Response(
            JSON.stringify({
              id: 1005331,
              results: {
                US: {},
              },
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 1005331,
            results: [
              {
                iso_3166_1: "US",
                release_dates: [
                  {
                    note: "Theatrical",
                    release_date: "2026-05-22T00:00:00.000Z",
                    type: 3,
                  },
                ],
              },
            ],
          }),
        );
      },
    });

    const result = await client.getDigitalMovieReleases({
      weekStart: "2026-05-18",
      weekEnd: "2026-05-24",
    });

    expect(result.releases).toEqual([]);
  });

  it("hydrates movie streaming providers without treating rental stores as streaming availability", async () => {
    const client = new TmdbClient({
      apiKey: "tmdb-key",
      fetchImpl: async (url) => {
        if (url.includes("/discover/movie") && !url.includes("with_release_type=4")) {
          return new Response(JSON.stringify({ page: 1, total_pages: 1, results: [] }));
        }

        if (url.includes("/discover/movie")) {
          return new Response(
            JSON.stringify({
              page: 1,
              total_pages: 1,
              results: [
                {
                  id: 1439930,
                  title: "The Punisher: One Last Kill",
                  poster_path: "/punisher.jpg",
                  release_date: "2026-05-12",
                  popularity: 671,
                  vote_count: 906,
                },
              ],
            }),
          );
        }

        if (url.includes("/watch/providers")) {
          return new Response(
            JSON.stringify({
              id: 1439930,
              results: {
                US: {
                  flatrate: [
                    {
                      provider_id: 337,
                      provider_name: "Disney Plus",
                    },
                  ],
                  rent: [
                    {
                      provider_id: 2,
                      provider_name: "Apple TV Store",
                    },
                  ],
                },
              },
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 1439930,
            results: [
              {
                iso_3166_1: "US",
                release_dates: [
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
        title: "The Punisher: One Last Kill",
        sources: [
          {
            key: "provider:disneyplus",
            name: "Disney Plus",
            releaseSource: "tmdb",
            sourceId: 337,
            sourceType: "sub",
          },
        ],
      }),
    ]);
  });

  it("keeps old theatrical rereleases out of the new-release fallback", async () => {
    const releaseDateCalls: string[] = [];
    const client = new TmdbClient({
      apiKey: "tmdb-key",
      fetchImpl: async (url) => {
        if (url.includes("/discover/movie") && url.includes("with_release_type=4")) {
          return new Response(JSON.stringify({ page: 1, total_pages: 1, results: [] }));
        }

        if (url.includes("/discover/movie")) {
          return new Response(
            JSON.stringify({
              page: 1,
              total_pages: 1,
              results: [
                {
                  id: 808,
                  title: "Shrek",
                  poster_path: "/shrek.jpg",
                  release_date: "2001-05-18",
                  popularity: 34.0042,
                  vote_count: 18718,
                },
              ],
            }),
          );
        }

        releaseDateCalls.push(url);
        return new Response(
          JSON.stringify({
            id: 808,
            results: [
              {
                iso_3166_1: "US",
                release_dates: [
                  {
                    release_date: "2026-05-15T00:00:00.000Z",
                    type: 3,
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

    expect(result.releases).toEqual([]);
    expect(releaseDateCalls).toEqual([]);
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
                  original_language: "en",
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
            original_language: "en",
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
        originalLanguage: "en",
        isInternational: false,
        isDubbed: false,
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
