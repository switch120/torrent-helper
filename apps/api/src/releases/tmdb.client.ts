import type { NormalizedRelease } from "./release.types";
import { hasDubbedCue, isInternationalLanguage, normalizeOriginalLanguage } from "./release-language";
import type {
  TmdbMovieDetailResponse,
  TmdbNetwork,
  TmdbSeasonDetailResponse,
  TmdbSeasonSummary,
  TmdbTvDetailResponse,
} from "./tmdb-detail.mapper";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type TmdbDigitalReleaseResult = {
  releases: NormalizedRelease[];
  raw: unknown;
};

export type TmdbTvAiringResult = {
  releases: NormalizedRelease[];
  raw: unknown;
};

export type TmdbTvProviderGroup = {
  sourceId: number;
  sourceName: string;
  providerIds: number[];
};

type TmdbClientConfig = {
  apiKey?: string;
  readAccessToken?: string;
  baseUrl?: string;
  imageBaseUrl?: string;
  fetchImpl?: FetchLike;
  maxPages?: number;
  maxTvPages?: number;
  maxConcurrentRequests?: number;
  tvProviderGroups?: TmdbTvProviderGroup[];
};

type TmdbDiscoverResponse = {
  page?: number;
  total_pages?: number;
  results?: TmdbMovieSummary[];
};

type TmdbTvDiscoverResponse = {
  page?: number;
  total_pages?: number;
  results?: TmdbTvSummary[];
};

type TmdbMovieSummary = {
  id: number;
  title: string;
  original_title?: string | null;
  overview?: string | null;
  original_language?: string | null;
  poster_path?: string | null;
  release_date?: string | null;
  popularity?: number | null;
  vote_average?: number | null;
  vote_count?: number | null;
};

type TmdbTvSummary = {
  id: number;
  name?: string | null;
  original_name?: string | null;
  overview?: string | null;
  original_language?: string | null;
  poster_path?: string | null;
  first_air_date?: string | null;
  popularity?: number | null;
  vote_average?: number | null;
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

type TmdbPersonExternalIdsResponse = {
  id?: number;
  imdb_id?: string | null;
};

type DigitalMovie = {
  movie: TmdbMovieSummary;
  releaseDate: string;
  rawReleaseDates: TmdbReleaseDatesResponse;
};

type TvEpisodeAiring = {
  show: TmdbTvSummary;
  detail: TmdbTvDetailResponse;
  season: TmdbSeasonDetailResponse;
  episode: NonNullable<TmdbSeasonDetailResponse["episodes"]>[number];
  provider: TmdbTvProviderGroup;
};

type TvShowDiscovery = {
  show: TmdbTvSummary;
  provider: TmdbTvProviderGroup;
};

const digitalReleaseType = 4;
const featuredReleaseWindowDays = 548;
const featuredVoteThreshold = 25;
const featuredPopularityThreshold = 20;
const defaultTvProviderGroups: TmdbTvProviderGroup[] = [
  { sourceId: 350, sourceName: "Apple TV+", providerIds: [350] },
  { sourceId: 8, sourceName: "Netflix", providerIds: [8] },
  { sourceId: 15, sourceName: "Hulu", providerIds: [15] },
  { sourceId: 1899, sourceName: "MAX", providerIds: [1899, 1825] },
  { sourceId: 9, sourceName: "Prime Video", providerIds: [9] },
  { sourceId: 337, sourceName: "Disney+", providerIds: [337] },
  { sourceId: 2303, sourceName: "Paramount Plus", providerIds: [2303, 2616, 582, 633] },
  { sourceId: 386, sourceName: "Peacock", providerIds: [386, 387] },
  { sourceId: 207, sourceName: "The Roku Channel", providerIds: [207] },
  { sourceId: 123, sourceName: "FX", providerIds: [123] },
];

export class TmdbClient {
  private readonly apiKey?: string;
  private readonly readAccessToken?: string;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxPages: number;
  private readonly maxTvPages: number;
  private readonly maxConcurrentRequests: number;
  private readonly tvProviderGroups: TmdbTvProviderGroup[];

  constructor(config: TmdbClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.readAccessToken = config.readAccessToken;
    this.baseUrl = config.baseUrl || "https://api.themoviedb.org";
    this.imageBaseUrl = config.imageBaseUrl || "https://image.tmdb.org/t/p/w342";
    this.fetchImpl = config.fetchImpl || fetch;
    this.maxPages = config.maxPages || 5;
    this.maxTvPages = config.maxTvPages || 3;
    this.maxConcurrentRequests = config.maxConcurrentRequests || 6;
    this.tvProviderGroups = config.tvProviderGroups || defaultTvProviderGroups;
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

  async getTvAirings(input: {
    weekStart: string;
    weekEnd: string;
  }): Promise<TmdbTvAiringResult> {
    if (!this.isConfigured()) {
      return { releases: [], raw: { disabled: true } };
    }

    const rawDiscover: Array<{ provider: TmdbTvProviderGroup; pages: TmdbTvDiscoverResponse[] }> = [];
    const airings: TvEpisodeAiring[] = [];

    const discoverResults = await mapWithConcurrency(
      this.tvProviderGroups,
      this.maxConcurrentRequests,
      async (provider) => {
        const pages = await this.fetchTvDiscoverPages(input, provider);
        return { provider, pages };
      },
    );
    rawDiscover.push(...discoverResults);

    const discoveredShows = uniqueTvShowDiscoveries(
      discoverResults.flatMap(({ provider, pages }) =>
        uniqueTvShows(pages.flatMap((page) => page.results || [])).map((show) => ({ show, provider })),
      ),
    );
    const airingGroups = await mapWithConcurrency(
      discoveredShows,
      this.maxConcurrentRequests,
      (discovery) => this.getTvShowAirings(input, discovery),
    );
    airings.push(...airingGroups.flat());

    const releases = uniqueTvAirings(airings).map((item) => this.normalizeTvAiring(item));

    return {
      releases,
      raw: {
        discover: rawDiscover,
        airings: airings.map((item) => ({
          show: item.show,
          provider: item.provider,
          episode: item.episode,
        })),
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

  private async fetchTvDiscoverPages(
    input: { weekStart: string; weekEnd: string },
    provider: TmdbTvProviderGroup,
  ): Promise<TmdbTvDiscoverResponse[]> {
    const firstPage = await this.fetchTvDiscoverPage(input, provider, 1);
    const pages = [firstPage];
    const totalPages = Math.min(firstPage.total_pages || 1, this.maxTvPages);

    for (let page = 2; page <= totalPages; page += 1) {
      pages.push(await this.fetchTvDiscoverPage(input, provider, page));
    }

    return pages;
  }

  private fetchTvDiscoverPage(
    input: { weekStart: string; weekEnd: string },
    provider: TmdbTvProviderGroup,
    page: number,
  ): Promise<TmdbTvDiscoverResponse> {
    const url = this.url("/3/discover/tv");
    url.searchParams.set("air_date.gte", input.weekStart);
    url.searchParams.set("air_date.lte", input.weekEnd);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("language", "en-US");
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort_by", "popularity.desc");
    url.searchParams.set("timezone", "America/New_York");
    url.searchParams.set("watch_region", "US");
    url.searchParams.set("with_watch_monetization_types", "flatrate|free|ads");
    url.searchParams.set("with_watch_providers", provider.providerIds.join("|"));

    return this.fetchJson<TmdbTvDiscoverResponse>(url);
  }

  private async getTvShowAirings(
    input: { weekStart: string; weekEnd: string },
    discovery: TvShowDiscovery,
  ): Promise<TvEpisodeAiring[]> {
    const detail = await this.getTvDetail(discovery.show.id);
    const seasonSummaries = selectPotentialAiringSeasons(detail.seasons, input.weekStart, input.weekEnd);
    const seasons = await mapWithConcurrency(
      seasonSummaries,
      this.maxConcurrentRequests,
      async (seasonSummary) => {
        const seasonNumber = seasonSummary.season_number;
        if (!seasonNumber || seasonNumber <= 0) return null;
        return this.getTvSeasonDetail(discovery.show.id, seasonNumber);
      },
    );

    return seasons
      .filter((season): season is TmdbSeasonDetailResponse => Boolean(season))
      .flatMap((season) =>
        (season.episodes || [])
          .filter(
            (episode) =>
              Boolean(episode.air_date) &&
              episode.air_date! >= input.weekStart &&
              episode.air_date! <= input.weekEnd,
          )
          .map((episode) => ({
            show: discovery.show,
            detail,
            season,
            episode,
            provider: discovery.provider,
          })),
      );
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

  getMovieDetail(movieId: number): Promise<TmdbMovieDetailResponse> {
    const url = this.url(`/3/movie/${movieId}`);
    url.searchParams.set("append_to_response", "credits,images,external_ids,release_dates");
    url.searchParams.set("language", "en-US");
    return this.fetchJson<TmdbMovieDetailResponse>(url);
  }

  getTvDetail(seriesId: number): Promise<TmdbTvDetailResponse> {
    const url = this.url(`/3/tv/${seriesId}`);
    url.searchParams.set("append_to_response", "aggregate_credits,images,external_ids");
    url.searchParams.set("language", "en-US");
    return this.fetchJson<TmdbTvDetailResponse>(url);
  }

  getTvSeasonDetail(seriesId: number, seasonNumber: number): Promise<TmdbSeasonDetailResponse> {
    const url = this.url(`/3/tv/${seriesId}/season/${seasonNumber}`);
    url.searchParams.set("append_to_response", "aggregate_credits,images");
    url.searchParams.set("language", "en-US");
    return this.fetchJson<TmdbSeasonDetailResponse>(url);
  }

  getPersonExternalIds(personId: number): Promise<TmdbPersonExternalIdsResponse> {
    return this.fetchJson<TmdbPersonExternalIdsResponse>(this.url(`/3/person/${personId}/external_ids`));
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
    const originalLanguage = normalizeOriginalLanguage(item.movie.original_language);

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
      voteAverage: item.movie.vote_average ?? null,
      voteCount: item.movie.vote_count ?? null,
      isFeaturedDigital: isFeaturedDigitalMovie(
        primaryReleaseDate,
        item.movie.popularity ?? null,
        item.movie.vote_count ?? null,
        item.releaseDate,
      ),
      originalLanguage,
      isInternational: isInternationalLanguage(originalLanguage),
      isDubbed: hasDubbedCue(item.movie.title, item.movie.original_title, item.movie.overview),
    };
  }

  private normalizeTvAiring(item: TvEpisodeAiring): NormalizedRelease {
    const posterUrl = item.show.poster_path || item.detail.poster_path
      ? `${this.imageBaseUrl}${item.show.poster_path || item.detail.poster_path}`
      : null;
    const releaseDate = item.episode.air_date || item.detail.last_air_date || item.show.first_air_date || "";
    const seasonNumber = item.episode.season_number ?? item.season.season_number ?? null;
    const episodeNumber = item.episode.episode_number ?? null;
    const source = tvSourceFromNetworks(item.detail.networks);
    const originalLanguage = normalizeOriginalLanguage(item.detail.original_language || item.show.original_language);

    return {
      eventId: [
        "tmdb",
        "tv",
        item.show.id,
        releaseDate,
        seasonNumber ?? "none",
        episodeNumber ?? "none",
      ].join(":"),
      watchmodeId: item.show.id,
      releaseSource: "tmdb",
      releaseKind: "streaming",
      title: item.show.name || item.show.original_name || item.detail.name || item.detail.original_name || `TMDB ${item.show.id}`,
      titleType: "tv_series",
      mediaType: "tv",
      tmdbId: item.show.id,
      tmdbType: "tv",
      imdbId: item.detail.external_ids?.imdb_id || null,
      posterUrl,
      releaseDate,
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      seasonNumber,
      episodeNumber,
      episodeName: item.episode.name || null,
      isOriginal: false,
      primaryReleaseDate: item.detail.first_air_date || item.show.first_air_date || releaseDate,
      popularity: item.show.popularity ?? null,
      voteAverage: item.show.vote_average ?? null,
      voteCount: item.show.vote_count ?? null,
      originalLanguage,
      isInternational: isInternationalLanguage(originalLanguage),
      isDubbed: hasDubbedCue(
        item.show.name,
        item.show.original_name,
        item.show.overview,
        item.detail.name,
        item.detail.original_name,
        item.detail.overview,
        item.episode.name,
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

function uniqueTvShows(shows: TmdbTvSummary[]): TmdbTvSummary[] {
  const byId = new Map<number, TmdbTvSummary>();
  for (const show of shows) {
    byId.set(show.id, show);
  }
  return [...byId.values()];
}

function uniqueTvShowDiscoveries(discoveries: TvShowDiscovery[]): TvShowDiscovery[] {
  const byId = new Map<number, TvShowDiscovery>();
  for (const discovery of discoveries) {
    if (!byId.has(discovery.show.id)) byId.set(discovery.show.id, discovery);
  }
  return [...byId.values()];
}

function uniqueTvAirings(airings: TvEpisodeAiring[]): TvEpisodeAiring[] {
  const byKey = new Map<string, TvEpisodeAiring>();
  for (const airing of airings) {
    const seasonNumber = airing.episode.season_number ?? airing.season.season_number ?? "none";
    const episodeNumber = airing.episode.episode_number ?? "none";
    byKey.set(
      [
        airing.show.id,
        airing.episode.air_date || "unknown",
        seasonNumber,
        episodeNumber,
      ].join(":"),
      airing,
    );
  }
  return [...byKey.values()];
}

function tvSourceFromNetworks(networks: TmdbNetwork[] = []): {
  sourceId: number;
  sourceName: string;
  sourceType: "unknown";
} {
  const primaryNetwork = networks.find((network) => network.name?.trim());
  return {
    sourceId: primaryNetwork?.id || 0,
    sourceName: primaryNetwork?.name?.trim() || "TV airing",
    sourceType: "unknown",
  };
}

function selectPotentialAiringSeasons(
  seasons: TmdbSeasonSummary[] = [],
  weekStart: string,
  weekEnd: string,
): TmdbSeasonSummary[] {
  const selected = seasons.filter((season) => {
    if (!season.season_number || season.season_number <= 0) return false;
    if (!season.air_date) return true;
    return season.air_date <= weekEnd;
  });

  if (selected.length <= 3) return selected;

  return selected
    .sort((a, b) => (b.season_number ?? 0) - (a.season_number ?? 0))
    .slice(0, 3)
    .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0));
}

async function mapWithConcurrency<Input, Output>(
  items: Input[],
  limit: number,
  mapper: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (items.length === 0) return [];

  const concurrency = Math.max(1, Math.min(items.length, Math.floor(limit)));
  const results = new Array<Output>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
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
