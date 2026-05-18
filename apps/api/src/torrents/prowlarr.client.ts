import { XMLParser } from "fast-xml-parser";
import type { NormalizedRelease } from "../releases/release.types";
import { OpenAiTorrentReranker } from "./openai-torrent-reranker";
import type { TorrentResult, TorrentSearchQuality } from "./torrent.types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type ProwlarrClientConfig = {
  baseUrl?: string;
  apiKey?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  openAiRerankEnabled?: boolean;
  fetchImpl?: FetchLike;
  openAiFetchImpl?: FetchLike;
};

type ProwlarrSearchResult = {
  title?: string;
  indexer?: string;
  indexerId?: number;
  magnetUrl?: string | null;
  downloadUrl?: string | null;
  infoHash?: string | null;
  size?: number | string | null;
  seeders?: number | string | null;
  leechers?: number | string | null;
  publishDate?: string | null;
  protocol?: string | null;
};

export type ProwlarrSearchResponse = {
  results: TorrentResult[];
  warning: string | null;
};

export class ProwlarrClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: FetchLike;
  private readonly reranker: OpenAiTorrentReranker;

  constructor(config: ProwlarrClientConfig = {}) {
    this.baseUrl = (config.baseUrl || "http://prowlarr:9696").replace(/\/$/, "");
    this.apiKey = config.apiKey || undefined;
    this.fetchImpl = config.fetchImpl || fetch;
    this.reranker = new OpenAiTorrentReranker({
      apiKey: config.openAiApiKey,
      model: config.openAiModel,
      enabled: config.openAiRerankEnabled,
      fetchImpl: config.openAiFetchImpl,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async searchRelease(
    release: NormalizedRelease,
    quality: TorrentSearchQuality,
  ): Promise<ProwlarrSearchResponse> {
    if (!this.isConfigured()) return { results: [], warning: "Prowlarr is not configured." };

    const enabledIndexers = await this.getEnabledIndexerCount();
    if (enabledIndexers === 0) {
      return {
        results: [],
        warning: "Prowlarr is configured but has no enabled indexers.",
      };
    }

    const url = new URL("/api/v1/search", this.baseUrl);
    url.searchParams.set("query", buildSearchQuery(release, quality));
    url.searchParams.set("type", "search");
    url.searchParams.set("apikey", this.apiKey || "");

    const response = await this.fetchImpl(url.toString(), {
      headers: { "X-Api-Key": this.apiKey || "" },
    });
    const raw = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(`Prowlarr search failed with HTTP ${response.status}.`);
    }

    const releaseYear = getReleaseYear(release);
    const rawResults = Array.isArray(raw) ? raw : [];
    const results = normalizeProwlarrResults(rawResults, {
      expectedQuality: quality,
      releaseTitle: release.title,
      mediaType: release.mediaType,
      releaseYear,
      includeReviewCandidates: this.reranker.isConfigured(),
    });

    const reranked = await this.reranker.rerank({
      release: {
        title: release.title,
        mediaType: release.mediaType,
        releaseYear,
        seasonNumber: release.seasonNumber,
        imdbId: release.imdbId,
        tmdbId: release.tmdbId,
      },
      torrents: results,
    });

    return reranked;
  }

  async resolveMagnetForRelease(release: NormalizedRelease, magnetLink: string): Promise<string> {
    if (!this.isConfigured() || magnetLink.includes("&tr=")) return magnetLink;

    const selectedHash = torrentHash(magnetLink);
    if (!selectedHash) return magnetLink;

    const url = new URL("/api/v1/search", this.baseUrl);
    url.searchParams.set("query", buildSearchQuery(release, "any"));
    url.searchParams.set("type", "search");
    url.searchParams.set("apikey", this.apiKey || "");

    try {
      const response = await this.fetchImpl(url.toString(), {
        headers: { "X-Api-Key": this.apiKey || "" },
      });
      const raw = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(raw)) return magnetLink;

      const match = raw.find((result) => torrentHash(result.infoHash) === selectedHash);
      const proxyUrl = match
        ? prowlarrProxyDownloadUrl(match.magnetUrl, this.baseUrl) ||
          prowlarrProxyDownloadUrl(match.downloadUrl, this.baseUrl)
        : null;
      if (!proxyUrl) return magnetLink;

      const resolved = await this.resolveProxyMagnet(proxyUrl);
      return resolved && torrentHash(resolved) === selectedHash ? resolved : magnetLink;
    } catch {
      return magnetLink;
    }
  }

  private async getEnabledIndexerCount(): Promise<number> {
    const url = new URL("/api/v1/indexer", this.baseUrl);
    url.searchParams.set("apikey", this.apiKey || "");
    const response = await this.fetchImpl(url.toString(), {
      headers: { "X-Api-Key": this.apiKey || "" },
    });
    if (!response.ok) {
      throw new Error(`Prowlarr indexer lookup failed with HTTP ${response.status}.`);
    }
    const raw = await response.json().catch(() => []);
    if (!Array.isArray(raw)) return 0;
    return raw.filter((indexer) => indexer?.enable !== false).length;
  }

  private async resolveProxyMagnet(proxyUrl: string): Promise<string | null> {
    const response = await this.fetchImpl(proxyUrl, {
      redirect: "manual",
      headers: { "X-Api-Key": this.apiKey || "" },
    });
    return extractMagnet(response.headers.get("location"));
  }
}

export function normalizeProwlarrResults(
  rawResults: ProwlarrSearchResult[],
  options: {
    expectedQuality: TorrentSearchQuality;
    releaseTitle: string;
    mediaType?: "movie" | "tv";
    releaseYear?: number | null;
    includeReviewCandidates?: boolean;
  },
): TorrentResult[] {
  return rawResults
    .map((result) => normalizeProwlarrResult(result, options))
    .filter((result): result is TorrentResult => Boolean(result))
    .filter((result) => options.expectedQuality === "any" || result.quality === options.expectedQuality)
    .sort(compareTorrentResults);
}

export function parseTorznabXml(xml: string): TorrentResult[] {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  }).parse(xml);
  const items = toArray(parsed?.rss?.channel?.item);

  return items
    .map((item) => {
      const attrs = toArray(item["torznab:attr"]);
      const attrValue = (name: string) =>
        attrs.find((attr) => attr.name === name)?.value ?? null;
      const seeders = toNumber(attrValue("seeders")) ?? 0;
      const peers = toNumber(attrValue("peers"));
      const title = String(item.title || "");
      const magnetLink = extractMagnet(item.guid) || extractMagnet(item.link);
      if (!title || !magnetLink) return null;

      return {
        id: torrentId(magnetLink, title),
        title,
        indexer: "Torznab",
        magnetLink,
        sizeBytes: toNumber(attrValue("size")),
        seeders,
        leechers: Math.max((peers ?? seeders) - seeders, 0),
        quality: detectQuality(title),
        publishedAt: item.pubDate || null,
        confidence: scoreTorrent(title, seeders, "any", ""),
      } satisfies TorrentResult;
    })
    .filter((result): result is TorrentResult => Boolean(result))
    .sort(compareTorrentResults);
}

function normalizeProwlarrResult(
  result: ProwlarrSearchResult,
  options: {
    expectedQuality: TorrentSearchQuality;
    releaseTitle: string;
    mediaType?: "movie" | "tv";
    releaseYear?: number | null;
    includeReviewCandidates?: boolean;
  },
): TorrentResult | null {
  const title = result.title || "";
  const magnetLink =
    extractMagnet(result.magnetUrl) ||
    extractMagnet(result.downloadUrl) ||
    magnetFromInfoHash(result.infoHash, title);
  if (!title || !magnetLink) return null;

  const seeders = toNumber(result.seeders) ?? 0;
  const match = scoreReleaseMatch(title, options);
  if (match.decision === "reject" || (match.decision === "review" && !options.includeReviewCandidates)) {
    return null;
  }

  return {
    id: torrentId(magnetLink, title),
    title,
    indexer: result.indexer || (result.indexerId ? `Indexer ${result.indexerId}` : "Prowlarr"),
    magnetLink,
    sizeBytes: toNumber(result.size),
    seeders,
    leechers: toNumber(result.leechers) ?? 0,
    quality: detectQuality(title),
    publishedAt: result.publishDate || null,
    confidence: scoreTorrent(title, seeders, options.expectedQuality, options.releaseTitle, match.score),
  };
}

function buildSearchQuery(release: NormalizedRelease, quality: TorrentSearchQuality): string {
  const parts = [release.title];
  const year = getReleaseYear(release);
  if (release.mediaType === "movie" && year) {
    parts.push(String(year));
  }
  if (release.mediaType === "tv" && release.seasonNumber) {
    parts.push(`S${String(release.seasonNumber).padStart(2, "0")}`);
  }
  if (quality !== "any") parts.push(quality);
  return parts.join(" ");
}

function detectQuality(title: string): TorrentResult["quality"] {
  if (/\b(2160p|4k|uhd)\b/i.test(title)) return "2160p";
  if (/\b1080p\b/i.test(title)) return "1080p";
  if (/\b720p\b/i.test(title)) return "720p";
  if (/\b480p\b/i.test(title)) return "480p";
  return "unknown";
}

function scoreTorrent(
  title: string,
  seeders: number,
  expectedQuality: TorrentSearchQuality,
  releaseTitle: string,
  matchScore = 0,
): number {
  let score = matchScore;
  score += Math.min(seeders, 200) / 10;
  if (releaseTitle && normalize(title).includes(normalize(releaseTitle))) score += 50;
  if (expectedQuality !== "any" && detectQuality(title) === expectedQuality) score += 25;
  return Math.round(score);
}

function compareTorrentResults(a: TorrentResult, b: TorrentResult): number {
  return (
    b.confidence - a.confidence ||
    b.seeders - a.seeders ||
    qualityRank(b.quality) - qualityRank(a.quality) ||
    (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0) ||
    a.title.localeCompare(b.title)
  );
}

function qualityRank(quality: TorrentResult["quality"]): number {
  return { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, unknown: 0 }[quality];
}

function extractMagnet(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const decoded = value.trim();
  return decoded.startsWith("magnet:") ? decoded : null;
}

function prowlarrProxyDownloadUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin) return null;
    return /^\/\d+\/download(?:$|[?&/])/.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function magnetFromInfoHash(infoHash: unknown, title: string): string | null {
  if (typeof infoHash !== "string") return null;
  const hash = infoHash.trim();
  if (!/^[a-f0-9]{32,40}$/i.test(hash)) return null;

  const displayName = title ? `&dn=${encodeURIComponent(title)}` : "";
  return `magnet:?xt=urn:btih:${hash}${displayName}`;
}

function torrentId(magnetLink: string, title: string): string {
  const match = magnetLink.match(/btih:([^&]+)/i);
  return (match?.[1] || title).toLowerCase();
}

function torrentHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:btih:)?([a-f0-9]{32,40})/i);
  return match?.[1]?.toLowerCase() || null;
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getReleaseYear(release: Pick<NormalizedRelease, "primaryReleaseDate" | "releaseDate">): number | null {
  const date = release.primaryReleaseDate || release.releaseDate;
  const year = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isInteger(year) && year > 1900 ? year : null;
}

function scoreReleaseMatch(
  torrentTitle: string,
  options: {
    releaseTitle: string;
    mediaType?: "movie" | "tv";
    releaseYear?: number | null;
  },
): { decision: "accept" | "review" | "reject"; score: number } {
  const releaseTokens = titleTokens(options.releaseTitle);
  const torrentTokens = titleTokens(torrentTitle);
  if (releaseTokens.length === 0 || torrentTokens.length === 0) {
    return { decision: "reject", score: 0 };
  }

  if (options.mediaType === "movie" && looksEpisodic(torrentTitle)) {
    return { decision: "reject", score: 0 };
  }

  const torrentYears = extractYears(torrentTitle);
  if (options.releaseYear && torrentYears.length > 0 && !torrentYears.includes(options.releaseYear)) {
    return { decision: "reject", score: 0 };
  }

  const prefixTokens = likelyTitlePrefixTokens(torrentTitle);
  const exactPrefix = startsWithTokens(prefixTokens, releaseTokens);
  const exactTitle = containsTokenSequence(torrentTokens, releaseTokens);

  if (exactPrefix && (releaseTokens.length > 1 || prefixTokens.length === releaseTokens.length || torrentYears.includes(options.releaseYear || 0))) {
    if (releaseTokens.length === 1 && options.mediaType === "movie" && prefixTokens.length > releaseTokens.length + 1) {
      return { decision: "review", score: 40 };
    }
    return { decision: "accept", score: options.releaseYear && torrentYears.includes(options.releaseYear) ? 95 : 85 };
  }

  if (exactTitle) {
    return { decision: "review", score: 40 };
  }

  return { decision: "reject", score: 0 };
}

function looksEpisodic(title: string): boolean {
  return /\bs\d{1,2}\s*e\d{1,3}\b/i.test(title) ||
    /\bs\d{1,2}\b/i.test(title) ||
    /\be\d{2,3}\b/i.test(title) ||
    /\b(season|episode|episodes|complete|batch)\b/i.test(title);
}

function likelyTitlePrefixTokens(title: string): string[] {
  const beforeTechnicalMarkers = title
    .replace(/^\[[^\]]+\]\s*/, "")
    .split(/\b(?:19\d{2}|20\d{2}|2160p|1080p|720p|480p|s\d{1,2}e\d{1,3}|s\d{1,2}|web[-.\s]?dl|webrip|bluray|brrip|hdtv)\b/i)[0] || title;
  return titleTokens(beforeTechnicalMarkers);
}

function titleTokens(title: string): string[] {
  const normalized = normalize(title);
  const tokens = normalized.split(" ").filter(Boolean);
  return stripLeadingArticle(tokens);
}

function stripLeadingArticle(tokens: string[]): string[] {
  if (["the", "a", "an"].includes(tokens[0] || "")) return tokens.slice(1);
  return tokens;
}

function startsWithTokens(tokens: string[], expected: string[]): boolean {
  return expected.every((token, index) => tokens[index] === token);
}

function containsTokenSequence(tokens: string[], expected: string[]): boolean {
  return tokens.some((_, index) => expected.every((token, offset) => tokens[index + offset] === token));
}

function extractYears(title: string): number[] {
  return [...title.matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => Number.isInteger(year));
}
