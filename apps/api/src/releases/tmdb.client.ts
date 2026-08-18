import type { NormalizedRelease, ReleaseProviderSource } from "./release.types";
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
  networkIds?: number[];
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
  retryDelayMs?: number;
  maxRetries?: number;
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

type TmdbFindMovieResponse = {
  movie_results?: TmdbMovieSummary[];
};

export type TmdbMovieLookup = {
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  originalLanguage: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
};

type TmdbWatchProvider = {
  provider_id: number;
  provider_name: string;
};

type TmdbWatchProvidersResponse = {
  id: number;
  results?: {
    US?: {
      flatrate?: TmdbWatchProvider[];
      free?: TmdbWatchProvider[];
      ads?: TmdbWatchProvider[];
      rent?: TmdbWatchProvider[];
      buy?: TmdbWatchProvider[];
    };
  };
};

type DigitalMovie = {
  movie: TmdbMovieSummary;
  releaseDate: string;
  releaseDateSource: TmdbMovieReleaseDateSource;
  streamingProviders: ReleaseProviderSource[];
  rawReleaseDates: TmdbReleaseDatesResponse;
};

type MovieProviderAvailability = {
  streamingProviders: ReleaseProviderSource[];
};

type TmdbMovieReleaseDateSource = "digital";

type TmdbMovieReleaseDateMatch = {
  date: string;
  source: TmdbMovieReleaseDateSource;
};

type TvEpisodeAiring = {
  show: TmdbTvSummary;
  detail: TmdbTvDetailResponse;
  season: TmdbSeasonDetailResponse;
  episode: NonNullable<TmdbSeasonDetailResponse["episodes"]>[number];
  providers: TmdbTvProviderGroup[];
};

type TvShowDiscovery = {
  show: TmdbTvSummary;
  providers: TmdbTvProviderGroup[];
};

type TvDiscoveryStrategy = "provider" | "network";

const digitalReleaseType = 4;
const tmdbDigitalDatePolicy = "original-us-digital-only-v3";
const tmdbTvSourcingPolicy = "us-provider-network-v2";
const featuredReleaseWindowDays = 548;
const featuredVoteThreshold = 25;
const featuredPopularityThreshold = 20;
const defaultTvProviderGroups: TmdbTvProviderGroup[] = [
  { sourceId: 350, sourceName: "Apple TV+", providerIds: [350, 2243], networkIds: [2552] },
  { sourceId: 8, sourceName: "Netflix", providerIds: [8, 175, 1796], networkIds: [213] },
  { sourceId: 15, sourceName: "Hulu", providerIds: [15], networkIds: [453] },
  { sourceId: 1899, sourceName: "MAX", providerIds: [1899, 1825], networkIds: [49, 3186, 6783, 8304] },
  { sourceId: 9, sourceName: "Prime Video", providerIds: [9, 613, 2100], networkIds: [1024] },
  { sourceId: 337, sourceName: "Disney+", providerIds: [337], networkIds: [2739] },
  { sourceId: 2303, sourceName: "Paramount Plus", providerIds: [2303, 2616, 582, 633, 1853], networkIds: [4330, 5506] },
  { sourceId: 386, sourceName: "Peacock", providerIds: [386, 387, 2553], networkIds: [3353] },
  { sourceId: 43, sourceName: "STARZ", providerIds: [43, 634, 1794, 1855], networkIds: [318] },
  { sourceId: 207, sourceName: "The Roku Channel", providerIds: [207] },
  { sourceId: 123, sourceName: "FX", providerIds: [123], networkIds: [88] },
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
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;
  private readonly tvProviderGroups: TmdbTvProviderGroup[];

  constructor(config: TmdbClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.readAccessToken = config.readAccessToken;
    this.baseUrl = config.baseUrl || "https://api.themoviedb.org";
    this.imageBaseUrl = config.imageBaseUrl || "https://image.tmdb.org/t/p/w342";
    this.fetchImpl = config.fetchImpl || fetch;
    this.maxPages = config.maxPages || 10;
    this.maxTvPages = config.maxTvPages || 10;
    this.maxConcurrentRequests = config.maxConcurrentRequests || 6;
    this.retryDelayMs = config.retryDelayMs ?? 1_000;
    this.maxRetries = config.maxRetries ?? 2;
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

    const digitalDiscoverPages = await this.fetchDiscoverPages(input, digitalReleaseType);
    const digitalMovieCandidates = digitalDiscoverPages.flatMap((page) => page.results || []);
    const movies = uniqueMovies(digitalMovieCandidates);
    const digitalMovies = (await mapWithConcurrency(
      movies,
      this.maxConcurrentRequests,
      async (movie): Promise<DigitalMovie | null> => {
        const rawReleaseDates = await this.fetchReleaseDates(movie.id);
        const releaseDateMatch = findDigitalReleaseDate(
          rawReleaseDates,
          input.weekStart,
          input.weekEnd,
        );
        if (!releaseDateMatch) return null;

        const providerAvailability = await this.fetchMovieProviderAvailability(movie.id);

        return {
          movie,
          releaseDate: releaseDateMatch.date,
          releaseDateSource: releaseDateMatch.source,
          streamingProviders: providerAvailability.streamingProviders,
          rawReleaseDates,
        };
      },
    )).filter((movie): movie is DigitalMovie => Boolean(movie));

    return {
      releases: digitalMovies.map((item) => this.normalizeDigitalMovie(item)),
      raw: {
        digitalDatePolicy: tmdbDigitalDatePolicy,
        discover: {
          digital: digitalDiscoverPages,
        },
        releaseDates: digitalMovies.map((item) => item.rawReleaseDates),
        metrics: {
          candidateCount: movies.length,
          releaseCount: digitalMovies.length,
          pageCount: digitalDiscoverPages.length,
        },
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

    const rawDiscover: Array<{
      provider: TmdbTvProviderGroup;
      strategy: TvDiscoveryStrategy;
      pages: TmdbTvDiscoverResponse[];
    }> = [];
    const airings: TvEpisodeAiring[] = [];

    const discoverResults = await mapWithConcurrency(
      this.tvProviderGroups,
      this.maxConcurrentRequests,
      async (provider) => {
        const [providerPages, networkPages] = await Promise.all([
          this.fetchTvDiscoverPages(input, provider, "provider"),
          provider.networkIds?.length
            ? this.fetchTvDiscoverPages(input, provider, "network")
            : Promise.resolve([]),
        ]);
        return [
          { provider, strategy: "provider" as const, pages: providerPages },
          ...(networkPages.length
            ? [{ provider, strategy: "network" as const, pages: networkPages }]
            : []),
        ];
      },
    );
    rawDiscover.push(...discoverResults.flat());

    const discoveredShows = uniqueTvShowDiscoveries(
      rawDiscover.flatMap(({ provider, pages }) =>
        uniqueTvShows(pages.flatMap((page) => page.results || [])).map((show) => ({
          show,
          providers: [provider],
        })),
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
          providers: item.providers,
          episode: item.episode,
        })),
        sourcingPolicy: tmdbTvSourcingPolicy,
        metrics: {
          discoveryBatchCount: rawDiscover.length,
          discoveryPageCount: rawDiscover.reduce((total, batch) => total + batch.pages.length, 0),
          candidateCount: discoveredShows.length,
          releaseCount: releases.length,
        },
      },
    };
  }

  private async fetchDiscoverPages(
    input: {
      weekStart: string;
      weekEnd: string;
    },
    releaseType: number,
  ): Promise<TmdbDiscoverResponse[]> {
    const firstPage = await this.fetchDiscoverPage(input, releaseType, 1);
    const pages = [firstPage];
    const totalPages = Math.min(firstPage.total_pages || 1, this.maxPages);

    const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
    pages.push(...await mapWithConcurrency(
      remainingPages,
      this.maxConcurrentRequests,
      (page) => this.fetchDiscoverPage(input, releaseType, page),
    ));

    return pages;
  }

  private async fetchTvDiscoverPages(
    input: { weekStart: string; weekEnd: string },
    provider: TmdbTvProviderGroup,
    strategy: TvDiscoveryStrategy,
  ): Promise<TmdbTvDiscoverResponse[]> {
    const firstPage = await this.fetchTvDiscoverPage(input, provider, strategy, 1);
    const pages = [firstPage];
    const totalPages = Math.min(firstPage.total_pages || 1, this.maxTvPages);

    const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
    pages.push(...await mapWithConcurrency(
      remainingPages,
      this.maxConcurrentRequests,
      (page) => this.fetchTvDiscoverPage(input, provider, strategy, page),
    ));

    return pages;
  }

  private fetchTvDiscoverPage(
    input: { weekStart: string; weekEnd: string },
    provider: TmdbTvProviderGroup,
    strategy: TvDiscoveryStrategy,
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
    if (strategy === "network") {
      url.searchParams.set("with_networks", (provider.networkIds || []).join("|"));
    } else {
      url.searchParams.set("with_watch_monetization_types", "flatrate|free|ads");
      url.searchParams.set("with_watch_providers", provider.providerIds.join("|"));
    }

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
            providers: discovery.providers,
          })),
      );
  }

  private async fetchDiscoverPage(
    input: { weekStart: string; weekEnd: string },
    releaseType: number,
    page: number,
  ): Promise<TmdbDiscoverResponse> {
    const url = this.url("/3/discover/movie");
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("include_video", "false");
    url.searchParams.set("language", "en-US");
    url.searchParams.set("page", String(page));
    url.searchParams.set("region", "US");
    url.searchParams.set("sort_by", "popularity.desc");
    url.searchParams.set("with_release_type", String(releaseType));
    url.searchParams.set("release_date.gte", input.weekStart);
    url.searchParams.set("release_date.lte", input.weekEnd);

    return this.fetchJson<TmdbDiscoverResponse>(url);
  }

  private fetchReleaseDates(movieId: number): Promise<TmdbReleaseDatesResponse> {
    return this.fetchJson<TmdbReleaseDatesResponse>(this.url(`/3/movie/${movieId}/release_dates`));
  }

  private async fetchMovieProviderAvailability(movieId: number): Promise<MovieProviderAvailability> {
    const response = await this.fetchJson<TmdbWatchProvidersResponse>(
      this.url(`/3/movie/${movieId}/watch/providers`),
    );
    return normalizeMovieProviderAvailability(response);
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

  async findMovieByImdbId(imdbId: string): Promise<TmdbMovieLookup | null> {
    if (!this.isConfigured()) return null;
    const url = this.url(`/3/find/${encodeURIComponent(imdbId)}`);
    url.searchParams.set("external_source", "imdb_id");
    const response = await this.fetchJson<TmdbFindMovieResponse>(url);
    const movie = response.movie_results?.[0];
    if (!movie) return null;

    return {
      id: movie.id,
      title: movie.title || movie.original_title || `TMDB ${movie.id}`,
      posterUrl: movie.poster_path ? `${this.imageBaseUrl}${movie.poster_path}` : null,
      releaseDate: movie.release_date || null,
      originalLanguage: movie.original_language || null,
      popularity: movie.popularity ?? null,
      voteAverage: movie.vote_average ?? null,
      voteCount: movie.vote_count ?? null,
    };
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await this.fetchImpl(url.toString(), this.requestInit());
      const raw = await response.json().catch(() => ({}));

      if (response.ok) {
        return raw as T;
      }

      const statusMessage = response.statusText || "TMDB request failed";
      lastError = new Error(`TMDB ${response.status}: ${statusMessage}`);
      if (!shouldRetryTmdbResponse(response.status) || attempt >= this.maxRetries) {
        throw lastError;
      }

      await delay(retryDelayMs(response.headers, this.retryDelayMs));
    }

    throw lastError || new Error("TMDB request failed.");
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
      sourceTitleId: item.movie.id,
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
      isDigitalDateFallback: false,
      originalLanguage,
      isInternational: isInternationalLanguage(originalLanguage),
      isDubbed: hasDubbedCue(item.movie.title, item.movie.original_title, item.movie.overview),
      sources: item.streamingProviders,
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
      sourceTitleId: item.show.id,
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
      sources: item.providers.map(providerSourceFromTvProviderGroup),
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
    const existing = byId.get(discovery.show.id);
    if (!existing) {
      byId.set(discovery.show.id, discovery);
      continue;
    }

    existing.providers = uniqueTvProviderGroups([
      ...existing.providers,
      ...discovery.providers,
    ]);
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

function normalizeMovieProviderAvailability(response: TmdbWatchProvidersResponse): MovieProviderAvailability {
  const usProviders = response.results?.US;
  if (!usProviders) {
    return {
      streamingProviders: [],
    };
  }

  return {
    streamingProviders: uniqueProviderSources([
      ...(usProviders.flatrate || []).map((provider) => providerSourceFromTmdbProvider(provider, "sub")),
      ...(usProviders.free || []).map((provider) => providerSourceFromTmdbProvider(provider, "free")),
      ...(usProviders.ads || []).map((provider) => providerSourceFromTmdbProvider(provider, "free")),
    ]),
  };
}

function providerSourceFromTmdbProvider(
  provider: TmdbWatchProvider,
  sourceType: ReleaseProviderSource["sourceType"],
): ReleaseProviderSource {
  return {
    key: providerKeyFromName(provider.provider_name),
    name: provider.provider_name,
    sourceId: provider.provider_id,
    sourceType,
    releaseSource: "tmdb",
  };
}

function providerSourceFromTvProviderGroup(
  provider: TmdbTvProviderGroup,
): ReleaseProviderSource {
  return {
    key: providerKeyFromName(provider.sourceName),
    name: provider.sourceName,
    sourceId: provider.sourceId,
    sourceType: "sub",
    releaseSource: "tmdb",
  };
}

function uniqueTvProviderGroups(
  providers: TmdbTvProviderGroup[],
): TmdbTvProviderGroup[] {
  const byId = new Map<number, TmdbTvProviderGroup>();
  for (const provider of providers) byId.set(provider.sourceId, provider);
  return [...byId.values()].sort((a, b) => a.sourceName.localeCompare(b.sourceName));
}

function uniqueProviderSources(sources: ReleaseProviderSource[]): ReleaseProviderSource[] {
  const byKey = new Map<string, ReleaseProviderSource>();
  for (const source of sources) {
    byKey.set(source.key, source);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function providerKeyFromName(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    netflixstandardwithads: "netflix",
  };
  return `provider:${aliases[slug] || slug || "unknown"}`;
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
  const eligible = seasons.filter((season) => {
    if (!season.season_number || season.season_number <= 0) return false;
    if (!season.air_date) return true;
    return season.air_date <= weekEnd;
  });

  const dated = eligible
    .filter((season) => Boolean(season.air_date))
    .sort((a, b) =>
      (b.air_date || "").localeCompare(a.air_date || "") ||
      (b.season_number ?? 0) - (a.season_number ?? 0),
    );
  const undated = eligible
    .filter((season) => !season.air_date)
    .sort((a, b) => (b.season_number ?? 0) - (a.season_number ?? 0));
  const activeSeasons = dated
    .filter((season) => (season.air_date || "") <= weekEnd)
    .slice(0, 2);
  const fallbackSeason = undated[0];

  return [...activeSeasons, fallbackSeason]
    .filter((season): season is TmdbSeasonSummary => Boolean(season))
    .filter((season, index, selected) =>
      selected.findIndex((candidate) => candidate.season_number === season.season_number) === index,
    )
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
): TmdbMovieReleaseDateMatch | null {
  const usReleaseDates =
    response.results?.find((result) => result.iso_3166_1 === "US")?.release_dates || [];

  const originalDigitalDate = usReleaseDates
    .filter((releaseDate) => releaseDate.type === digitalReleaseType)
    .map((releaseDate) => releaseDate.release_date.slice(0, 10))
    .filter(Boolean)
    .sort()[0];

  if (originalDigitalDate) {
    if (originalDigitalDate < weekStart || originalDigitalDate > weekEnd) return null;
    return { date: originalDigitalDate, source: "digital" };
  }

  return null;
}

function shouldRetryTmdbResponse(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(headers: Headers, fallbackDelayMs: number): number {
  const retryAfter = headers.get("Retry-After");
  if (!retryAfter) return fallbackDelayMs;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

  const retryAt = Date.parse(retryAfter);
  if (!Number.isFinite(retryAt)) return fallbackDelayMs;

  return Math.max(0, retryAt - Date.now());
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
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
