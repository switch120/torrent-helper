export type ReleaseMediaType = "movie" | "tv";
export type ReleaseSourceName = "watchmode" | "tmdb";
export type ReleaseKind = "streaming" | "digital";
export type ReleaseSourceType = "sub" | "purchase" | "free" | "tve" | "digital" | "unknown";

export type DigitalRelease = {
  eventId: string;
  watchmodeId: number;
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
  isOriginal: boolean;
  primaryReleaseDate?: string | null;
  popularity?: number | null;
  voteCount?: number | null;
  isFeaturedDigital?: boolean;
};

export type ReleaseWeekResponse = {
  weekStart: string;
  weekEnd: string;
  cache: {
    status: "fresh" | "stale";
    fetchedAt: string | null;
    expiresAt: string | null;
    warning: string | null;
  };
  movies: DigitalRelease[];
  tv: DigitalRelease[];
};

export type ReleaseSection = {
  title: "Movies" | "TV";
  count: number;
  emptyText: string;
  releases: DigitalRelease[];
};

export type ReleaseWeekStatus = "idle" | "loading" | "refreshing" | "ready" | "error";

export type ProviderFilter = {
  key: string;
  name: string;
  hidden: boolean;
};
