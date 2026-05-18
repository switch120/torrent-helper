import { describe, expect, it } from "vitest";
import { confidenceLabel, confidenceTone, formatBytes, formatEta, formatPeers, formatRate, formatTorrentAge, qualityTone, sortTorrents } from "./torrent.utils";
import type { TorrentResult } from "./release.models";

describe("torrent utilities", () => {
  it("sorts torrents by seeders, size, and quality", () => {
    const torrents = [
      torrent({ title: "Small 1080p", seeders: 10, sizeBytes: 2, quality: "1080p" }),
      torrent({ title: "Large 2160p", seeders: 5, sizeBytes: 10, quality: "2160p" }),
    ];

    expect(sortTorrents(torrents, "seeders")[0].title).toBe("Small 1080p");
    expect(sortTorrents(torrents, "size")[0].title).toBe("Large 2160p");
    expect(sortTorrents(torrents, "quality")[0].title).toBe("Large 2160p");
  });

  it("keeps unknown quality torrents at the bottom for every sort", () => {
    const torrents = [
      torrent({ title: "Unknown high seed", seeders: 500, sizeBytes: 40, quality: "unknown", confidence: 100 }),
      torrent({ title: "Known low seed", seeders: 1, sizeBytes: 1, quality: "720p", confidence: 1 }),
    ];

    expect(sortTorrents(torrents, "seeders").map((torrent) => torrent.title)).toEqual([
      "Known low seed",
      "Unknown high seed",
    ]);
    expect(sortTorrents(torrents, "size").map((torrent) => torrent.title)).toEqual([
      "Known low seed",
      "Unknown high seed",
    ]);
    expect(sortTorrents(torrents, "confidence").map((torrent) => torrent.title)).toEqual([
      "Known low seed",
      "Unknown high seed",
    ]);
  });

  it("labels confidence scores", () => {
    expect(confidenceLabel(91)).toBe("High");
    expect(confidenceTone(91)).toBe("confidence-high");
    expect(confidenceLabel(74)).toBe("Medium");
    expect(confidenceTone(74)).toBe("confidence-medium");
    expect(confidenceLabel(45)).toBe("Low");
    expect(confidenceTone(45)).toBe("confidence-low");
  });

  it("returns quality tone classes", () => {
    expect(qualityTone("2160p")).toBe("quality-2160p");
    expect(qualityTone("1080p")).toBe("quality-1080p");
    expect(qualityTone("720p")).toBe("quality-720p");
    expect(qualityTone("unknown")).toBe("quality-unknown");
  });

  it("formats file sizes and torrent age", () => {
    expect(formatBytes(5_368_709_120)).toBe("5.0 GB");
    expect(formatTorrentAge("2026-05-16T13:00:00.000Z", new Date("2026-05-16T14:30:00.000Z"))).toBe("posted 2h ago");
    expect(formatTorrentAge("2026-05-14T14:00:00.000Z", new Date("2026-05-16T14:30:00.000Z"))).toBe("posted 2d ago");
    expect(formatTorrentAge(null)).toBe("posted date unknown");
  });

  it("formats active download telemetry", () => {
    expect(formatRate(1_572_864)).toBe("1.5 MB/s");
    expect(formatRate(0)).toBe("0 B/s");
    expect(formatEta(3661)).toBe("1h 1m");
    expect(formatEta(-1)).toBe("Unknown");
    expect(formatPeers({ peersSendingToUs: 3, peersConnected: 12 })).toBe("3/12");
    expect(formatPeers({ peersSendingToUs: 0, peersConnected: 0 })).toBe("0/0");
  });
});

function torrent(overrides: Partial<TorrentResult>): TorrentResult {
  return {
    id: "id",
    title: "Torrent",
    indexer: "Indexer",
    magnetLink: "magnet:?xt=urn:btih:abc",
    sizeBytes: 1,
    seeders: 1,
    leechers: 0,
    quality: "unknown",
    publishedAt: null,
    confidence: 1,
    ...overrides,
  };
}
