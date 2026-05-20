import { describe, expect, it } from "vitest";
import type { NormalizedRelease } from "../releases/release.types";
import { ProwlarrClient, normalizeProwlarrResults, parseTorznabXml } from "./prowlarr.client";

describe("Prowlarr torrent normalization", () => {
  it("extracts magnet links and sorts by seeders", () => {
    const results = normalizeProwlarrResults(
      [
        {
          title: "Movie 2026 1080p WEB-DL",
          indexer: "Indexer B",
          magnetUrl: "magnet:?xt=urn:btih:bbbb&dn=movie",
          size: 5_000_000_000,
          seeders: 12,
          leechers: 2,
          publishDate: "2026-05-12T00:00:00Z",
        },
        {
          title: "Movie 2026 2160p WEB-DL",
          indexer: "Indexer A",
          downloadUrl: "magnet:?xt=urn:btih:aaaa&dn=movie",
          size: 18_000_000_000,
          seeders: 140,
          leechers: 8,
        },
        {
          title: "Movie 2026 torrent file only",
          indexer: "Indexer C",
          downloadUrl: "https://example.test/file.torrent",
          size: 1,
        },
      ],
      { expectedQuality: "any", releaseTitle: "Movie" },
    );

    expect(results.map((result) => result.title)).toEqual([
      "Movie 2026 2160p WEB-DL",
      "Movie 2026 1080p WEB-DL",
    ]);
    expect(results[0]).toMatchObject({
      quality: "2160p",
      seeders: 140,
      sizeBytes: 18_000_000_000,
      magnetLink: "magnet:?xt=urn:btih:aaaa&dn=movie",
    });
  });

  it("builds magnet links from Prowlarr info hashes when URLs are proxied downloads", () => {
    const results = normalizeProwlarrResults(
      [
        {
          title: "Fight Club 1999 1080p BluRay",
          indexer: "YTS",
          magnetUrl: "http://prowlarr:9696/1/download?apikey=secret&link=token",
          downloadUrl: "http://prowlarr:9696/1/download?apikey=secret&link=token",
          infoHash: "511C437F775F21BE8534581FF6336428D3F502DB",
          size: 2_700_000_000,
          seeders: 42,
        },
      ],
      { expectedQuality: "any", releaseTitle: "Fight Club" },
    );

    expect(results).toHaveLength(1);
    expect(results[0].magnetLink).toBe(
      "magnet:?xt=urn:btih:511C437F775F21BE8534581FF6336428D3F502DB&dn=Fight%20Club%201999%201080p%20BluRay",
    );
  });

  it("does not resolve Prowlarr proxy download redirects during search", async () => {
    const requests: string[] = [];
    const client = new ProwlarrClient({
      apiKey: "key",
      baseUrl: "http://prowlarr.test",
      fetchImpl: async (url) => {
        requests.push(String(url));
        if (String(url).includes("/api/v1/indexer")) {
          return new Response(JSON.stringify([{ enable: true }]));
        }
        if (String(url).includes("/api/v1/search")) {
          return new Response(JSON.stringify([
            {
              title: "GOAT 2026 1080p WEB-DL HEVC x265 5.1 BONE",
              indexer: "The Pirate Bay",
              magnetUrl: "http://prowlarr.test/3/download?apikey=key&link=token",
              infoHash: "58F7D7FD68A324F7B2CE038E6F353597216103BF",
              size: 1_700_000_000,
              seeders: 913,
            },
          ]));
        }
        if (String(url).includes("/3/download")) {
          return new Response(null, {
            status: 301,
            headers: {
              location:
                "magnet:?xt=urn:btih:58F7D7FD68A324F7B2CE038E6F353597216103BF&dn=GOAT%202026&tr=udp%3A%2F%2Ftracker.example%3A1337%2Fannounce",
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    const result = await client.searchRelease({
      eventId: "event",
      sourceTitleId: 1,
      releaseSource: "tmdb",
      releaseKind: "digital",
      title: "GOAT",
      titleType: "movie",
      mediaType: "movie",
      tmdbId: 1,
      tmdbType: "movie",
      imdbId: null,
      posterUrl: null,
      releaseDate: "2026-05-12",
      primaryReleaseDate: "2026-05-12",
      sourceId: 0,
      sourceName: "Digital release",
      sourceType: "digital",
      seasonNumber: null,
      isOriginal: false,
    }, "any");

    expect(requests.some((url) => url.includes("/3/download"))).toBe(false);
    expect(result.results[0].magnetLink).not.toContain("&tr=");
  });

  it("resolves only the selected Prowlarr proxy download into a full magnet link", async () => {
    const requests: string[] = [];
    const client = new ProwlarrClient({
      apiKey: "key",
      baseUrl: "http://prowlarr.test",
      fetchImpl: async (url) => {
        requests.push(String(url));
        if (String(url).includes("/api/v1/search")) {
          return new Response(JSON.stringify([
            {
              title: "GOAT 2026 1080p WEB-DL HEVC x265 5.1 BONE",
              indexer: "The Pirate Bay",
              magnetUrl: "http://prowlarr.test/3/download?apikey=key&link=token",
              infoHash: "58F7D7FD68A324F7B2CE038E6F353597216103BF",
              size: 1_700_000_000,
              seeders: 913,
            },
          ]));
        }
        if (String(url).includes("/3/download")) {
          return new Response(null, {
            status: 301,
            headers: {
              location:
                "magnet:?xt=urn:btih:58F7D7FD68A324F7B2CE038E6F353597216103BF&dn=GOAT%202026&tr=udp%3A%2F%2Ftracker.example%3A1337%2Fannounce",
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    const result = await client.resolveMagnetForRelease(
      release({
        title: "GOAT",
        primaryReleaseDate: "2026-05-12",
        releaseDate: "2026-05-12",
      }),
      "magnet:?xt=urn:btih:58f7d7fd68a324f7b2ce038e6f353597216103bf&dn=GOAT%202026",
    );

    expect(requests.filter((url) => url.includes("/3/download"))).toHaveLength(1);
    expect(result).toContain("&tr=");
  });

  it("rejects unrelated episodic and compound-title torrents for a single-word movie", () => {
    const results = normalizeProwlarrResults(
      [
        {
          title: "[ToonsHub] BEASTARS S03E13-E24 1080p NF WEB-DL DDP5.1 H.264 [BATCH]",
          indexer: "Nyaa.si",
          infoHash: "92903c9b3e8b1234567890123456789012345678",
          seeders: 288,
          size: 12_700_000_000,
        },
        {
          title: "Beast Games S02E08 Would You Steal S1000000 1080p AMZN WEB-DL",
          indexer: "The Pirate Bay",
          infoHash: "337ddbf2e2301234567890123456789012345678",
          seeders: 139,
          size: 3_500_000_000,
        },
        {
          title: "The.Beast.in.Me.S01.COMPLETE.1080p.NF.WEB-DL.H.264",
          indexer: "The Pirate Bay",
          infoHash: "ca30e6d0c0401234567890123456789012345678",
          seeders: 124,
          size: 28_000_000_000,
        },
        {
          title: "The Beast King Ouma Reconquers the World 001-008 (2026) (Digital) (Oak)",
          indexer: "Nyaa.si",
          infoHash: "92903c9b3e8b1234567890123456789012345679",
          seeders: 3,
          size: 464_624_032,
        },
        {
          title: "Beast 2026 1080p WEB-DL H264",
          indexer: "YTS",
          infoHash: "511c437f775f21be8534581ff6336428d3f502db",
          seeders: 24,
          size: 3_100_000_000,
        },
      ],
      {
        expectedQuality: "any",
        releaseTitle: "Beast",
        mediaType: "movie",
        releaseYear: 2026,
      },
    );

    expect(results.map((result) => result.title)).toEqual([
      "Beast 2026 1080p WEB-DL H264",
    ]);
  });

  it("returns a warning when Prowlarr has no enabled indexers", async () => {
    const client = new ProwlarrClient({
      apiKey: "key",
      baseUrl: "http://prowlarr.test",
      fetchImpl: async (url) => {
        if (url.includes("/api/v1/indexer")) {
          return new Response(JSON.stringify([]));
        }

        return new Response(JSON.stringify([{ title: "Should not search" }]));
      },
    });

    const result = await client.searchRelease({
      eventId: "event",
      sourceTitleId: 1,
      releaseSource: "tmdb",
      releaseKind: "digital",
      title: "Movie",
      titleType: "movie",
      mediaType: "movie",
      tmdbId: 1,
      tmdbType: "movie",
      imdbId: null,
      posterUrl: null,
      releaseDate: "2026-05-12",
      sourceId: 0,
      sourceName: "Digital release",
      sourceType: "digital",
      seasonNumber: null,
      isOriginal: false,
    }, "any");

    expect(result).toEqual({
      results: [],
      warning: "Prowlarr is configured but has no enabled indexers.",
    });
  });

  it("parses Torznab XML extended attributes", () => {
    const results = parseTorznabXml(`
      <rss><channel>
        <item>
          <title>Sample Film 1080p</title>
          <guid>magnet:?xt=urn:btih:abc</guid>
          <torznab:attr name="seeders" value="44" />
          <torznab:attr name="peers" value="52" />
          <torznab:attr name="size" value="7000000000" />
        </item>
      </channel></rss>
    `);

    expect(results).toEqual([
      expect.objectContaining({
        title: "Sample Film 1080p",
        magnetLink: "magnet:?xt=urn:btih:abc",
        seeders: 44,
        leechers: 8,
        sizeBytes: 7_000_000_000,
        quality: "1080p",
      }),
    ]);
  });
});

function release(overrides: Partial<NormalizedRelease> = {}): NormalizedRelease {
  return {
    eventId: "event",
    sourceTitleId: 1,
    releaseSource: "tmdb",
    releaseKind: "digital",
    title: "Movie",
    titleType: "movie",
    mediaType: "movie",
    tmdbId: 1,
    tmdbType: "movie",
    imdbId: null,
    posterUrl: null,
    releaseDate: "2026-05-12",
    primaryReleaseDate: "2026-05-12",
    sourceId: 0,
    sourceName: "Digital release",
    sourceType: "digital",
    seasonNumber: null,
    isOriginal: false,
    ...overrides,
  };
}
