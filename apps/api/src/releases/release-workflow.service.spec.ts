import { describe, expect, it, vi } from "vitest";
import type { DownloadRecordSnapshot, ReleaseRepository } from "./release.repository";
import { ReleaseWorkflowService } from "./release-workflow.service";
import type { NormalizedRelease } from "./release.types";
import type { TransmissionDownload } from "../downloads/download.types";
import type { TransmissionRpcClient } from "../downloads/transmission-rpc.client";

describe("ReleaseWorkflowService torrent search", () => {
  it("returns warnings from fresh torrent-search cache entries", async () => {
    const repository = createRepository({
      getTorrentSearchCache: vi.fn(async () => ({
        results: [],
        warning: "Prowlarr is configured but has no enabled indexers.",
        hasSearchMetadata: true,
      })),
    });
    const prowlarr = createProwlarr();
    const service = createService(repository, prowlarr);

    await expect(service.searchTorrents("event-1", "any")).resolves.toEqual({
      results: [],
      warning: "Prowlarr is configured but has no enabled indexers.",
    });
    expect(repository.getReleaseByEventId).not.toHaveBeenCalled();
    expect(prowlarr.searchRelease).not.toHaveBeenCalled();
  });

  it("refreshes legacy empty torrent-search cache entries without warning metadata", async () => {
    const repository = createRepository({
      getTorrentSearchCache: vi.fn(async () => ({
        results: [],
        warning: null,
        hasSearchMetadata: false,
      })),
      getReleaseByEventId: vi.fn(async () => release()),
    });
    const prowlarr = createProwlarr({
      searchRelease: vi.fn(async () => ({
        results: [],
        warning: "Prowlarr is configured but has no enabled indexers.",
      })),
    });
    const service = createService(repository, prowlarr);

    await expect(service.searchTorrents("event-1", "any")).resolves.toEqual({
      results: [],
      warning: "Prowlarr is configured but has no enabled indexers.",
    });
    expect(prowlarr.searchRelease).toHaveBeenCalledWith(release(), "any");
    expect(repository.saveTorrentSearchCache).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        quality: "any",
        raw: {
          count: 0,
          warning: "Prowlarr is configured but has no enabled indexers.",
        },
      }),
    );
  });

  it("hydrates trackerless magnets through Prowlarr before adding to Transmission", async () => {
    const bareMagnet = "magnet:?xt=urn:btih:58f7d7fd68a324f7b2ce038e6f353597216103bf&dn=GOAT%202026";
    const fullMagnet = `${bareMagnet}&tr=udp%3A%2F%2Ftracker.example%3A1337%2Fannounce`;
    const repository = createRepository({
      getReleaseByEventId: vi.fn(async () => release()),
    });
    const prowlarr = createProwlarr({
      resolveMagnetForRelease: vi.fn(async () => fullMagnet),
    });
    const transmission = {
      addMagnet: vi.fn(async () => ({ id: 44, name: "GOAT", hashString: "58f7", duplicate: false })),
      getDownloads: vi.fn(async () => []),
    };
    const service = createService(repository, prowlarr, transmission);

    await service.addDownload(7, "event-1", {
      magnetLink: bareMagnet,
      downloadDir: "/data/Movies/Sourced",
    });

    expect(prowlarr.resolveMagnetForRelease).toHaveBeenCalledWith(release(), bareMagnet);
    expect(transmission.addMagnet).toHaveBeenCalledWith(fullMagnet, "/data/Movies/Sourced");
  });

  it("records user-scoped download history and warns when the same magnet was already added", async () => {
    const magnetLink = "magnet:?xt=urn:btih:ABCDEF1234567890&dn=Movie";
    const repository = createRepository({
      getReleaseByEventId: vi.fn(async () => release({ tmdbId: 321, title: "Known Movie" })),
      findDownloadRecordByMagnet: vi.fn(async () => downloadRecord({ createdAt: new Date("2026-05-15T10:00:00.000Z") })),
    });
    const transmission = {
      addMagnet: vi.fn(async () => ({ id: 44, name: "Known Movie", hashString: "abcdef1234567890", duplicate: false })),
      getDownloads: vi.fn(async () => []),
    };
    const service = createService(repository, createProwlarr(), transmission);

    const response = await service.addDownload(7, "event-1", {
      magnetLink,
      downloadDir: "/data/Movies/Sourced",
    });

    expect(repository.findDownloadRecordByMagnet).toHaveBeenCalledWith(7, magnetLink, "abcdef1234567890");
    expect(repository.saveDownloadRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        releaseEventId: "event-1",
        tmdbId: 321,
        title: "Known Movie",
        magnetLink,
        magnetHash: "abcdef1234567890",
        status: "pending",
      }),
    );
    expect(response.warning).toContain("already added");
  });

  it("lists download history with downloaded status derived from active Transmission progress", async () => {
    const repository = createRepository({
      getDownloadRecords: vi.fn(async () => [
        downloadRecord({ id: 1, transmissionTorrentId: 44, status: "pending" }),
        downloadRecord({ id: 2, transmissionTorrentId: 45, status: "completed" }),
      ]),
    });
    const transmission = {
      addMagnet: vi.fn(),
      getDownloads: vi.fn(async () => [
        transmissionDownload({ id: 44, percentDone: 1, rawStatus: 6, status: "seeding" }),
      ]),
    };
    const service = createService(repository, createProwlarr(), transmission);

    await expect(service.getDownloadHistory(7)).resolves.toEqual([
      expect.objectContaining({ id: 1, status: "downloaded" }),
      expect.objectContaining({ id: 2, status: "completed" }),
    ]);
    expect(repository.getDownloadRecords).toHaveBeenCalledWith(7);
  });
});

function createService(
  repository: ReleaseRepository,
  prowlarr = createProwlarr(),
  transmission: Pick<TransmissionRpcClient, "addMagnet" | "getDownloads"> = {
    addMagnet: vi.fn(),
    getDownloads: vi.fn(async () => []),
  },
) {
  return new ReleaseWorkflowService(
    repository,
    {
      isConfigured: vi.fn(() => false),
      getMovieDetail: vi.fn(),
      getTvDetail: vi.fn(),
      getTvSeasonDetail: vi.fn(),
      getPersonExternalIds: vi.fn(),
    },
    prowlarr,
    transmission,
    () => new Date("2026-05-16T12:00:00.000Z"),
  );
}

function createRepository(overrides: Partial<ReleaseRepository> = {}): ReleaseRepository {
  return {
    getFetchCoveringWeek: vi.fn(),
    getWeekReleases: vi.fn(),
    saveWatchModeFetch: vi.fn(),
    getTmdbDigitalWeekCache: vi.fn(),
    getTmdbDigitalMovies: vi.fn(),
    saveTmdbDigitalWeek: vi.fn(),
    getTmdbTvWeekCache: vi.fn(),
    getTmdbTvAirings: vi.fn(),
    saveTmdbTvWeek: vi.fn(),
    getReleaseByEventId: vi.fn(),
    getReleaseDetail: vi.fn(),
    saveReleaseDetail: vi.fn(),
    getTorrentSearchCache: vi.fn(async () => null),
    saveTorrentSearchCache: vi.fn(async () => undefined),
    saveDownloadRecord: vi.fn(async () => downloadRecord()),
    getDownloadRecords: vi.fn(async () => []),
    findDownloadRecordByMagnet: vi.fn(async () => null),
    markDownloadRecordsCompleted: vi.fn(async () => 0),
    deleteDownloadRecord: vi.fn(async () => false),
    ...overrides,
  };
}

function createProwlarr(overrides: Record<string, unknown> = {}) {
  return {
    isConfigured: vi.fn(() => true),
    searchRelease: vi.fn(async () => ({ results: [], warning: null })),
    resolveMagnetForRelease: vi.fn(async (_release: NormalizedRelease, magnetLink: string) => magnetLink),
    ...overrides,
  };
}

function release(overrides: Partial<NormalizedRelease> = {}): NormalizedRelease {
  return {
    eventId: "event-1",
    watchmodeId: 1,
    releaseSource: "tmdb",
    releaseKind: "digital",
    title: "Movie",
    mediaType: "movie",
    titleType: "movie",
    tmdbId: 1,
    tmdbType: "movie",
    imdbId: null,
    posterUrl: null,
    releaseDate: "2026-05-12",
    sourceId: 0,
    sourceName: "Digital release",
    sourceType: "digital",
    seasonNumber: null,
    isOriginal: false,
    primaryReleaseDate: "2026-05-12",
    popularity: 10,
    voteCount: 100,
    isFeaturedDigital: true,
    ...overrides,
  };
}

function downloadRecord(overrides: Partial<DownloadRecordSnapshot> = {}): DownloadRecordSnapshot {
  return {
    ...baseDownloadRecord(),
    ...overrides,
  };
}

function baseDownloadRecord(): DownloadRecordSnapshot {
  return {
    id: 1,
    userId: 7,
    releaseEventId: "event-1",
    tmdbId: 321,
    title: "Known Movie",
    transmissionTorrentId: 44,
    torrentName: "Known Movie 1080p",
    magnetLink: "magnet:?xt=urn:btih:ABCDEF1234567890&dn=Movie",
    magnetHash: "abcdef1234567890",
    downloadDir: "/data/Movies/Sourced",
    status: "pending" as const,
    createdAt: new Date("2026-05-15T10:00:00.000Z"),
    updatedAt: new Date("2026-05-15T10:00:00.000Z"),
    completedAt: null,
  };
}

function transmissionDownload(overrides: Partial<TransmissionDownload>): TransmissionDownload {
  return {
    id: 44,
    name: "Known Movie",
    status: "downloading",
    rawStatus: 4,
    percentDone: 0,
    rateDownload: 0,
    rateUpload: 0,
    eta: -1,
    downloadDir: "/data/Movies/Sourced",
    totalSize: 0,
    downloadedEver: 0,
    uploadedEver: 0,
    leftUntilDone: 0,
    peersConnected: 0,
    peersSendingToUs: 0,
    peersGettingFromUs: 0,
    uploadRatio: 0,
    errorString: null,
    labels: [],
    magnetLink: null,
    ...overrides,
  };
}
