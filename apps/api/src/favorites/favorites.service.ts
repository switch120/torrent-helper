import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PROWLARR_CLIENT, RELEASE_REPOSITORY, TMDB_CLIENT } from "../releases/release.tokens";
import type { ReleaseRepository } from "../releases/release.repository";
import { ReleaseWorkflowService } from "../releases/release-workflow.service";
import type { NormalizedRelease } from "../releases/release.types";
import type { TmdbClient } from "../releases/tmdb.client";
import type { TmdbSeasonDetailResponse, TmdbTvDetailResponse } from "../releases/tmdb-detail.mapper";
import type { ProwlarrClient } from "../torrents/prowlarr.client";
import type { TorrentResult, TorrentSearchQuality } from "../torrents/torrent.types";
import type { AddDownloadResponse } from "../downloads/download.types";
import type {
  FavoriteEpisodeSummary,
  FavoriteReleaseContext,
  FavoriteSeasonDetail,
  FavoriteShowSummary,
} from "./favorites.types";

type Clock = () => Date;

const posterBaseUrl = "https://image.tmdb.org/t/p/w500";
const backdropBaseUrl = "https://image.tmdb.org/t/p/w1280";

@Injectable()
export class FavoritesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RELEASE_REPOSITORY) private readonly repository: Pick<ReleaseRepository, "getReleaseByEventId">,
    @Inject(TMDB_CLIENT) private readonly tmdb: Pick<TmdbClient, "isConfigured" | "getTvDetail" | "getTvSeasonDetail">,
    @Inject(PROWLARR_CLIENT) private readonly prowlarr: Pick<ProwlarrClient, "searchRelease">,
    @Inject(ReleaseWorkflowService) private readonly workflow: Pick<ReleaseWorkflowService, "addDownloadForRelease">,
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

  async getSeason(
    userId: number,
    showKey: string,
    seasonNumber: number,
  ): Promise<FavoriteSeasonDetail> {
    const favorite = await this.requireFavorite(userId, showKey);
    validateEpisodeNumber(seasonNumber, "Season");
    if (!favorite.tmdbId || !this.tmdb.isConfigured()) {
      throw new BadRequestException("Episode browsing requires a TMDB-backed favorite.");
    }
    if (favorite.numberOfSeasons && seasonNumber > favorite.numberOfSeasons) {
      throw new NotFoundException("Season was not found.");
    }

    const season = await this.tmdb.getTvSeasonDetail(favorite.tmdbId, seasonNumber);
    return mapFavoriteSeason(showKey, seasonNumber, season);
  }

  async searchEpisodeTorrents(
    userId: number,
    showKey: string,
    seasonNumber: number,
    episodeNumber: number,
    quality: string,
  ): Promise<{ results: TorrentResult[]; warning: string | null }> {
    const favorite = await this.requireFavorite(userId, showKey);
    validateEpisodeNumber(seasonNumber, "Season");
    validateEpisodeNumber(episodeNumber, "Episode");
    const normalizedQuality = normalizeEpisodeQuality(quality);
    const release = favoriteEpisodeRelease(favorite, seasonNumber, episodeNumber);
    const response = await this.prowlarr.searchRelease(release, normalizedQuality);
    return {
      results: selectTopEpisodeTorrents(response.results),
      warning: response.warning,
    };
  }

  async addEpisodeDownload(
    userId: number,
    showKey: string,
    seasonNumber: number,
    episodeNumber: number,
    input: { magnetLink?: string; downloadDir?: string },
  ): Promise<AddDownloadResponse> {
    const favorite = await this.requireFavorite(userId, showKey);
    validateEpisodeNumber(seasonNumber, "Season");
    validateEpisodeNumber(episodeNumber, "Episode");
    const response = await this.workflow.addDownloadForRelease(
      userId,
      favoriteEpisodeRelease(favorite, seasonNumber, episodeNumber),
      {
        magnetLink: input.magnetLink,
        downloadDir: input.downloadDir || "/data/TV",
      },
      { preventDuplicate: true },
    );
    try {
      await this.prisma.favoriteShow.update({
        where: { userId_showKey: { userId, showKey } },
        data: { preferredDownloadDir: response.historyRecord.downloadDir },
      });
    } catch {
      return {
        ...response,
        warning: [
          response.warning,
          "Download started, but the preferred TV folder could not be saved.",
        ].filter(Boolean).join(" "),
      };
    }
    return response;
  }

  private async requireFavorite(userId: number, showKey: string) {
    const favorite = await this.prisma.favoriteShow.findUnique({
      where: { userId_showKey: { userId, showKey } },
    });
    if (!favorite) throw new NotFoundException("Favorite show was not found.");
    return favorite;
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
        sourceTitleId: release.sourceTitleId,
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
      sourceTitleId: release.sourceTitleId,
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

function mapFavoriteSeason(
  showKey: string,
  requestedSeasonNumber: number,
  season: TmdbSeasonDetailResponse,
): FavoriteSeasonDetail {
  const seasonNumber = season.season_number ?? requestedSeasonNumber;
  return {
    showKey,
    seasonNumber,
    airDate: season.air_date || null,
    overview: season.overview || null,
    posterUrl: imageUrl(season.poster_path, posterBaseUrl),
    episodes: (season.episodes || [])
      .map((episode) => ({
        name: episode.name || null,
        seasonNumber: episode.season_number ?? seasonNumber,
        episodeNumber: episode.episode_number ?? null,
        airDate: episode.air_date || null,
        overview: episode.overview || null,
      }))
      .filter((episode) => episode.episodeNumber !== null)
      .sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0)),
  };
}

function favoriteEpisodeRelease(
  favorite: {
    showKey: string;
    tmdbId: number | null;
    sourceTitleId: number | null;
    title: string;
    posterUrl: string | null;
  },
  seasonNumber: number,
  episodeNumber: number,
): NormalizedRelease {
  return {
    eventId: `${favorite.showKey}:s${seasonNumber}:e${episodeNumber}`,
    sourceTitleId: favorite.sourceTitleId ?? favorite.tmdbId ?? 0,
    releaseSource: "tmdb",
    releaseKind: "streaming",
    title: favorite.title,
    titleType: "tvSeries",
    mediaType: "tv",
    tmdbId: favorite.tmdbId,
    tmdbType: "tv",
    imdbId: null,
    posterUrl: favorite.posterUrl,
    releaseDate: "",
    sourceId: 0,
    sourceName: "Favorite episode",
    sourceType: "unknown",
    seasonNumber,
    episodeNumber,
    isOriginal: false,
  };
}

function normalizeEpisodeQuality(value: string): TorrentSearchQuality {
  return value === "1080p" || value === "any" ? value : "2160p";
}

function validateEpisodeNumber(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${label} number must be a positive integer.`);
  }
}

export function selectTopEpisodeTorrents(results: TorrentResult[]): TorrentResult[] {
  return [...results]
    .sort((a, b) =>
      torrentHealthScore(b) - torrentHealthScore(a) ||
      b.seeders - a.seeders ||
      torrentQualityRank(b.quality) - torrentQualityRank(a.quality) ||
      b.confidence - a.confidence ||
      a.title.localeCompare(b.title),
    )
    .slice(0, 5);
}

function torrentHealthScore(torrent: Pick<TorrentResult, "seeders" | "leechers">): number {
  const peers = torrent.seeders + torrent.leechers;
  const availability = peers > 0 ? torrent.seeders / peers : 0;
  return torrent.seeders * 2 + availability * 25;
}

function torrentQualityRank(quality: TorrentResult["quality"]): number {
  return { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, unknown: 0 }[quality];
}

type FavoriteSnapshot = Omit<FavoriteShowSummary, "fetchedAt" | "preferredDownloadDir"> & {
  raw: unknown;
  fetchedAt: Date;
};

function toFavoriteWrite(snapshot: FavoriteSnapshot) {
  return {
    showKey: snapshot.showKey,
    tmdbId: snapshot.tmdbId,
    sourceTitleId: snapshot.sourceTitleId,
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
  return `title:${release.title.toLowerCase().trim()}`;
}

function mapFavoriteShow(record: {
  showKey: string;
  tmdbId: number | null;
  sourceTitleId: number | null;
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
  preferredDownloadDir?: string | null;
  fetchedAt: Date | null;
}): FavoriteShowSummary {
  return {
    showKey: record.showKey,
    tmdbId: record.tmdbId,
    sourceTitleId: record.sourceTitleId,
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
    preferredDownloadDir: record.preferredDownloadDir || null,
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
