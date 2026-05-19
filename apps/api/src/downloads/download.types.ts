export type DownloadStatus =
  | "stopped"
  | "queued"
  | "downloading"
  | "seeding"
  | "complete"
  | "checking"
  | "error"
  | "unknown";

export type TransmissionDownload = {
  id: number;
  name: string;
  status: DownloadStatus;
  rawStatus: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  eta: number;
  downloadDir: string;
  totalSize: number;
  downloadedEver: number;
  uploadedEver: number;
  leftUntilDone: number;
  peersConnected: number;
  peersSendingToUs: number;
  peersGettingFromUs: number;
  uploadRatio: number;
  errorString: string | null;
  labels: string[];
  magnetLink: string | null;
  releaseEventId?: string | null;
};

export type ProxyHealthStatus = "up" | "down" | "unknown";

export type ProxyHealth = {
  status: ProxyHealthStatus;
  proxyIp: string | null;
  publicIp: string | null;
  checkedAt: string | null;
  warning: string | null;
};

export type DownloadListResponse = {
  downloads: TransmissionDownload[];
  proxy: ProxyHealth;
};

export type AddTorrentResult = {
  id: number;
  name: string;
  hashString: string | null;
  duplicate: boolean;
};

export type DownloadHistoryStatus = "pending" | "downloaded" | "completed" | "canceled";

export type DownloadHistoryEntry = {
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
  status: DownloadHistoryStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AddDownloadResponse = {
  download: TransmissionDownload | null;
  historyRecord: DownloadHistoryEntry;
  duplicate: boolean;
  warning: string | null;
};

export type DownloadDuplicateResponse = {
  duplicate: boolean;
  historyRecord: DownloadHistoryEntry | null;
  warning: string | null;
};
