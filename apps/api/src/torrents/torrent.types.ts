export type TorrentQuality = "2160p" | "1080p" | "720p" | "480p" | "unknown";
export type TorrentSearchQuality = "2160p" | "1080p" | "any";

export type TorrentResult = {
  id: string;
  title: string;
  indexer: string;
  magnetLink: string;
  sizeBytes: number | null;
  seeders: number;
  leechers: number;
  quality: TorrentQuality;
  publishedAt: string | null;
  confidence: number;
};
