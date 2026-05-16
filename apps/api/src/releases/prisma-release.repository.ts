import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ReleaseRepository,
  SaveTmdbDigitalWeekInput,
  SaveWatchModeFetchInput,
  TmdbDigitalWeekCacheSnapshot,
} from "./release.repository";
import type { FetchCacheSnapshot, NormalizedRelease } from "./release.types";

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

    return events.map((event) => {
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
      };
    });
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
        isFeaturedDigital: movie.isFeaturedDigital,
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
            voteCount: release.voteCount,
            isFeaturedDigital: Boolean(release.isFeaturedDigital),
            raw: release as Prisma.InputJsonValue,
          },
          update: {
            tmdbId: release.tmdbId || release.watchmodeId,
            title: release.title,
            posterUrl: release.posterUrl,
            releaseDate: toDate(release.releaseDate),
            primaryReleaseDate: release.primaryReleaseDate ? toDate(release.primaryReleaseDate) : null,
            popularity: release.popularity,
            voteCount: release.voteCount,
            isFeaturedDigital: Boolean(release.isFeaturedDigital),
            raw: release as Prisma.InputJsonValue,
          },
        });
      }
    });
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
