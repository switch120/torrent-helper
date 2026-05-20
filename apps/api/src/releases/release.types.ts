export type ReleaseMediaType = "movie" | "tv";
export type ReleaseSourceName = "tmdb";
export type ReleaseKind = "streaming" | "digital";
export type ReleaseSourceType = "sub" | "purchase" | "free" | "tve" | "digital" | "unknown";

export type ReleaseProviderSource = {
  key: string;
  name: string;
  sourceId: number;
  sourceType: ReleaseSourceType;
  releaseSource: ReleaseSourceName;
};

export type NormalizedRelease = {
  eventId: string;
  sourceTitleId: number;
  releaseSource: ReleaseSourceName;
  releaseKind: ReleaseKind;
  title: string;
  titleType: string;
  mediaType: ReleaseMediaType;
  tmdbId: number | null;
  tmdbType: string | null;
  imdbId: string | null;
  posterUrl: string | null;
  releaseDate: string;
  sourceId: number;
  sourceName: string;
  sourceType: ReleaseSourceType;
  seasonNumber: number | null;
  episodeNumber?: number | null;
  episodeName?: string | null;
  isOriginal: boolean;
  primaryReleaseDate?: string | null;
  popularity?: number | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  isFeaturedDigital?: boolean;
  isDigitalDateFallback?: boolean;
  originalLanguage?: string | null;
  isInternational?: boolean;
  isDubbed?: boolean;
  sources?: ReleaseProviderSource[];
};

export type ReleaseCacheStatus = "fresh" | "stale";

export type FetchCacheSnapshot = {
  cacheKey: string;
  coveredStartDate: string;
  coveredEndDate: string;
  fetchedAt: Date | null;
  status: ReleaseCacheStatus;
  warning: string | null;
};

export type ReleaseWeekResponse = {
  weekStart: string;
  weekEnd: string;
  cache: {
    status: ReleaseCacheStatus;
    fetchedAt: string | null;
    expiresAt: string | null;
    warning: string | null;
  };
  movies: NormalizedRelease[];
  tv: NormalizedRelease[];
};
