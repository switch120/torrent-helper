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
  episodeNumber?: number | null;
  episodeName?: string | null;
  isOriginal: boolean;
  primaryReleaseDate?: string | null;
  popularity?: number | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  isFeaturedDigital?: boolean;
  sources?: ReleaseProviderSource[];
};

export type ReleaseProviderSource = {
  key: string;
  name: string;
  sourceId: number;
  sourceType: ReleaseSourceType;
  releaseSource: ReleaseSourceName;
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
  hiddenCount: number;
  emptyText: string;
  releases: DigitalRelease[];
};

export type ReleaseWeekStatus = "idle" | "loading" | "refreshing" | "ready" | "error";

export type ProviderFilter = {
  key: string;
  name: string;
  hidden: boolean;
  count?: number;
  disabled?: boolean;
};

export type AuthPublicConfig = {
  domain: string;
  audience: string;
  clientId: string;
  configured: boolean;
};

export type AuthenticatedUser = {
  id: number;
  auth0Sub: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

export type UserSettings = {
  hiddenProviders: ProviderFilter[];
  hiddenShowKeys: string[];
  showOnlyFavorites: boolean;
};

export type ReleaseCastMember = {
  id: number;
  name: string;
  character: string | null;
  profileUrl: string | null;
  imdbId?: string | null;
  imdbUrl?: string | null;
};

export type ReleaseDetail = {
  eventId: string;
  release: DigitalRelease;
  title: string;
  mediaType: ReleaseMediaType;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  primaryReleaseDate: string | null;
  seasonNumber: number | null;
  episodeCount: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  cast: ReleaseCastMember[];
  imdbId: string | null;
  tmdbId: number | null;
};

export type TorrentQuality = "2160p" | "1080p" | "720p" | "480p" | "unknown";
export type TorrentSearchQuality = "2160p" | "1080p" | "any";

export type TorrentResult = {
  id: string;
  title: string;
  indexer: string;
  magnetLink: string;
  sizeBytes: number | null;
  seeders: number;
  leechers: number;
  quality: TorrentQuality;
  publishedAt: string | null;
  confidence: number;
};

export type TorrentSearchResponse = {
  results: TorrentResult[];
  warning: string | null;
};

export type TransmissionDownload = {
  id: number;
  name: string;
  status: string;
  rawStatus: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  eta: number;
  downloadDir: string;
  totalSize: number;
  downloadedEver: number;
  uploadedEver: number;
  leftUntilDone: number;
  peersConnected: number;
  peersSendingToUs: number;
  peersGettingFromUs: number;
  uploadRatio: number;
  errorString: string | null;
  labels: string[];
  magnetLink: string | null;
  releaseEventId?: string | null;
};

export type ProxyHealthStatus = "up" | "down" | "unknown";

export type ProxyHealth = {
  status: ProxyHealthStatus;
  proxyIp: string | null;
  publicIp: string | null;
  checkedAt: string | null;
  warning: string | null;
};

export type DownloadListResponse = {
  downloads: TransmissionDownload[];
  proxy: ProxyHealth;
};

export type FavoriteEpisodeSummary = {
  name: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  airDate: string | null;
  overview?: string | null;
};

export type FavoriteReleaseContext = {
  eventId: string;
  sourceName: string;
  sourceId: number;
  releaseDate: string;
  seasonNumber: number | null;
};

export type FavoriteShowSummary = {
  showKey: string;
  tmdbId: number | null;
  watchmodeId: number | null;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  status: string | null;
  isCanceled: boolean;
  currentSeasonNumber: number | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  lastAirDate: string | null;
  lastEpisode: FavoriteEpisodeSummary | null;
  nextEpisode: FavoriteEpisodeSummary | null;
  releaseContext: FavoriteReleaseContext | null;
  fetchedAt: string | null;
};
