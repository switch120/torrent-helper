type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type CachedPublicIp = {
  ip: string;
  expiresAt: number;
};

type PublicIpResolverConfig = {
  fetchImpl?: FetchLike;
  ttlMs?: number;
  timeoutMs?: number;
};

export class PublicIpResolver {
  private readonly fetchImpl: FetchLike;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private cached: CachedPublicIp | null = null;

  constructor(config: PublicIpResolverConfig = {}) {
    this.fetchImpl = config.fetchImpl || fetch;
    this.ttlMs = config.ttlMs ?? 5 * 60 * 1000;
    this.timeoutMs = config.timeoutMs ?? 2500;
  }

  async getPublicIp(now = new Date()): Promise<string | null> {
    if (this.cached && this.cached.expiresAt > now.getTime()) return this.cached.ip;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl("https://api.ipify.org?format=json", {
        signal: controller.signal,
      });
      if (!response.ok) return null;

      const body = await response.text();
      const ip = parseIpifyResponse(body);
      if (!ip) return null;

      this.cached = {
        ip,
        expiresAt: now.getTime() + this.ttlMs,
      };
      return ip;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseIpifyResponse(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { ip?: unknown };
    return typeof parsed.ip === "string" ? parsed.ip : null;
  } catch {
    const trimmed = body.trim();
    return trimmed ? trimmed : null;
  }
}
