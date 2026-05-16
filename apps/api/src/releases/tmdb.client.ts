import type { NormalizedRelease } from "./release.types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type TmdbDigitalReleaseResult = {
  releases: NormalizedRelease[];
  raw: unknown;
};

type TmdbClientConfig = {
  apiKey?: string;
  readAccessToken?: string;
  baseUrl?: string;
  imageBaseUrl?: string;
  fetchImpl?: FetchLike;
  maxPages?: number;
};

type TmdbDiscoverResponse = {
  page?: number;
  total_pages?: number;
  results?: TmdbMovieSummary[];
};

type TmdbMovieSummary = {
  id: number;
  title: string;
  original_title?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  release_date?: string | null;
  popularity?: number | null;
  vote_count?: number | null;
};

type TmdbReleaseDatesResponse = {
  id: number;
  results?: Array<{
    iso_3166_1: string;
    release_dates?: Array<{
      release_date: string;
      type: number;
    }>;
  }>;
};

type DigitalMovie = {
  movie: TmdbMovieSummary;
  releaseDate: string;
  rawReleaseDates: TmdbReleaseDatesResponse;
};

const digitalReleaseType = 4;
const featuredReleaseWindowDays = 548;
const featuredVoteThreshold = 25;
const featuredPopularityThreshold = 20;

export class TmdbClient {
  private readonly apiKey?: string;
  private readonly readAccessToken?: string;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxPages: number;

  constructor(config: TmdbClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.readAccessToken = config.readAccessToken;
    this.baseUrl = config.baseUrl || "https://api.themoviedb.org";
    this.imageBaseUrl = config.imageBaseUrl || "https://image.tmdb.org/t/p/w342";
    this.fetchImpl = config.fetchImpl || fetch;
    this.maxPages = config.maxPages || 5;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey || this.readAccessToken);
  }

  async getDigitalMovieReleases(input: {
    weekStart: string;
    weekEnd: string;
  }): Promise<TmdbDigitalReleaseResult> {
    if (!this.isConfigured()) {
      return { releases: [], raw: { disabled: true } };
    }

    const discoverPages = await this.fetchDiscoverPages(input);
    const movies = uniqueMovies(discoverPages.flatMap((page) => page.results || []));
    const digitalMovies: DigitalMovie[] = [];

    for (const movie of movies) {
      const rawReleaseDates = await this.fetchReleaseDates(movie.id);
      const releaseDate = findDigitalReleaseDate(rawReleaseDates, input.weekStart, input.weekEnd);
      if (!releaseDate) continue;

      digitalMovies.push({ movie, releaseDate, rawReleaseDates });
    }

    return {
      releases: digitalMovies.map((item) => this.normalizeDigitalMovie(item)),
      raw: {
        discover: discoverPages,
        releaseDates: digitalMovies.map((item) => item.rawReleaseDates),
      },
    };
  }

  private async fetchDiscoverPages(input: {
    weekStart: string;
    weekEnd: string;
  }): Promise<TmdbDiscoverResponse[]> {
    const firstPage = await this.fetchDiscoverPage(input, 1);
    const pages = [firstPage];
    const totalPages = Math.min(firstPage.total_pages || 1, this.maxPages);

    for (let page = 2; page <= totalPages; page += 1) {
      pages.push(await this.fetchDiscoverPage(input, page));
    }

    return pages;
  }

  private async fetchDiscoverPage(
    input: { weekStart: string; weekEnd: string },
    page: number,
  ): Promise<TmdbDiscoverResponse> {
    const url = this.url("/3/discover/movie");
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("include_video", "false");
    url.searchParams.set("language", "en-US");
    url.searchParams.set("page", String(page));
    url.searchParams.set("region", "US");
    url.searchParams.set("sort_by", "popularity.desc");
    url.searchParams.set("with_release_type", String(digitalReleaseType));
    url.searchParams.set("release_date.gte", input.weekStart);
    url.searchParams.set("release_date.lte", input.weekEnd);

    return this.fetchJson<TmdbDiscoverResponse>(url);
  }

  private fetchReleaseDates(movieId: number): Promise<TmdbReleaseDatesResponse> {
    return this.fetchJson<TmdbReleaseDatesResponse>(this.url(`/3/movie/${movieId}/release_dates`));
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    const response = await this.fetchImpl(url.toString(), this.requestInit());
    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      const statusMessage = response.statusText || "TMDB request failed";
      throw new Error(`TMDB ${response.status}: ${statusMessage}`);
    }

    return raw as T;
  }

  private url(path: string): URL {
    const url = new URL(path, this.baseUrl);
    if (this.apiKey) {
      url.searchParams.set("api_key", this.apiKey);
    }
    return url;
  }

  private requestInit(): RequestInit | undefined {
    if (!this.readAccessToken) return undefined;
    return {
      headers: {
        Authorization: `Bearer ${this.readAccessToken}`,
      },
    };
  }

  private normalizeDigitalMovie(item: DigitalMovie): NormalizedRelease {
    const posterUrl = item.movie.poster_path
      ? `${this.imageBaseUrl}${item.movie.poster_path}`
      : null;
    const primaryReleaseDate = findPrimaryReleaseDate(
      item.rawReleaseDates,
      item.movie.release_date || null,
      item.releaseDate,
    );

    return {
      eventId: `tmdb:digital:${item.movie.id}:${item.releaseDate}`,
      watchmodeId: item.movie.id,
      releaseSource: "tmdb",
      releaseKind: "digital",
      title: item.movie.title || item.movie.original_title || `TMDB ${item.movie.id}`,
      titleType: "movie",
      mediaType: "movie",
      tmdbId: item.movie.id,
      tmdbType: "movie",
      imdbId: null,
      posterUrl,
      releaseDate: item.releaseDate,
      sourceId: 0,
      sourceName: "Digital release",
      sourceType: "digital",
      seasonNumber: null,
      isOriginal: false,
      primaryReleaseDate,
      popularity: item.movie.popularity ?? null,
      voteCount: item.movie.vote_count ?? null,
      isFeaturedDigital: isFeaturedDigitalMovie(
        primaryReleaseDate,
        item.movie.popularity ?? null,
        item.movie.vote_count ?? null,
        item.releaseDate,
      ),
    };
  }
}

function uniqueMovies(movies: TmdbMovieSummary[]): TmdbMovieSummary[] {
  const byId = new Map<number, TmdbMovieSummary>();
  for (const movie of movies) {
    byId.set(movie.id, movie);
  }
  return [...byId.values()];
}

function findDigitalReleaseDate(
  response: TmdbReleaseDatesResponse,
  weekStart: string,
  weekEnd: string,
): string | null {
  const usReleaseDates =
    response.results?.find((result) => result.iso_3166_1 === "US")?.release_dates || [];

  const digitalDates = usReleaseDates
    .filter((releaseDate) => releaseDate.type === digitalReleaseType)
    .map((releaseDate) => releaseDate.release_date.slice(0, 10))
    .filter((releaseDate) => releaseDate >= weekStart && releaseDate <= weekEnd)
    .sort();

  return digitalDates[0] || null;
}

function findPrimaryReleaseDate(
  response: TmdbReleaseDatesResponse,
  fallbackReleaseDate: string | null,
  digitalReleaseDate: string,
): string {
  const datedReleases = (response.results || [])
    .flatMap((result) => result.release_dates || [])
    .map((releaseDate) => ({
      date: releaseDate.release_date.slice(0, 10),
      type: releaseDate.type,
    }))
    .filter((releaseDate) => releaseDate.date);

  const nonDigitalDates = datedReleases
    .filter((releaseDate) => releaseDate.type !== digitalReleaseType)
    .map((releaseDate) => releaseDate.date)
    .sort();

  if (nonDigitalDates[0]) return nonDigitalDates[0];

  return fallbackReleaseDate || digitalReleaseDate;
}

function isFeaturedDigitalMovie(
  primaryReleaseDateValue: string | null,
  popularity: number | null,
  voteCount: number | null,
  digitalReleaseDate: string,
): boolean {
  if (!primaryReleaseDateValue) return false;

  const primaryReleaseDate = Date.parse(`${primaryReleaseDateValue}T00:00:00.000Z`);
  const digitalDate = Date.parse(`${digitalReleaseDate}T00:00:00.000Z`);
  if (!Number.isFinite(primaryReleaseDate) || !Number.isFinite(digitalDate)) return false;
  if (primaryReleaseDate > digitalDate) return false;

  const ageDays = (digitalDate - primaryReleaseDate) / 86_400_000;
  const hasAudienceSignal =
    (voteCount ?? 0) >= featuredVoteThreshold ||
    (popularity ?? 0) >= featuredPopularityThreshold;

  return ageDays <= featuredReleaseWindowDays && hasAudienceSignal;
}
