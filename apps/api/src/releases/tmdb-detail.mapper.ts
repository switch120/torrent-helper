import type { NormalizedRelease } from "./release.types";
import type { ReleaseCastMember, ReleaseDetail } from "./release-detail.types";

type TmdbGenre = { id?: number; name?: string | null };
export type TmdbNetwork = { id?: number; name?: string | null };
type TmdbCastMember = {
  id?: number;
  name?: string | null;
  original_name?: string | null;
  character?: string | null;
  order?: number | null;
  profile_path?: string | null;
  roles?: Array<{ character?: string | null }>;
};

type TmdbEpisodeSummary = {
  name?: string | null;
  overview?: string | null;
  air_date?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
};

export type TmdbSeasonSummary = {
  season_number?: number | null;
  air_date?: string | null;
  episode_count?: number | null;
};

export type TmdbMovieDetailResponse = {
  id?: number;
  title?: string | null;
  original_title?: string | null;
  overview?: string | null;
  backdrop_path?: string | null;
  poster_path?: string | null;
  release_date?: string | null;
  runtime?: number | null;
  genres?: TmdbGenre[];
  credits?: { cast?: TmdbCastMember[] };
  external_ids?: { imdb_id?: string | null };
};

export type TmdbTvDetailResponse = {
  id?: number;
  name?: string | null;
  original_name?: string | null;
  overview?: string | null;
  backdrop_path?: string | null;
  poster_path?: string | null;
  first_air_date?: string | null;
  last_air_date?: string | null;
  status?: string | null;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  networks?: TmdbNetwork[];
  last_episode_to_air?: TmdbEpisodeSummary | null;
  next_episode_to_air?: TmdbEpisodeSummary | null;
  seasons?: TmdbSeasonSummary[];
  episode_run_time?: number[];
  genres?: TmdbGenre[];
  aggregate_credits?: { cast?: TmdbCastMember[] };
  external_ids?: { imdb_id?: string | null };
};

export type TmdbSeasonDetailResponse = {
  season_number?: number | null;
  air_date?: string | null;
  episode_count?: number | null;
  overview?: string | null;
  poster_path?: string | null;
  episodes?: TmdbEpisodeSummary[];
};

const posterBaseUrl = "https://image.tmdb.org/t/p/w500";
const backdropBaseUrl = "https://image.tmdb.org/t/p/w1280";
const profileBaseUrl = "https://image.tmdb.org/t/p/w185";

export function mapTmdbMovieDetail(
  release: NormalizedRelease,
  raw: TmdbMovieDetailResponse,
): ReleaseDetail {
  return {
    eventId: release.eventId,
    release,
    title: raw.title || raw.original_title || release.title,
    mediaType: "movie",
    overview: raw.overview || null,
    posterUrl: imageUrl(raw.poster_path, posterBaseUrl) || release.posterUrl,
    backdropUrl: imageUrl(raw.backdrop_path, backdropBaseUrl),
    releaseDate: raw.release_date || release.releaseDate,
    primaryReleaseDate: release.primaryReleaseDate || raw.release_date || release.releaseDate,
    seasonNumber: null,
    episodeCount: null,
    runtimeMinutes: raw.runtime ?? null,
    genres: mapGenres(raw.genres),
    cast: mapCast(raw.credits?.cast),
    imdbId: raw.external_ids?.imdb_id || release.imdbId,
    tmdbId: raw.id || release.tmdbId,
    raw,
  };
}

export function mapTmdbTvDetail(
  release: NormalizedRelease,
  raw: TmdbTvDetailResponse,
  season: TmdbSeasonDetailResponse | null = null,
): ReleaseDetail {
  return {
    eventId: release.eventId,
    release,
    title: raw.name || raw.original_name || release.title,
    mediaType: "tv",
    overview: season?.overview || raw.overview || null,
    posterUrl: imageUrl(season?.poster_path || raw.poster_path, posterBaseUrl) || release.posterUrl,
    backdropUrl: imageUrl(raw.backdrop_path, backdropBaseUrl),
    releaseDate: season?.air_date || release.releaseDate || raw.first_air_date || null,
    primaryReleaseDate: raw.first_air_date || release.primaryReleaseDate || release.releaseDate,
    seasonNumber: season?.season_number ?? release.seasonNumber,
    episodeCount: season?.episode_count ?? null,
    runtimeMinutes: raw.episode_run_time?.[0] ?? null,
    genres: mapGenres(raw.genres),
    cast: mapCast(raw.aggregate_credits?.cast),
    imdbId: raw.external_ids?.imdb_id || release.imdbId,
    tmdbId: raw.id || release.tmdbId,
    raw: { detail: raw, season },
  };
}

export function applyCastExternalIds(
  detail: ReleaseDetail,
  imdbIdsByPersonId: Map<number, string | null>,
): ReleaseDetail {
  return {
    ...detail,
    cast: detail.cast.map((member) => {
      const imdbId = imdbIdsByPersonId.get(member.id) || null;
      return {
        ...member,
        imdbId,
        imdbUrl: imdbId ? `https://www.imdb.com/name/${imdbId}/` : null,
      };
    }),
  };
}

function mapGenres(genres: TmdbGenre[] = []): string[] {
  return genres.map((genre) => genre.name).filter((name): name is string => Boolean(name));
}

function mapCast(cast: TmdbCastMember[] = []): ReleaseCastMember[] {
  return [...cast]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map((member) => ({
      id: member.id || 0,
      name: member.name || member.original_name || "Unknown",
      character: member.character || member.roles?.[0]?.character || null,
      profileUrl: imageUrl(member.profile_path, profileBaseUrl),
      imdbId: null,
      imdbUrl: null,
    }));
}

function imageUrl(path: string | null | undefined, baseUrl: string): string | null {
  return path ? `${baseUrl}${path}` : null;
}
