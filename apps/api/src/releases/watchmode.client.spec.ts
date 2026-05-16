import { describe, expect, it } from "vitest";
import { WatchModeClient } from "./watchmode.client";

describe("WatchModeClient", () => {
  it("requests the simple releases endpoint with week date parameters", async () => {
    const calls: string[] = [];
    const client = new WatchModeClient({
      apiKey: "test-key",
      fetchImpl: async (url) => {
        calls.push(url);
        return new Response(JSON.stringify({ releases: [] }), {
          headers: {
            "x-ratelimit-limit": "60",
            "x-ratelimit-remaining": "59",
            "x-account-quota": "1000",
            "x-account-quota-used": "4",
          },
        });
      },
    });

    const result = await client.getReleases({
      startDate: 20260511000000,
      endDate: 20260517235959,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/v1/releases/");
    expect(calls[0]).toContain("apiKey=test-key");
    expect(calls[0]).toContain("start_date=20260511000000");
    expect(calls[0]).toContain("end_date=20260517235959");
    expect(calls[0]).toContain("limit=250");
    expect(result.quota).toEqual({
      rateLimitLimit: 60,
      rateLimitRemaining: 59,
      accountQuota: 1000,
      accountQuotaUsed: 4,
    });
  });

  it("maps releases into normalized movie and tv buckets", async () => {
    const client = new WatchModeClient({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            releases: [
              {
                id: 1,
                title: "Movie One",
                type: "movie",
                tmdb_id: 10,
                tmdb_type: "movie",
                imdb_id: "tt1",
                poster_url: "https://example.test/movie.jpg",
                source_release_date: "2026-05-12",
                source_id: 203,
                source_name: "Netflix",
                is_original: 1,
              },
              {
                id: 2,
                title: "Series One",
                type: "tv_series",
                tmdb_id: 20,
                tmdb_type: "tv",
                imdb_id: "tt2",
                season_number: 2,
                poster_url: null,
                source_release_date: "2026-05-15",
                source_id: 371,
                source_name: "AppleTV+",
                is_original: 0,
              },
            ],
          }),
        ),
    });

    const result = await client.getReleases({
      startDate: 20260511000000,
      endDate: 20260517235959,
    });

    expect(result.releases).toEqual([
      expect.objectContaining({
        watchmodeId: 1,
        title: "Movie One",
        mediaType: "movie",
        sourceName: "Netflix",
        isOriginal: true,
      }),
      expect.objectContaining({
        watchmodeId: 2,
        title: "Series One",
        mediaType: "tv",
        sourceName: "AppleTV+",
        seasonNumber: 2,
        isOriginal: false,
      }),
    ]);
  });
});
