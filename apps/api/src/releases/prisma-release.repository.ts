import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ReleaseRepository,
  DownloadRecordSnapshot,
  SaveTmdbDigitalWeekInput,
  SaveTmdbTvWeekInput,
  SaveWatchModeFetchInput,
  TmdbDigitalWeekCacheSnapshot,
  TmdbTvWeekCacheSnapshot,
} from "./release.repository";
import type { FetchCacheSnapshot, NormalizedRelease } from "./release.types";
import type { ReleaseDetail } from "./release-detail.types";
import type { TorrentResult, TorrentSearchQuality } from "../torrents/torrent.types";

@Injectable()
export class PrismaReleaseRepository implements ReleaseRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getFetchCoveringWeek(
    weekStart: string,
    weekEnd: string,
  ): Promise<FetchCacheSnapshot | null> {
    const cache = await this.prisma.watchModeFetchCache.findFirst({
      where: {
        coveredStartDate: { lte: toDate(weekStart) },
        coveredEndDate: { gte: toDate(weekEnd) },
        NOT: {
          cacheKey: {
            contains: "000000:",
          },
        },
      },
      orderBy: [{ fetchedAt: "desc" }, { updatedAt: "desc" }],
    });

    if (!cache) return null;

    return {
      cacheKey: cache.cacheKey,
      coveredStartDate: toDateOnly(cache.coveredStartDate),
      coveredEndDate: toDateOnly(cache.coveredEndDate),
      fetchedAt: cache.fetchedAt,
      status: cache.status === "stale" ? "stale" : "fresh",
      warning: cache.warning,
    };
  }

  async getWeekReleases(
    weekStart: string,
    weekEnd: string,
  ): Promise<NormalizedRelease[]> {
    const events = await this.prisma.releaseEvent.findMany({
      where: {
        releaseDate: {
          gte: toDate(weekStart),
          lte: toDate(weekEnd),
        },
      },
      include: {
        title: true,
        source: true,
      },
      orderBy: [{ releaseDate: "asc" }, { title: { title: "asc" } }],
    });

    return events.map(mapReleaseEvent);
  }

  async saveWatchModeFetch(input: SaveWatchModeFetchInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.watchModeFetchCache.upsert({
        where: { cacheKey: input.cacheKey },
        create: {
          cacheKey: input.cacheKey,
          requestedStartDate: toDate(input.requestedStartDate),
          requestedEndDate: toDate(input.requestedEndDate),
          coveredStartDate: toDate(input.coveredStartDate),
          coveredEndDate: toDate(input.coveredEndDate),
          status: "fresh",
          warning: null,
          fetchedAt: input.fetchedAt,
          rateLimitLimit: input.quota.rateLimitLimit,
          rateLimitRemaining: input.quota.rateLimitRemaining,
          accountQuota: input.quota.accountQuota,
          accountQuotaUsed: input.quota.accountQuotaUsed,
          rawResponse: input.raw as Prisma.InputJsonValue,
        },
        update: {
          requestedStartDate: toDate(input.requestedStartDate),
          requestedEndDate: toDate(input.requestedEndDate),
          coveredStartDate: toDate(input.coveredStartDate),
          coveredEndDate: toDate(input.coveredEndDate),
          status: "fresh",
          warning: null,
          fetchedAt: input.fetchedAt,
          rateLimitLimit: input.quota.rateLimitLimit,
          rateLimitRemaining: input.quota.rateLimitRemaining,
          accountQuota: input.quota.accountQuota,
          accountQuotaUsed: input.quota.accountQuotaUsed,
          rawResponse: input.raw as Prisma.InputJsonValue,
        },
      });

      await tx.releaseEvent.deleteMany({
        where: {
          releaseDate: {
            gte: toDate(input.coveredStartDate),
            lte: toDate(input.coveredEndDate),
          },
        },
      });

      for (const release of input.releases) {
        await tx.releaseTitle.upsert({
          where: { watchmodeId: release.watchmodeId },
          create: {
            watchmodeId: release.watchmodeId,
            title: release.title,
            titleType: release.titleType,
            mediaType: release.mediaType,
            tmdbId: release.tmdbId,
            tmdbType: release.tmdbType,
            imdbId: release.imdbId,
            posterUrl: release.posterUrl,
          },
          update: {
            title: release.title,
            titleType: release.titleType,
            mediaType: release.mediaType,
            tmdbId: release.tmdbId,
            tmdbType: release.tmdbType,
            imdbId: release.imdbId,
            posterUrl: release.posterUrl,
          },
        });

        await tx.releaseSource.upsert({
          where: { watchmodeId: release.sourceId },
          create: {
            watchmodeId: release.sourceId,
            name: release.sourceName,
          },
          update: {
            name: release.sourceName,
          },
        });

        await tx.releaseEvent.upsert({
          where: { id: release.eventId },
          create: {
            id: release.eventId,
            titleId: release.watchmodeId,
            sourceId: release.sourceId,
            releaseDate: toDate(release.releaseDate),
            seasonNumber: release.seasonNumber,
            isOriginal: release.isOriginal,
            raw: release as Prisma.InputJsonValue,
          },
          update: {
            titleId: release.watchmodeId,
            sourceId: release.sourceId,
            releaseDate: toDate(release.releaseDate),
            seasonNumber: release.seasonNumber,
            isOriginal: release.isOriginal,
            raw: release as Prisma.InputJsonValue,
          },
        });
      }
    });
  }

  async getTmdbDigitalWeekCache(
    weekStart: string,
  ): Promise<TmdbDigitalWeekCacheSnapshot | null> {
    const cache = await this.prisma.tmdbDigitalWeekCache.findUnique({
      where: { weekStart: toDate(weekStart) },
    });

    if (!cache) return null;
    const missingLanguageCount = await this.prisma.tmdbDigitalMovie.count({
      where: {
        releaseDate: {
          gte: cache.weekStart,
          lte: cache.weekEnd,
        },
        originalLanguage: null,
      },
    });
    if (missingLanguageCount > 0) return null;

    return {
      weekStart: toDateOnly(cache.weekStart),
      weekEnd: toDateOnly(cache.weekEnd),
      fetchedAt: cache.fetchedAt,
      status: cache.status === "stale" ? "stale" : "fresh",
      warning: cache.warning,
    };
  }

  async getTmdbDigitalMovies(
    weekStart: string,
    weekEnd: string,
  ): Promise<NormalizedRelease[]> {
    const movies = await this.prisma.tmdbDigitalMovie.findMany({
      where: {
        releaseDate: {
          gte: toDate(weekStart),
          lte: toDate(weekEnd),
        },
      },
      orderBy: [{ releaseDate: "asc" }, { title: "asc" }],
    });

    return movies.map((movie) => {
      const raw = isRecord(movie.raw) ? movie.raw : {};
      return {
        eventId: movie.eventId,
        watchmodeId: movie.tmdbId,
        releaseSource: "tmdb",
        releaseKind: "digital",
        title: movie.title,
        titleType: "movie",
        mediaType: "movie",
        tmdbId: movie.tmdbId,
        tmdbType: "movie",
        imdbId: null,
        posterUrl: movie.posterUrl,
        releaseDate: toDateOnly(movie.releaseDate),
        sourceId: 0,
        sourceName: "Digital release",
        sourceType: "digital",
        seasonNumber: null,
        isOriginal: Boolean(raw.isOriginal),
        primaryReleaseDate: movie.primaryReleaseDate ? toDateOnly(movie.primaryReleaseDate) : null,
        popularity: movie.popularity,
        voteCount: movie.voteCount,
        voteAverage: movie.voteAverage,
        isFeaturedDigital: movie.isFeaturedDigital,
        originalLanguage: movie.originalLanguage,
        isInternational: movie.isInternational,
        isDubbed: movie.isDubbed,
      };
    });
  }

  async saveTmdbDigitalWeek(input: SaveTmdbDigitalWeekInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tmdbDigitalWeekCache.upsert({
        where: { weekStart: toDate(input.weekStart) },
        create: {
          weekStart: toDate(input.weekStart),
          weekEnd: toDate(input.weekEnd),
          status: "fresh",
          warning: null,
          fetchedAt: input.fetchedAt,
          expiresAt: input.expiresAt,
          rawResponse: input.raw as Prisma.InputJsonValue,
        },
        update: {
          weekEnd: toDate(input.weekEnd),
          status: "fresh",
          warning: null,
          fetchedAt: input.fetchedAt,
          expiresAt: input.expiresAt,
          rawResponse: input.raw as Prisma.InputJsonValue,
        },
      });

      await tx.tmdbDigitalMovie.deleteMany({
        where: {
          releaseDate: {
            gte: toDate(input.weekStart),
            lte: toDate(input.weekEnd),
          },
        },
      });

      for (const release of input.releases) {
        await tx.tmdbDigitalMovie.upsert({
          where: { eventId: release.eventId },
          create: {
            eventId: release.eventId,
            tmdbId: release.tmdbId || release.watchmodeId,
            title: release.title,
            posterUrl: release.posterUrl,
            releaseDate: toDate(release.releaseDate),
            primaryReleaseDate: release.primaryReleaseDate ? toDate(release.primaryReleaseDate) : null,
            popularity: release.popularity,
            voteAverage: release.voteAverage,
            voteCount: release.voteCount,
            isFeaturedDigital: Boolean(release.isFeaturedDigital),
            originalLanguage: release.originalLanguage,
            isInternational: release.isInternational === true,
            isDubbed: release.isDubbed === true,
            raw: release as Prisma.InputJsonValue,
          },
          update: {
            tmdbId: release.tmdbId || release.watchmodeId,
            title: release.title,
            posterUrl: release.posterUrl,
            releaseDate: toDate(release.releaseDate),
            primaryReleaseDate: release.primaryReleaseDate ? toDate(release.primaryReleaseDate) : null,
            popularity: release.popularity,
            voteAverage: release.voteAverage,
            voteCount: release.voteCount,
            isFeaturedDigital: Boolean(release.isFeaturedDigital),
            originalLanguage: release.originalLanguage,
            isInternational: release.isInternational === true,
            isDubbed: release.isDubbed === true,
            raw: release as Prisma.InputJsonValue,
          },
        });
      }
    });
  }

  async getTmdbTvWeekCache(
    weekStart: string,
  ): Promise<TmdbTvWeekCacheSnapshot | null> {
    const cache = await this.prisma.tmdbTvWeekCache.findUnique({
      where: { weekStart: toDate(weekStart) },
    });

    if (!cache) return null;
    const missingLanguageCount = await this.prisma.tmdbTvAiring.count({
      where: {
        releaseDate: {
          gte: cache.weekStart,
          lte: cache.weekEnd,
        },
        originalLanguage: null,
      },
    });
    if (missingLanguageCount > 0) return null;

    return {
      weekStart: toDateOnly(cache.weekStart),
      weekEnd: toDateOnly(cache.weekEnd),
      fetchedAt: cache.fetchedAt,
      status: cache.status === "stale" ? "stale" : "fresh",
      warning: cache.warning,
    };
  }

  async getTmdbTvAirings(
    weekStart: string,
    weekEnd: string,
  ): Promise<NormalizedRelease[]> {
    const airings = await this.prisma.tmdbTvAiring.findMany({
      where: {
        releaseDate: {
          gte: toDate(weekStart),
          lte: toDate(weekEnd),
        },
      },
      orderBy: [{ releaseDate: "asc" }, { title: "asc" }, { providerName: "asc" }],
    });

    return airings.map(mapTmdbTvAiring);
  }

  async saveTmdbTvWeek(input: SaveTmdbTvWeekInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tmdbTvWeekCache.upsert({
        where: { weekStart: toDate(input.weekStart) },
        create: {
          weekStart: toDate(input.weekStart),
          weekEnd: toDate(input.weekEnd),
          status: "fresh",
          warning: null,
          fetchedAt: input.fetchedAt,
          expiresAt: input.expiresAt,
          rawResponse: input.raw as Prisma.InputJsonValue,
        },
        update: {
          weekEnd: toDate(input.weekEnd),
          status: "fresh",
          warning: null,
          fetchedAt: input.fetchedAt,
          expiresAt: input.expiresAt,
          rawResponse: input.raw as Prisma.InputJsonValue,
        },
      });

      await tx.tmdbTvAiring.deleteMany({
        where: {
          releaseDate: {
            gte: toDate(input.weekStart),
            lte: toDate(input.weekEnd),
          },
        },
      });

      for (const release of input.releases) {
        await tx.tmdbTvAiring.upsert({
          where: { eventId: release.eventId },
          create: {
            eventId: release.eventId,
            tmdbId: release.tmdbId || release.watchmodeId,
            title: release.title,
            titleType: release.titleType,
            posterUrl: release.posterUrl,
            releaseDate: toDate(release.releaseDate),
            firstAirDate: release.primaryReleaseDate ? toDate(release.primaryReleaseDate) : null,
            providerId: release.sourceId,
            providerName: release.sourceName,
            seasonNumber: release.seasonNumber,
            episodeNumber: release.episodeNumber,
            episodeName: release.episodeName,
            imdbId: release.imdbId,
            popularity: release.popularity,
            voteAverage: release.voteAverage,
            voteCount: release.voteCount,
            originalLanguage: release.originalLanguage,
            isInternational: release.isInternational === true,
            isDubbed: release.isDubbed === true,
            raw: release as Prisma.InputJsonValue,
          },
          update: {
            tmdbId: release.tmdbId || release.watchmodeId,
            title: release.title,
            titleType: release.titleType,
            posterUrl: release.posterUrl,
            releaseDate: toDate(release.releaseDate),
            firstAirDate: release.primaryReleaseDate ? toDate(release.primaryReleaseDate) : null,
            providerId: release.sourceId,
            providerName: release.sourceName,
            seasonNumber: release.seasonNumber,
            episodeNumber: release.episodeNumber,
            episodeName: release.episodeName,
            imdbId: release.imdbId,
            popularity: release.popularity,
            voteAverage: release.voteAverage,
            voteCount: release.voteCount,
            originalLanguage: release.originalLanguage,
            isInternational: release.isInternational === true,
            isDubbed: release.isDubbed === true,
            raw: release as Prisma.InputJsonValue,
          },
        });
      }
    });
  }

  async getReleaseByEventId(eventId: string): Promise<NormalizedRelease | null> {
    const event = await this.prisma.releaseEvent.findUnique({
      where: { id: eventId },
      include: { title: true, source: true },
    });
    if (event) return mapReleaseEvent(event);

    const movie = await this.prisma.tmdbDigitalMovie.findUnique({
      where: { eventId },
    });
    if (!movie) {
      const airing = await this.prisma.tmdbTvAiring.findUnique({
        where: { eventId },
      });
      return airing ? mapTmdbTvAiring(airing) : null;
    }

    return {
      eventId: movie.eventId,
      watchmodeId: movie.tmdbId,
      releaseSource: "tmdb",
      releaseKind: "digital",
      title: movie.title,
      titleType: "movie",
      mediaType: "movie",
      tmdbId: movie.tmdbId,
      tmdbType: "movie",
      imdbId: null,
      posterUrl: movie.posterUrl,
      releaseDate: toDateOnly(movie.releaseDate),
      sourceId: 0,
      sourceName: "Digital release",
      sourceType: "digital",
      seasonNumber: null,
      isOriginal: false,
      primaryReleaseDate: movie.primaryReleaseDate ? toDateOnly(movie.primaryReleaseDate) : null,
      popularity: movie.popularity,
      voteAverage: movie.voteAverage,
      voteCount: movie.voteCount,
      isFeaturedDigital: movie.isFeaturedDigital,
      originalLanguage: movie.originalLanguage,
      isInternational: movie.isInternational,
      isDubbed: movie.isDubbed,
    };
  }

  async getReleaseDetail(eventId: string): Promise<ReleaseDetail | null> {
    const cache = await this.prisma.releaseDetailCache.findUnique({ where: { eventId } });
    if (!cache) return null;
    return cache.detail as ReleaseDetail;
  }

  async saveReleaseDetail(detail: ReleaseDetail, fetchedAt: Date): Promise<void> {
    await this.prisma.releaseDetailCache.upsert({
      where: { eventId: detail.eventId },
      create: {
        eventId: detail.eventId,
        tmdbId: detail.tmdbId,
        mediaType: detail.mediaType,
        detail: detail as Prisma.InputJsonValue,
        raw: detail.raw as Prisma.InputJsonValue,
        fetchedAt,
      },
      update: {
        tmdbId: detail.tmdbId,
        mediaType: detail.mediaType,
        detail: detail as Prisma.InputJsonValue,
        raw: detail.raw as Prisma.InputJsonValue,
        fetchedAt,
      },
    });
  }

  async getTorrentSearchCache(
    eventId: string,
    quality: TorrentSearchQuality,
    now: Date,
  ): Promise<{
    results: TorrentResult[];
    warning: string | null;
    hasSearchMetadata: boolean;
  } | null> {
    const cache = await this.prisma.torrentSearchCache.findUnique({
      where: { cacheKey: torrentCacheKey(eventId, quality) },
    });
    if (!cache || cache.expiresAt <= now) return null;

    const raw = isRecord(cache.raw) ? cache.raw : {};
    return {
      results: cache.results as TorrentResult[],
      warning: typeof raw.warning === "string" ? raw.warning : null,
      hasSearchMetadata: Object.hasOwn(raw, "warning"),
    };
  }

  async saveTorrentSearchCache(input: {
    eventId: string;
    quality: TorrentSearchQuality;
    results: TorrentResult[];
    raw: unknown;
    fetchedAt: Date;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.torrentSearchCache.upsert({
      where: { cacheKey: torrentCacheKey(input.eventId, input.quality) },
      create: {
        cacheKey: torrentCacheKey(input.eventId, input.quality),
        eventId: input.eventId,
        quality: input.quality,
        results: input.results as Prisma.InputJsonValue,
        raw: input.raw as Prisma.InputJsonValue,
        fetchedAt: input.fetchedAt,
        expiresAt: input.expiresAt,
      },
      update: {
        results: input.results as Prisma.InputJsonValue,
        raw: input.raw as Prisma.InputJsonValue,
        fetchedAt: input.fetchedAt,
        expiresAt: input.expiresAt,
      },
    });
  }

  async saveDownloadRecord(input: {
    userId: number;
    releaseEventId: string;
    tmdbId: number | null;
    title: string;
    transmissionTorrentId: number | null;
    torrentName: string;
    magnetLink: string;
    magnetHash: string | null;
    downloadDir: string;
    status: DownloadRecordSnapshot["status"];
  }): Promise<DownloadRecordSnapshot> {
    const record = await this.prisma.downloadRecord.create({ data: input });
    return mapDownloadRecord(record);
  }

  async getDownloadRecords(userId?: number): Promise<DownloadRecordSnapshot[]> {
    const records = await this.prisma.downloadRecord.findMany({
      where: typeof userId === "number" ? { userId } : undefined,
      orderBy: { updatedAt: "desc" },
    });
    return records.map(mapDownloadRecord);
  }

  async findDownloadRecordByMagnet(
    userId: number,
    magnetLink: string,
    magnetHash: string | null,
  ): Promise<DownloadRecordSnapshot | null> {
    const record = await this.prisma.downloadRecord.findFirst({
      where: {
        userId,
        OR: [
          ...(magnetHash ? [{ magnetHash }] : []),
          { magnetLink },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    return record ? mapDownloadRecord(record) : null;
  }

  async markDownloadRecordsCompleted(
    transmissionTorrentId: number,
    completedAt: Date,
  ): Promise<number> {
    const result = await this.prisma.downloadRecord.updateMany({
      where: {
        transmissionTorrentId,
        status: { not: "completed" },
      },
      data: {
        status: "completed",
        completedAt,
      },
    });
    return result.count;
  }

  async deleteDownloadRecord(userId: number, id: number): Promise<boolean> {
    const result = await this.prisma.downloadRecord.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  }
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSourceType(value: string): NormalizedRelease["sourceType"] {
  if (["sub", "purchase", "free", "tve", "digital"].includes(value)) {
    return value as NormalizedRelease["sourceType"];
  }

  return "unknown";
}

function mapReleaseEvent(event: {
  id: string;
  releaseDate: Date;
  seasonNumber: number | null;
  isOriginal: boolean;
  raw: unknown;
  title: {
    watchmodeId: number;
    title: string;
    titleType: string;
    mediaType: string;
    tmdbId: number | null;
    tmdbType: string | null;
    imdbId: string | null;
    posterUrl: string | null;
  };
  source: {
    watchmodeId: number;
    name: string;
  };
}): NormalizedRelease {
  const raw = isRecord(event.raw) ? event.raw : {};
  return {
    eventId: event.id,
    watchmodeId: event.title.watchmodeId,
    releaseSource: raw.releaseSource === "tmdb" ? "tmdb" : "watchmode",
    releaseKind: raw.releaseKind === "digital" ? "digital" : "streaming",
    title: event.title.title,
    titleType: event.title.titleType,
    mediaType: event.title.mediaType === "tv" ? "tv" : "movie",
    tmdbId: event.title.tmdbId,
    tmdbType: event.title.tmdbType,
    imdbId: event.title.imdbId,
    posterUrl: event.title.posterUrl,
    releaseDate: toDateOnly(event.releaseDate),
    sourceId: event.source.watchmodeId,
    sourceName: event.source.name,
    sourceType: typeof raw.sourceType === "string" ? normalizeSourceType(raw.sourceType) : "unknown",
    seasonNumber: event.seasonNumber,
    isOriginal: event.isOriginal,
    originalLanguage: typeof raw.originalLanguage === "string" ? raw.originalLanguage : null,
    isInternational: raw.isInternational === true,
    isDubbed: raw.isDubbed === true,
  };
}

function mapTmdbTvAiring(airing: {
  eventId: string;
  tmdbId: number;
  title: string;
  titleType: string;
  posterUrl: string | null;
  releaseDate: Date;
  firstAirDate: Date | null;
  providerId: number;
  providerName: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
  imdbId: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  originalLanguage: string | null;
  isInternational: boolean;
  isDubbed: boolean;
  raw: unknown;
}): NormalizedRelease {
  return {
    eventId: airing.eventId,
    watchmodeId: airing.tmdbId,
    releaseSource: "tmdb",
    releaseKind: "streaming",
    title: airing.title,
    titleType: airing.titleType,
    mediaType: "tv",
    tmdbId: airing.tmdbId,
    tmdbType: "tv",
    imdbId: airing.imdbId,
    posterUrl: airing.posterUrl,
    releaseDate: toDateOnly(airing.releaseDate),
    sourceId: airing.providerId,
    sourceName: airing.providerName,
    sourceType: "sub",
    seasonNumber: airing.seasonNumber,
    episodeNumber: airing.episodeNumber,
    episodeName: airing.episodeName,
    isOriginal: false,
    primaryReleaseDate: airing.firstAirDate ? toDateOnly(airing.firstAirDate) : null,
    popularity: airing.popularity,
    voteAverage: airing.voteAverage,
    voteCount: airing.voteCount,
    originalLanguage: airing.originalLanguage,
    isInternational: airing.isInternational,
    isDubbed: airing.isDubbed,
  };
}

function torrentCacheKey(eventId: string, quality: TorrentSearchQuality): string {
  return `torrent:${eventId}:${quality}`;
}

function mapDownloadRecord(record: {
  id: number;
  userId: number | null;
  releaseEventId: string;
  tmdbId: number | null;
  title: string | null;
  transmissionTorrentId: number | null;
  torrentName: string;
  magnetLink: string;
  magnetHash: string | null;
  downloadDir: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): DownloadRecordSnapshot {
  return {
    id: record.id,
    userId: record.userId,
    releaseEventId: record.releaseEventId,
    tmdbId: record.tmdbId,
    title: record.title,
    transmissionTorrentId: record.transmissionTorrentId,
    torrentName: record.torrentName,
    magnetLink: record.magnetLink,
    magnetHash: record.magnetHash,
    downloadDir: record.downloadDir,
    status: normalizeDownloadStatus(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  };
}

function normalizeDownloadStatus(status: string): DownloadRecordSnapshot["status"] {
  if (status === "downloaded" || status === "completed" || status === "canceled") return status;
  return "pending";
}
