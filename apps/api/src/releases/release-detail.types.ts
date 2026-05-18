import type { NormalizedRelease } from "./release.types";

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
  release: NormalizedRelease;
  title: string;
  mediaType: NormalizedRelease["mediaType"];
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
  raw: unknown;
};
