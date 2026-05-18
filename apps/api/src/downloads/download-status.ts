import type { DownloadListResponse, ProxyHealth, TransmissionDownload } from "./download.types";

const PROXY_CHECKER_NAME = "whatismyip.net - torrent tracker ip checker";

export function buildDownloadStatus(
  downloads: TransmissionDownload[],
  publicIp: string | null,
  now: Date,
): DownloadListResponse {
  const proxyChecker = downloads.find(isProxyCheckerDownload) || null;
  const proxyIp = proxyChecker ? extractProxyIp(proxyChecker.errorString) : null;

  return {
    downloads: downloads.filter((download) => !isProxyCheckerDownload(download)),
    proxy: buildProxyHealth(proxyChecker, proxyIp, publicIp, now),
  };
}

export function extractProxyIp(value: string | null): string | null {
  const match = value?.match(/\bIP:\s*([a-f0-9:.]+)/i);
  return match?.[1] || null;
}

export function isProxyCheckerDownload(download: TransmissionDownload): boolean {
  const name = download.name.toLowerCase();
  return name === PROXY_CHECKER_NAME || download.magnetLink?.includes("whatismyip.net") === true;
}

function buildProxyHealth(
  proxyChecker: TransmissionDownload | null,
  proxyIp: string | null,
  publicIp: string | null,
  now: Date,
): ProxyHealth {
  if (!proxyChecker) {
    return {
      status: "unknown",
      proxyIp: null,
      publicIp,
      checkedAt: now.toISOString(),
      warning: "Proxy checker torrent was not found.",
    };
  }

  if (!proxyIp) {
    return {
      status: "unknown",
      proxyIp: null,
      publicIp,
      checkedAt: now.toISOString(),
      warning: "Proxy checker has not reported an IP yet.",
    };
  }

  if (!publicIp) {
    return {
      status: "unknown",
      proxyIp,
      publicIp: null,
      checkedAt: now.toISOString(),
      warning: "Public IP lookup is unavailable.",
    };
  }

  const status = proxyIp === publicIp ? "down" : "up";
  return {
    status,
    proxyIp,
    publicIp,
    checkedAt: now.toISOString(),
    warning: status === "down"
      ? "Proxy checker is reporting the same IP as the public connection."
      : null,
  };
}
