import type { AddTorrentResult, TransmissionDownload } from "./download.types";

type TransmissionRpcArguments = Record<string, unknown>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type TransmissionRpcResponse<T> = {
  result: string;
  arguments?: T;
};

type TransmissionRpcClientConfig = {
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  fetchImpl?: FetchLike;
};

type TorrentAddArguments = {
  "torrent-added"?: TransmissionAddedTorrent;
  "torrent-duplicate"?: TransmissionAddedTorrent;
};

type TransmissionAddedTorrent = {
  id?: number;
  name?: string;
  hashString?: string;
};

type TransmissionTorrent = {
  id: number;
  name?: string;
  status?: number;
  percentDone?: number;
  percentComplete?: number;
  rateDownload?: number;
  rateUpload?: number;
  eta?: number;
  downloadDir?: string;
  totalSize?: number;
  downloadedEver?: number;
  uploadedEver?: number;
  leftUntilDone?: number;
  peersConnected?: number;
  peersSendingToUs?: number;
  peersGettingFromUs?: number;
  uploadRatio?: number;
  errorString?: string;
  labels?: string[];
  magnetLink?: string;
};

export class TransmissionRpcClient {
  private readonly url: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly fetchImpl: FetchLike;
  private sessionId?: string;

  constructor(config: TransmissionRpcClientConfig = {}) {
    const host = config.host || "localhost";
    const port = config.port || 9091;
    this.url = `http://${host}:${port}/transmission/rpc`;
    this.username = config.username || undefined;
    this.password = config.password || "";
    this.fetchImpl = config.fetchImpl || fetch;
  }

  async addMagnet(magnetLink: string, downloadDir: string): Promise<AddTorrentResult> {
    const result = await this.request<TorrentAddArguments>("torrent-add", {
      filename: magnetLink,
      "download-dir": downloadDir,
      labels: ["release-hub"],
    });
    const added = result["torrent-added"] || result["torrent-duplicate"];
    if (!added?.id) {
      throw new Error("Transmission did not return an added torrent id.");
    }

    return {
      id: added.id,
      name: added.name || "Torrent",
      hashString: added.hashString || null,
      duplicate: Boolean(result["torrent-duplicate"]),
    };
  }

  async getDownloads(): Promise<TransmissionDownload[]> {
    const result = await this.request<{ torrents?: TransmissionTorrent[] }>("torrent-get", {
      fields: [
        "id",
        "name",
        "status",
        "percentDone",
        "percentComplete",
        "rateDownload",
        "rateUpload",
        "eta",
        "downloadDir",
        "totalSize",
        "downloadedEver",
        "uploadedEver",
        "leftUntilDone",
        "peersConnected",
        "peersSendingToUs",
        "peersGettingFromUs",
        "uploadRatio",
        "errorString",
        "labels",
        "magnetLink",
      ],
    });

    return (result.torrents || []).map(mapTorrent);
  }

  private async request<T = TransmissionRpcArguments>(
    method: string,
    args: TransmissionRpcArguments = {},
  ): Promise<T> {
    const body = JSON.stringify({ method, arguments: args });
    let response = await this.send(body);

    if (response.status === 409) {
      const nextSessionId = response.headers.get("x-transmission-session-id");
      if (!nextSessionId) {
        throw new Error("Transmission requested a session id but did not return one.");
      }
      this.sessionId = nextSessionId;
      response = await this.send(body);
    }

    if (!response.ok) {
      throw new Error(`Transmission RPC ${method} failed with HTTP ${response.status}.`);
    }

    const data = (await response.json()) as TransmissionRpcResponse<T>;
    if (data.result !== "success") {
      throw new Error(`Transmission RPC ${method} failed: ${data.result}`);
    }
    return data.arguments || ({} as T);
  }

  private send(body: string): Promise<Response> {
    return this.fetchImpl(this.url, {
      method: "POST",
      headers: this.headers(),
      body,
    });
  }

  private headers(): Headers {
    const headers = new Headers({ "content-type": "application/json" });
    if (this.sessionId) headers.set("x-transmission-session-id", this.sessionId);
    if (this.username) {
      headers.set(
        "authorization",
        `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
      );
    }
    return headers;
  }
}

export function createTransmissionRpcClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TransmissionRpcClient {
  return new TransmissionRpcClient({
    host: env.TRANSMISSION_RPC_HOST || "torrentHost",
    port: env.TRANSMISSION_RPC_PORT || 9091,
    username: env.TRANSMISSION_RPC_USERNAME,
    password: env.TRANSMISSION_RPC_PASSWORD,
  });
}

function mapTorrent(torrent: TransmissionTorrent): TransmissionDownload {
  const rawStatus = torrent.status ?? -1;
  return {
    id: torrent.id,
    name: torrent.name || `Torrent ${torrent.id}`,
    status: mapStatus(rawStatus, torrent.errorString),
    rawStatus,
    percentDone: torrent.percentDone ?? torrent.percentComplete ?? 0,
    rateDownload: torrent.rateDownload ?? 0,
    rateUpload: torrent.rateUpload ?? 0,
    eta: torrent.eta ?? -1,
    downloadDir: torrent.downloadDir || "",
    totalSize: torrent.totalSize ?? 0,
    downloadedEver: torrent.downloadedEver ?? 0,
    uploadedEver: torrent.uploadedEver ?? 0,
    leftUntilDone: torrent.leftUntilDone ?? 0,
    peersConnected: torrent.peersConnected ?? 0,
    peersSendingToUs: torrent.peersSendingToUs ?? 0,
    peersGettingFromUs: torrent.peersGettingFromUs ?? 0,
    uploadRatio: torrent.uploadRatio ?? 0,
    errorString: torrent.errorString || null,
    labels: torrent.labels || [],
    magnetLink: torrent.magnetLink || null,
  };
}

function mapStatus(status: number, errorString?: string): TransmissionDownload["status"] {
  if (errorString) return "error";
  if (status === 0) return "stopped";
  if (status === 1) return "checking";
  if (status === 2) return "checking";
  if (status === 3) return "queued";
  if (status === 4) return "downloading";
  if (status === 5) return "queued";
  if (status === 6) return "seeding";
  return "unknown";
}
