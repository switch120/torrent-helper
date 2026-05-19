import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PROWLARR_CLIENT, RELEASE_REPOSITORY, TMDB_CLIENT, TRANSMISSION_CLIENT } from "./release.tokens";
import type { ReleaseRepository } from "./release.repository";
import type { ReleaseDetail } from "./release-detail.types";
import { applyCastExternalIds, mapTmdbMovieDetail, mapTmdbTvDetail } from "./tmdb-detail.mapper";
import type { TmdbClient } from "./tmdb.client";
import type { ProwlarrClient } from "../torrents/prowlarr.client";
import type { TorrentResult, TorrentSearchQuality } from "../torrents/torrent.types";
import type { TransmissionRpcClient } from "../downloads/transmission-rpc.client";
import { validateDownloadDir } from "../downloads/download-path";
import { buildDownloadStatus, extractProxyIp, isProxyCheckerDownload } from "../downloads/download-status";
import type {
  AddDownloadResponse,
  DownloadDuplicateResponse,
  DownloadHistoryEntry,
  DownloadHistoryStatus,
  DownloadListResponse,
  TransmissionDownload,
} from "../downloads/download.types";
import { extractMagnetHash } from "../downloads/magnet-link";
import { PublicIpResolver } from "../downloads/public-ip-resolver";

type Clock = () => Date;

@Injectable()
export class ReleaseWorkflowService {
  constructor(
    @Inject(RELEASE_REPOSITORY) private readonly repository: ReleaseRepository,
    @Inject(TMDB_CLIENT) private readonly tmdb: Pick<TmdbClient, "isConfigured" | "getMovieDetail" | "getTvDetail" | "getTvSeasonDetail" | "getPersonExternalIds">,
    @Inject(PROWLARR_CLIENT) private readonly prowlarr: Pick<ProwlarrClient, "isConfigured" | "searchRelease" | "resolveMagnetForRelease">,
    @Inject(TRANSMISSION_CLIENT) private readonly transmission: Pick<TransmissionRpcClient, "addMagnet" | "getDownloads">,
    private readonly clock: Clock = () => new Date(),
    private readonly publicIpResolver: Pick<PublicIpResolver, "getPublicIp"> = new PublicIpResolver(),
  ) {}

  async getDetail(eventId: string): Promise<ReleaseDetail> {
    const cached = await this.repository.getReleaseDetail(eventId);
    if (cached) {
      const enriched = await this.withCastExternalIds(cached);
      if (enriched !== cached) {
        await this.repository.saveReleaseDetail(enriched, this.clock());
      }
      return enriched;
    }

    const release = await this.getRelease(eventId);
    if (!release.tmdbId || !this.tmdb.isConfigured()) {
      return {
        eventId: release.eventId,
        release,
        title: release.title,
        mediaType: release.mediaType,
        overview: null,
        posterUrl: release.posterUrl,
        backdropUrl: null,
        releaseDate: release.releaseDate,
        primaryReleaseDate: release.primaryReleaseDate || release.releaseDate,
        seasonNumber: release.seasonNumber,
        episodeCount: null,
        runtimeMinutes: null,
        genres: [],
        cast: [],
        imdbId: release.imdbId,
        tmdbId: release.tmdbId,
        originalLanguage: release.originalLanguage ?? null,
        isInternational: release.isInternational === true,
        isDubbed: release.isDubbed === true,
        raw: { fallback: true },
      };
    }

    const detail =
      release.mediaType === "tv"
        ? await this.getTvDetail(release)
        : mapTmdbMovieDetail(release, await this.tmdb.getMovieDetail(release.tmdbId));

    const enriched = await this.withCastExternalIds(detail);
    await this.repository.saveReleaseDetail(enriched, this.clock());
    return enriched;
  }

  async searchTorrents(
    eventId: string,
    quality: TorrentSearchQuality = "any",
  ): Promise<{ results: TorrentResult[]; warning: string | null }> {
    const normalizedQuality = normalizeQuality(quality);
    const now = this.clock();
    const cached = await this.repository.getTorrentSearchCache(eventId, normalizedQuality, now);
    if (cached && (cached.results.length > 0 || cached.hasSearchMetadata || !this.prowlarr.isConfigured())) {
      return { results: cached.results, warning: cached.warning };
    }

    const release = await this.getRelease(eventId);
    if (!this.prowlarr.isConfigured()) {
      return { results: [], warning: "Prowlarr is not configured." };
    }

    const search = await this.prowlarr.searchRelease(release, normalizedQuality);
    await this.repository.saveTorrentSearchCache({
      eventId,
      quality: normalizedQuality,
      results: search.results,
      raw: { count: search.results.length, warning: search.warning },
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    });
    return search;
  }

  async addDownload(
    userId: number,
    eventId: string,
    input: { magnetLink?: string; downloadDir?: string },
  ): Promise<AddDownloadResponse> {
    const release = await this.getRelease(eventId);
    const magnetLink = input.magnetLink || "";
    if (!magnetLink.startsWith("magnet:")) {
      throw new BadRequestException("A magnet link is required.");
    }
    let downloadDir: string;
    try {
      downloadDir = validateDownloadDir(input.downloadDir || "/data/Movies/Sourced");
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid download directory.");
    }
    const inputHash = extractMagnetHash(magnetLink);
    let duplicateRecord = await this.repository.findDownloadRecordByMagnet(userId, magnetLink, inputHash);
    const resolvedMagnetLink = await this.prowlarr.resolveMagnetForRelease(release, magnetLink);
    const resolvedHash = extractMagnetHash(resolvedMagnetLink);
    if (!duplicateRecord && (resolvedMagnetLink !== magnetLink || resolvedHash !== inputHash)) {
      duplicateRecord = await this.repository.findDownloadRecordByMagnet(userId, resolvedMagnetLink, resolvedHash);
    }
    const added = await this.transmission.addMagnet(resolvedMagnetLink, downloadDir);
    const historyRecord = await this.repository.saveDownloadRecord({
      userId,
      releaseEventId: eventId,
      tmdbId: release.tmdbId,
      title: release.title,
      transmissionTorrentId: added.id,
      torrentName: added.name,
      magnetLink: resolvedMagnetLink,
      magnetHash: added.hashString || resolvedHash,
      downloadDir,
      status: "pending",
    });

    const downloads = await this.listDownloads(userId);
    return {
      download: downloads.find((download) => download.id === added.id) || null,
      historyRecord: this.toHistoryEntry(historyRecord, downloads.find((download) => download.id === added.id) || null),
      duplicate: Boolean(duplicateRecord),
      warning: duplicateRecord ? duplicateWarning(duplicateRecord.createdAt) : null,
    };
  }

  async listDownloads(userId?: number): Promise<TransmissionDownload[]> {
    const [downloads, records] = await Promise.all([
      this.transmission.getDownloads(),
      this.repository.getDownloadRecords(userId),
    ]);
    const byTorrentId = new Map(records.map((record) => [record.transmissionTorrentId, record]));
    return downloads.map((download) => ({
      ...download,
      releaseEventId: byTorrentId.get(download.id)?.releaseEventId || null,
    }));
  }

  async getDownloadStatus(userId?: number): Promise<DownloadListResponse> {
    const downloads = await this.listDownloads(userId);
    const proxyChecker = downloads.find(isProxyCheckerDownload) || null;
    const proxyIp = proxyChecker ? extractProxyIp(proxyChecker.errorString) : null;
    const publicIp = proxyIp
      ? await this.publicIpResolver.getPublicIp(this.clock()).catch(() => null)
      : null;
    return buildDownloadStatus(downloads, publicIp, this.clock());
  }

  async getDownloadHistory(userId: number): Promise<DownloadHistoryEntry[]> {
    const [downloads, records] = await Promise.all([
      this.transmission.getDownloads(),
      this.repository.getDownloadRecords(userId),
    ]);
    const activeDownloads = new Map(downloads.map((download) => [download.id, download]));
    return records.map((record) => this.toHistoryEntry(
      record,
      record.transmissionTorrentId ? activeDownloads.get(record.transmissionTorrentId) || null : null,
    ));
  }

  async getDownloadDuplicate(
    userId: number,
    magnetLink: string,
  ): Promise<DownloadDuplicateResponse> {
    if (!magnetLink.startsWith("magnet:")) {
      throw new BadRequestException("A magnet link is required.");
    }
    const record = await this.repository.findDownloadRecordByMagnet(
      userId,
      magnetLink,
      extractMagnetHash(magnetLink),
    );
    return {
      duplicate: Boolean(record),
      historyRecord: record ? this.toHistoryEntry(record, null) : null,
      warning: record ? duplicateWarning(record.createdAt) : null,
    };
  }

  async deleteDownloadHistory(userId: number, id: number): Promise<{ deleted: boolean }> {
    return { deleted: await this.repository.deleteDownloadRecord(userId, id) };
  }

  private async getTvDetail(release: Awaited<ReturnType<ReleaseWorkflowService["getRelease"]>>): Promise<ReleaseDetail> {
    if (!release.tmdbId) throw new NotFoundException("Release does not have a TMDB id.");
    const [detail, season] = await Promise.all([
      this.tmdb.getTvDetail(release.tmdbId),
      release.seasonNumber
        ? this.tmdb.getTvSeasonDetail(release.tmdbId, release.seasonNumber).catch(() => null)
        : Promise.resolve(null),
    ]);
    return mapTmdbTvDetail(release, detail, season);
  }

  private async withCastExternalIds(detail: ReleaseDetail): Promise<ReleaseDetail> {
    if (!this.tmdb.isConfigured()) return detail;
    const missingMembers = detail.cast.filter((member) => member.id > 0 && !member.imdbUrl);
    if (missingMembers.length === 0) return detail;

    const entries = await Promise.all(
      missingMembers.map(async (member) => {
        try {
          const externalIds = await this.tmdb.getPersonExternalIds(member.id);
          return [member.id, externalIds.imdb_id || null] as const;
        } catch {
          return [member.id, null] as const;
        }
      }),
    );

    return applyCastExternalIds(detail, new Map(entries));
  }

  private async getRelease(eventId: string) {
    const release = await this.repository.getReleaseByEventId(eventId);
    if (!release) throw new NotFoundException("Release was not found.");
    return release;
  }

  private toHistoryEntry(
    record: Awaited<ReturnType<ReleaseRepository["getDownloadRecords"]>>[number],
    activeDownload: TransmissionDownload | null,
  ): DownloadHistoryEntry {
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
      status: resolveHistoryStatus(record.status, activeDownload),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
    };
  }
}

function normalizeQuality(quality: string): TorrentSearchQuality {
  if (quality === "1080p" || quality === "2160p" || quality === "any") return quality;
  throw new BadRequestException("Quality must be 1080p, 2160p, or any.");
}

function resolveHistoryStatus(
  storedStatus: DownloadHistoryStatus,
  activeDownload: TransmissionDownload | null,
): DownloadHistoryStatus {
  if (storedStatus === "completed" || storedStatus === "canceled") return storedStatus;
  if (activeDownload && (activeDownload.percentDone >= 1 || activeDownload.rawStatus === 6)) return "downloaded";
  return storedStatus;
}

function duplicateWarning(createdAt: Date): string {
  return `This magnet was already added on ${createdAt.toISOString().slice(0, 10)}.`;
}
