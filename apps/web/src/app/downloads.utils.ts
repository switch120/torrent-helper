import type { ProxyHealthStatus } from "./release.models";

export function proxyStatusLabel(status: ProxyHealthStatus): string {
  if (status === "up") return "Proxy up";
  if (status === "down") return "Proxy exposed";
  return "Proxy unknown";
}

export function proxyToneClass(status: ProxyHealthStatus): string {
  return `proxy-health is-${status}`;
}
