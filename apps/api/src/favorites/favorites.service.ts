import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RELEASE_REPOSITORY, TMDB_CLIENT } from "../releases/release.tokens";
import type { ReleaseRepository } from "../releases/release.repository";
import type { NormalizedRelease } from "../releases/release.types";
import type { TmdbClient } from "../releases/tmdb.client";
import type { TmdbTvDetailResponse } from "../releases/tmdb-detail.mapper";
import type { FavoriteEpisodeSummary, FavoriteReleaseContext, FavoriteShowSummary } from "./favorites.types";

type Clock = () => Date;

const posterBaseUrl = "https://image.tmdb.org/t/p/w500";
const backdropBaseUrl = "https://image.tmdb.org/t/p/w1280";

@Injectable()
export class FavoritesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RELEASE_REPOSITORY) private readonly repository: Pick<ReleaseRepository, "getReleaseByEventId">,
    @Inject(TMDB_CLIENT) private readonly tmdb: Pick<TmdbClient, "isConfigured" | "getTvDetail">,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async listFavorites(userId: number): Promise<FavoriteShowSummary[]> {
    const records = await this.prisma.favoriteShow.findMany({
      where: { userId },
      orderBy: [{ title: "asc" }],
    });
    return records.map(mapFavoriteShow);
  }

  async addFavorite(userId: number, eventId: string): Promise<FavoriteShowSummary> {
    const release = await this.repository.getReleaseByEventId(eventId);
    if (!release) throw new NotFoundException("Release was not found.");
    if (release.mediaType !== "tv") {
      throw new BadRequestException("Favorites are available for TV shows only.");
    }

    const snapshot = await this.buildSnapshot(release);
    const record = await this.prisma.favoriteShow.upsert({
      where: {
        userId_showKey: {
          userId,
          showKey: snapshot.showKey,
        },
      },
      create: {
        userId,
        ...toFavoriteWrite(snapshot),
      },
      update: toFavoriteWrite(snapshot),
    });

    return mapFavoriteShow(record);
  }

  async removeFavorite(userId: number, showKey: string): Promise<{ deleted: boolean }> {
    await this.prisma.favoriteShow.deleteMany({
      where: { userId, showKey },
    });
    return { deleted: true };
  }

  private async buildSnapshot(release: NormalizedRelease): Promise<FavoriteSnapshot> {
    const showKey = favoriteShowKey(release);
    const releaseContext: FavoriteReleaseContext = {
      eventId: release.eventId,
      sourceName: release.sourceName,
      sourceId: release.sourceId,
      releaseDate: release.releaseDate,
      seasonNumber: release.seasonNumber,
    };

    if (!release.tmdbId || !this.tmdb.isConfigured()) {
      return {
        showKey,
        tmdbId: release.tmdbId,
        watchmodeId: release.watchmodeId,
        title: release.title,
        posterUrl: release.posterUrl,
        backdropUrl: null,
        overview: null,
        status: null,
        isCanceled: false,
        currentSeasonNumber: release.seasonNumber,
        numberOfSeasons: null,
        numberOfEpisodes: null,
        lastAirDate: null,
        lastEpisode: null,
        nextEpisode: null,
        releaseContext,
        raw: { fallback: true },
        fetchedAt: this.clock(),
      };
    }

    const detail = await this.tmdb.getTvDetail(release.tmdbId);
    const lastEpisode = mapEpisode(detail.last_episode_to_air);
    const nextEpisode = mapEpisode(detail.next_episode_to_air);
    const status = detail.status || null;

    return {
      showKey,
      tmdbId: detail.id || release.tmdbId,
      watchmodeId: release.watchmodeId,
      title: detail.name || detail.original_name || release.title,
      posterUrl: imageUrl(detail.poster_path, posterBaseUrl) || release.posterUrl,
      backdropUrl: imageUrl(detail.backdrop_path, backdropBaseUrl),
      overview: detail.overview || null,
      status,
      isCanceled: status === "Canceled",
      currentSeasonNumber: nextEpisode?.seasonNumber ?? lastEpisode?.seasonNumber ?? release.seasonNumber ?? detail.number_of_seasons ?? null,
      numberOfSeasons: detail.number_of_seasons ?? null,
      numberOfEpisodes: detail.number_of_episodes ?? null,
      lastAirDate: detail.last_air_date || null,
      lastEpisode,
      nextEpisode,
      releaseContext,
      raw: detail,
      fetchedAt: this.clock(),
    };
  }
}

type FavoriteSnapshot = Omit<FavoriteShowSummary, "fetchedAt"> & {
  raw: unknown;
  fetchedAt: Date;
};

function toFavoriteWrite(snapshot: FavoriteSnapshot) {
  return {
    showKey: snapshot.showKey,
    tmdbId: snapshot.tmdbId,
    watchmodeId: snapshot.watchmodeId,
    title: snapshot.title,
    posterUrl: snapshot.posterUrl,
    backdropUrl: snapshot.backdropUrl,
    overview: snapshot.overview,
    status: snapshot.status,
    isCanceled: snapshot.isCanceled,
    currentSeasonNumber: snapshot.currentSeasonNumber,
    numberOfSeasons: snapshot.numberOfSeasons,
    numberOfEpisodes: snapshot.numberOfEpisodes,
    lastAirDate: snapshot.lastAirDate ? new Date(`${snapshot.lastAirDate}T00:00:00.000Z`) : null,
    lastEpisode: snapshot.lastEpisode as Prisma.InputJsonValue,
    nextEpisode: snapshot.nextEpisode as Prisma.InputJsonValue,
    releaseContext: snapshot.releaseContext as Prisma.InputJsonValue,
    raw: snapshot.raw as Prisma.InputJsonValue,
    fetchedAt: snapshot.fetchedAt,
  };
}

function favoriteShowKey(release: NormalizedRelease): string {
  if (release.tmdbId) return `tmdb:${release.tmdbId}`;
  if (release.watchmodeId) return `watchmode:${release.watchmodeId}`;
  return `title:${release.title.toLowerCase().trim()}`;
}

function mapFavoriteShow(record: {
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
  lastAirDate: Date | null;
  lastEpisode: unknown;
  nextEpisode: unknown;
  releaseContext: unknown;
  fetchedAt: Date | null;
}): FavoriteShowSummary {
  return {
    showKey: record.showKey,
    tmdbId: record.tmdbId,
    watchmodeId: record.watchmodeId,
    title: record.title,
    posterUrl: record.posterUrl,
    backdropUrl: record.backdropUrl,
    overview: record.overview,
    status: record.status,
    isCanceled: record.isCanceled,
    currentSeasonNumber: record.currentSeasonNumber,
    numberOfSeasons: record.numberOfSeasons,
    numberOfEpisodes: record.numberOfEpisodes,
    lastAirDate: record.lastAirDate ? toDateOnly(record.lastAirDate) : null,
    lastEpisode: mapStoredEpisode(record.lastEpisode),
    nextEpisode: mapStoredEpisode(record.nextEpisode),
    releaseContext: mapReleaseContext(record.releaseContext),
    fetchedAt: record.fetchedAt?.toISOString() ?? null,
  };
}

function mapEpisode(value: TmdbTvDetailResponse["last_episode_to_air"]): FavoriteEpisodeSummary | null {
  if (!value) return null;
  return {
    name: value.name || null,
    seasonNumber: value.season_number ?? null,
    episodeNumber: value.episode_number ?? null,
    airDate: value.air_date || null,
    overview: value.overview || null,
  };
}

function mapStoredEpisode(value: unknown): FavoriteEpisodeSummary | null {
  if (!isRecord(value)) return null;
  return {
    name: typeof value.name === "string" ? value.name : null,
    seasonNumber: typeof value.seasonNumber === "number" ? value.seasonNumber : null,
    episodeNumber: typeof value.episodeNumber === "number" ? value.episodeNumber : null,
    airDate: typeof value.airDate === "string" ? value.airDate : null,
    overview: typeof value.overview === "string" ? value.overview : null,
  };
}

function mapReleaseContext(value: unknown): FavoriteReleaseContext | null {
  if (!isRecord(value)) return null;
  if (typeof value.eventId !== "string" || typeof value.sourceName !== "string" || typeof value.releaseDate !== "string") {
    return null;
  }
  return {
    eventId: value.eventId,
    sourceName: value.sourceName,
    sourceId: typeof value.sourceId === "number" ? value.sourceId : 0,
    releaseDate: value.releaseDate,
    seasonNumber: typeof value.seasonNumber === "number" ? value.seasonNumber : null,
  };
}

function imageUrl(path: string | null | undefined, baseUrl: string): string | null {
  return path ? `${baseUrl}${path}` : null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
