import type { TorrentQuality, TorrentResult, TransmissionDownload } from "./release.models";

export type TorrentSortKey = "seeders" | "size" | "quality" | "confidence";

export function sortTorrents(
  torrents: TorrentResult[],
  sortKey: TorrentSortKey,
): TorrentResult[] {
  return [...torrents].sort((a, b) => {
    const qualityGroup = unknownQualityRank(a) - unknownQualityRank(b);
    if (qualityGroup !== 0) return qualityGroup;

    if (sortKey === "size") return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
    if (sortKey === "quality") return qualityRank(b.quality) - qualityRank(a.quality);
    if (sortKey === "confidence") return b.confidence - a.confidence;
    return b.seeders - a.seeders;
  });
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 85) return "High";
  if (confidence >= 65) return "Medium";
  return "Low";
}

export function confidenceTone(confidence: number): string {
  if (confidence >= 85) return "confidence-high";
  if (confidence >= 65) return "confidence-medium";
  return "confidence-low";
}

export function qualityTone(quality: TorrentQuality): string {
  return `quality-${quality}`;
}

export function formatBytes(value: number | null): string {
  if (value === null) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit < 3 ? 0 : 1)} ${units[unit]}`;
}

export function formatRate(bytesPerSecond: number | null): string {
  const value = bytesPerSecond ?? 0;
  if (value <= 0) return "0 B/s";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  const decimals = unit >= 2 ? 1 : 0;
  return `${size.toFixed(decimals)} ${units[unit]}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "Unknown";
  if (seconds === 0) return "Now";

  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "less than 1m";
}

export function formatPeers(
  download: Pick<TransmissionDownload, "peersConnected" | "peersSendingToUs">,
): string {
  return `${download.peersSendingToUs}/${download.peersConnected}`;
}

export function magnetPreview(magnetLink: string): string {
  const match = magnetLink.match(/btih:([^&]+)/i);
  return match ? `btih:${match[1].slice(0, 12)}...` : "magnet link";
}

export function formatTorrentAge(publishedAt: string | null, now = new Date()): string {
  if (!publishedAt) return "posted date unknown";
  const published = new Date(publishedAt);
  if (!Number.isFinite(published.getTime())) return "posted date unknown";

  const elapsedMs = Math.max(now.getTime() - published.getTime(), 0);
  const minutes = Math.max(Math.round(elapsedMs / 60_000), 1);
  if (minutes < 60) return `posted ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `posted ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `posted ${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 24) return `posted ${months}mo ago`;
  const years = Math.round(months / 12);
  return `posted ${years}y ago`;
}

function qualityRank(quality: TorrentQuality): number {
  return { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, unknown: 0 }[quality];
}

function unknownQualityRank(torrent: TorrentResult): number {
  return torrent.quality === "unknown" ? 1 : 0;
}
