export type TransmissionTorrent = {
  id: number;
  name?: string;
  status: number;
};

type TransmissionRpcArguments = Record<string, unknown>;

type TransmissionRpcResponse<T> = {
  result: string;
  arguments?: T;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type TransmissionRpcClientConfig = {
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  fetchImpl?: FetchLike;
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

  async getActiveTorrents(): Promise<TransmissionTorrent[]> {
    const args = await this.request<{ torrents?: TransmissionTorrent[] }>("torrent-get", {
      fields: ["id", "name", "status"],
    });

    return args.torrents || [];
  }

  async removeTorrent(id: number): Promise<void> {
    await this.request("torrent-remove", {
      ids: [id],
      "delete-local-data": false,
    });
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

    if (this.sessionId) {
      headers.set("x-transmission-session-id", this.sessionId);
    }

    if (this.username) {
      headers.set(
        "authorization",
        `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
      );
    }

    return headers;
  }
}

export function createTransmissionClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TransmissionRpcClient {
  const host =
    env.TRANSMISSION_RPC_HOST ||
    (env.CONTAINERIZED ? "torrentHost" : "localhost");

  return new TransmissionRpcClient({
    host,
    port: env.TRANSMISSION_RPC_PORT || 9091,
    username: env.TRANSMISSION_RPC_USERNAME,
    password: env.TRANSMISSION_RPC_PASSWORD,
  });
}
