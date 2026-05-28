export type DvdDigitalRelease = {
  sourceTitleId: number;
  title: string;
  releaseDate: string;
  detailUrl: string;
  posterUrl: string | null;
  imdbId: string | null;
  imdbRating: number | null;
  contentRating: string | null;
};

export type DvdDigitalReleaseResult = {
  releases: DvdDigitalRelease[];
  raw: {
    months: string[];
    pages: Array<{
      month: string;
      url: string;
      count: number;
    }>;
  };
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type DvdReleaseDatesClientConfig = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

const monthNames = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const datePattern = /<td[^>]*class=['"][^'"]*\breldate\b[^'"]*['"][^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g;
const movieCellPattern = /<td\s+class=['"]dvdcell['"][^>]*>/g;

export class DvdReleaseDatesClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: DvdReleaseDatesClientConfig = {}) {
    this.baseUrl = config.baseUrl || "https://www.dvdsreleasedates.com";
    this.fetchImpl = config.fetchImpl || fetch;
  }

  async getDigitalMovieReleases(input: {
    weekStart: string;
    weekEnd: string;
  }): Promise<DvdDigitalReleaseResult> {
    const months = monthKeysInWindow(input.weekStart, input.weekEnd);
    const pages: DvdDigitalReleaseResult["raw"]["pages"] = [];
    const releases: DvdDigitalRelease[] = [];

    for (const month of months) {
      const url = this.monthUrl(month);
      const html = await this.fetchHtml(url);
      const monthReleases = parseDigitalReleasePage(html, this.baseUrl)
        .filter((release) => release.releaseDate >= input.weekStart && release.releaseDate <= input.weekEnd);
      pages.push({ month, url, count: monthReleases.length });
      releases.push(...monthReleases);
    }

    return {
      releases: uniqueDvdReleases(releases),
      raw: { months, pages },
    };
  }

  private monthUrl(month: string): string {
    const [year, monthValue] = month.split("-");
    const monthNumber = Number(monthValue);
    const monthName = monthNames[monthNumber - 1];
    return new URL(
      `/digital-releases/${year}/${monthNumber}/digital-hd-releases-${monthName}-${year}`,
      this.baseUrl,
    ).toString();
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await this.fetchImpl(url, {
      headers: { "User-Agent": "torrent-helper/1.0" },
    });
    if (!response.ok) {
      throw new Error(`DVDsReleaseDates ${response.status}: ${response.statusText || "request failed"}`);
    }
    return response.text();
  }
}

function parseDigitalReleasePage(html: string, baseUrl: string): DvdDigitalRelease[] {
  const dateMatches = [...html.matchAll(datePattern)];
  const releases: DvdDigitalRelease[] = [];

  for (let index = 0; index < dateMatches.length; index += 1) {
    const dateMatch = dateMatches[index];
    const releaseDate = parseReleaseDate(dateMatch[1]);
    if (!releaseDate || dateMatch.index === undefined) continue;

    const groupStart = dateMatch.index + dateMatch[0].length;
    const nextDateIndex = dateMatches[index + 1]?.index ?? html.length;
    const groupHtml = html.slice(groupStart, nextDateIndex);
    releases.push(...parseMovieCells(groupHtml, releaseDate, baseUrl));
  }

  return releases;
}

function parseMovieCells(groupHtml: string, releaseDate: string, baseUrl: string): DvdDigitalRelease[] {
  const cellMatches = [...groupHtml.matchAll(movieCellPattern)];
  const releases: DvdDigitalRelease[] = [];

  for (let index = 0; index < cellMatches.length; index += 1) {
    const cellMatch = cellMatches[index];
    if (cellMatch.index === undefined) continue;
    const cellStart = cellMatch.index + cellMatch[0].length;
    const nextCellIndex = cellMatches[index + 1]?.index ?? groupHtml.length;
    const cellHtml = groupHtml.slice(cellStart, nextCellIndex);
    const release = parseMovieCell(cellHtml, releaseDate, baseUrl);
    if (release) releases.push(release);
  }

  return releases;
}

function parseMovieCell(cellHtml: string, releaseDate: string, baseUrl: string): DvdDigitalRelease | null {
  const titleMatch = [...cellHtml.matchAll(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/g)]
    .find((match) => match[1].startsWith("/movies/") && !match[2].includes("<img"));
  if (!titleMatch) return null;

  const sourceTitleId = Number(titleMatch[1].match(/\/movies\/(\d+)\//)?.[1]);
  if (!Number.isFinite(sourceTitleId)) return null;

  const posterPath = cellHtml.match(/<img[^>]+class=['"][^'"]*\bmovieimg\b[^'"]*['"][^>]+src=['"]([^'"]+)['"]/)
    ?.[1] ?? null;
  const imdbMatch = cellHtml.match(/imdb:\s*<a[^>]+title\/(tt\d+)\/[^>]*>([^<]+)<\/a>/);
  const ratingMatch = cellHtml.match(/<td[^>]+class=['"][^'"]*\bimdblink\b[^'"]*\bright\b[^'"]*['"][^>]*>([\s\S]*?)<\/td>/);

  return {
    sourceTitleId,
    title: cleanText(titleMatch[2]),
    releaseDate,
    detailUrl: absoluteUrl(titleMatch[1], baseUrl),
    posterUrl: posterPath ? absoluteUrl(posterPath, baseUrl) : null,
    imdbId: imdbMatch?.[1] ?? null,
    imdbRating: parseRating(imdbMatch?.[2]),
    contentRating: ratingMatch ? cleanText(ratingMatch[1]) || null : null,
  };
}

function parseReleaseDate(value: string): string | null {
  const text = cleanText(value);
  const match = text.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return null;

  const monthIndex = monthNames.findIndex((month) => month === match[1].toLowerCase());
  if (monthIndex < 0) return null;

  return [
    match[3],
    String(monthIndex + 1).padStart(2, "0"),
    String(Number(match[2])).padStart(2, "0"),
  ].join("-");
}

function monthKeysInWindow(weekStart: string, weekEnd: string): string[] {
  const start = parseDateOnly(weekStart);
  const end = parseDateOnly(weekEnd);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const months: string[] = [];

  while (cursor.getTime() <= endMonth.getTime()) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function absoluteUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}

function parseRating(value: string | undefined): number | null {
  if (!value || value === "NA") return null;
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : null;
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function uniqueDvdReleases(releases: DvdDigitalRelease[]): DvdDigitalRelease[] {
  const byKey = new Map<string, DvdDigitalRelease>();
  for (const release of releases) {
    byKey.set(`${release.sourceTitleId}:${release.releaseDate}`, release);
  }
  return [...byKey.values()];
}
