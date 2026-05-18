import type { TorrentResult } from "./torrent.types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type TorrentRerankRelease = {
  title: string;
  mediaType: "movie" | "tv";
  releaseYear?: number | null;
  seasonNumber?: number | null;
  imdbId?: string | null;
  tmdbId?: number | null;
};

export type TorrentRerankInput = {
  release: TorrentRerankRelease;
  torrents: TorrentResult[];
};

export type TorrentRerankResult = {
  results: TorrentResult[];
  warning: string | null;
};

type OpenAiTorrentRerankerConfig = {
  apiKey?: string;
  model?: string;
  enabled?: boolean;
  fetchImpl?: FetchLike;
};

type OpenAiMatch = {
  id: string;
  match: boolean;
  confidence: number;
  reason: string;
};

export class OpenAiTorrentReranker {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly enabled: boolean;
  private readonly fetchImpl: FetchLike;

  constructor(config: OpenAiTorrentRerankerConfig = {}) {
    this.apiKey = config.apiKey || undefined;
    this.model = config.model || "gpt-5.4-mini";
    this.enabled = config.enabled ?? Boolean(this.apiKey);
    this.fetchImpl = config.fetchImpl || fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.enabled && this.apiKey);
  }

  async rerank(input: TorrentRerankInput): Promise<TorrentRerankResult> {
    if (!this.isConfigured() || input.torrents.length === 0) {
      return { results: input.torrents, warning: null };
    }

    try {
      const candidates = input.torrents.slice(0, 60).map((torrent, index) => ({
        id: `c${index}`,
        title: torrent.title,
        indexer: torrent.indexer,
        quality: torrent.quality,
        sizeBytes: torrent.sizeBytes,
        seeders: torrent.seeders,
        leechers: torrent.leechers,
        publishedAt: torrent.publishedAt,
      }));
      const byCandidateId = new Map(candidates.map((candidate, index) => [candidate.id, input.torrents[index]]));

      const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            {
              role: "system",
              content:
                "You filter torrent search results for a personal media release browser. " +
                "Return only torrents that are specifically for the requested movie or TV release. " +
                "Reject different shows, different movies, anime with similar names, episode packs for a movie, and weak title-only coincidences.",
            },
            {
              role: "user",
              content: JSON.stringify({
                release: input.release,
                candidates,
              }),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "torrent_match_results",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["matches"],
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "match", "confidence", "reason"],
                      properties: {
                        id: { type: "string" },
                        match: { type: "boolean" },
                        confidence: { type: "number", minimum: 0, maximum: 1 },
                        reason: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI rerank failed with HTTP ${response.status}.`);
      }

      const raw = await response.json();
      const parsed = parseOpenAiMatches(raw);
      const matched = parsed.matches
        .filter((match) => match.match && match.confidence >= 0.7)
        .map((match) => {
          const torrent = byCandidateId.get(match.id);
          if (!torrent) return null;
          return {
            ...torrent,
            confidence: Math.round(match.confidence * 100),
          };
        })
        .filter((torrent): torrent is TorrentResult => Boolean(torrent));

      return { results: matched, warning: null };
    } catch {
      return {
        results: input.torrents,
        warning: "OpenAI torrent rerank failed; showing deterministic matches.",
      };
    }
  }
}

function parseOpenAiMatches(raw: unknown): { matches: OpenAiMatch[] } {
  const text = extractOutputText(raw);
  if (!text) return { matches: [] };

  const parsed = JSON.parse(text) as { matches?: OpenAiMatch[] };
  return {
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
  };
}

function extractOutputText(raw: unknown): string | null {
  if (isRecord(raw) && typeof raw.output_text === "string") return raw.output_text;
  if (!isRecord(raw) || !Array.isArray(raw.output)) return null;

  for (const item of raw.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
