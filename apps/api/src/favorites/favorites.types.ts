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
