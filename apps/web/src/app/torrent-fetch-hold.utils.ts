export const BOTTOM_FETCH_HOLD_MS = 1200;

export function bottomFetchButtonLabel(input: { hasFetched: boolean; loading: boolean }): string {
  if (input.loading) return "Fetching...";
  return input.hasFetched ? "Refresh torrents" : "Fetch torrents";
}

export function bottomFetchCueLabel(hasFetched: boolean): string {
  return hasFetched ? "Hold to refresh torrent results" : "Hold to fetch torrent results";
}

export function bottomFetchProgress(startedAtMs: number, nowMs: number, holdMs = BOTTOM_FETCH_HOLD_MS): number {
  const elapsed = Math.max(0, nowMs - startedAtMs);
  return Math.min(1, elapsed / holdMs);
}
