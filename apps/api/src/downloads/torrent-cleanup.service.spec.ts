import { describe, expect, it, vi } from "vitest";
import { TorrentCleanupService } from "./torrent-cleanup.service";
import type { TransmissionDownload } from "./download.types";

describe("TorrentCleanupService", () => {
  it("removes completed Transmission torrents without touching active downloads", async () => {
    const transmission = {
      getDownloads: vi.fn(async () => [
        download({ id: 1, rawStatus: 4, status: "downloading" }),
        download({ id: 2, rawStatus: 6, status: "seeding" }),
        download({ id: 3, rawStatus: 0, status: "stopped" }),
      ]),
      removeTorrent: vi.fn(async () => undefined),
    };
    const repository = createRepository();
    const service = new TorrentCleanupService(transmission, repository);

    await service.cleanupCompletedTorrents();

    expect(repository.markDownloadRecordsCompleted).toHaveBeenCalledWith(2, expect.any(Date));
    expect(transmission.removeTorrent).toHaveBeenCalledTimes(1);
    expect(transmission.removeTorrent).toHaveBeenCalledWith(2);
  });

  it("does not overlap cleanup runs when Transmission is slow", async () => {
    const deferredDownloads = deferred<TransmissionDownload[]>();
    const transmission = {
      getDownloads: vi.fn(() => deferredDownloads.promise),
      removeTorrent: vi.fn(async () => undefined),
    };
    const service = new TorrentCleanupService(transmission, createRepository());

    const firstRun = service.cleanupCompletedTorrents();
    const secondRun = service.cleanupCompletedTorrents();
    deferredDownloads.resolve([download({ id: 9, rawStatus: 6, status: "seeding" })]);

    await Promise.all([firstRun, secondRun]);

    expect(transmission.getDownloads).toHaveBeenCalledTimes(1);
    expect(transmission.removeTorrent).toHaveBeenCalledWith(9);
  });
});

function createRepository() {
  return {
    markDownloadRecordsCompleted: vi.fn(async () => 0),
  };
}

function download(overrides: Partial<TransmissionDownload>): TransmissionDownload {
  return {
    id: 1,
    name: "Torrent",
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
