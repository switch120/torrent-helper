import { describe, expect, it } from "vitest";
import { OpenAiTorrentReranker } from "./openai-torrent-reranker";
import type { TorrentResult } from "./torrent.types";

describe("OpenAiTorrentReranker", () => {
  it("sends sanitized torrent metadata and keeps only high-confidence matches", async () => {
    let requestBody = "";
    const reranker = new OpenAiTorrentReranker({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async (_url, init) => {
        requestBody = String(init?.body || "");
        return new Response(JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    matches: [
                      { id: "c0", match: false, confidence: 0.98, reason: "TV episode, not the movie." },
                      { id: "c1", match: true, confidence: 0.91, reason: "Exact movie title and year." },
                    ],
                  }),
                },
              ],
            },
          ],
        }));
      },
    });

    const result = await reranker.rerank({
      release: {
        title: "Beast",
        mediaType: "movie",
        releaseYear: 2026,
        imdbId: "tt7708226",
        tmdbId: 1292415,
      },
      torrents: [
        torrent({
          title: "Beast Games S02E08 Would You Steal S1000000 1080p AMZN WEB-DL",
          magnetLink: "magnet:?xt=urn:btih:bad",
        }),
        torrent({
          title: "Beast 2026 1080p WEB-DL H264",
          magnetLink: "magnet:?xt=urn:btih:good",
        }),
      ],
    });

    expect(requestBody).toContain("Beast Games S02E08");
    expect(requestBody).not.toContain("magnet:?xt=urn:btih");
    expect(result.warning).toBeNull();
    expect(result.results.map((torrent) => torrent.title)).toEqual([
      "Beast 2026 1080p WEB-DL H264",
    ]);
    expect(result.results[0].confidence).toBe(91);
  });

  it("falls back to deterministic results when OpenAI is not configured", async () => {
    const reranker = new OpenAiTorrentReranker({});
    const torrents = [torrent({ title: "Beast 2026 1080p WEB-DL H264" })];

    await expect(reranker.rerank({
      release: { title: "Beast", mediaType: "movie", releaseYear: 2026 },
      torrents,
    })).resolves.toEqual({ results: torrents, warning: null });
  });
});

function torrent(overrides: Partial<TorrentResult> = {}): TorrentResult {
  return {
    id: "id",
    title: "Movie 2026 1080p WEB-DL",
    indexer: "Indexer",
    magnetLink: "magnet:?xt=urn:btih:abc",
    sizeBytes: 2_000_000_000,
    seeders: 10,
    leechers: 1,
    quality: "1080p",
    publishedAt: null,
    confidence: 80,
    ...overrides,
  };
}
