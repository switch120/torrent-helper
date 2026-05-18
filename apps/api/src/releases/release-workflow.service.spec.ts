import { describe, expect, it, vi } from "vitest";
import type { ReleaseRepository } from "./release.repository";
import { ReleaseWorkflowService } from "./release-workflow.service";
import type { NormalizedRelease } from "./release.types";

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

    await service.addDownload("event-1", {
      magnetLink: bareMagnet,
      downloadDir: "/data/Movies/Sourced",
    });

    expect(prowlarr.resolveMagnetForRelease).toHaveBeenCalledWith(release(), bareMagnet);
    expect(transmission.addMagnet).toHaveBeenCalledWith(fullMagnet, "/data/Movies/Sourced");
  });
});

function createService(
  repository: ReleaseRepository,
  prowlarr = createProwlarr(),
  transmission = {
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
    saveDownloadRecord: vi.fn(),
    getDownloadRecords: vi.fn(async () => []),
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

function release(): NormalizedRelease {
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
  };
}
