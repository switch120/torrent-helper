import type {
  DigitalRelease,
  ProviderFilter,
  ReleaseSection,
  ReleaseWeekResponse,
  ReleaseWeekStatus,
} from "./release.models";

export function startOfIsoWeek(value = new Date()): string {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function addWeeks(weekStart: string, offset: number): string {
  const date = parseDateOnly(weekStart);
  date.setUTCDate(date.getUTCDate() + offset * 7);
  return date.toISOString().slice(0, 10);
}

export function weekEndFromStart(weekStart: string): string {
  const date = parseDateOnly(weekStart);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = parseDateOnly(weekStart);
  const end = parseDateOnly(weekEnd);
  const startText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(start);
  const endText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);

  return `${startText} - ${endText}`;
}

export function buildReleaseSections(
  response: ReleaseWeekResponse | null,
  hiddenProviderKeys = new Set<string>(),
): ReleaseSection[] {
  const movies = filterHiddenProviders(response?.movies ?? [], hiddenProviderKeys);
  const tv = filterHiddenProviders(response?.tv ?? [], hiddenProviderKeys);

  return [
    {
      title: "Movies",
      count: movies.length,
      emptyText: "No movie releases cached for this week.",
      releases: movies,
    },
    {
      title: "TV",
      count: tv.length,
      emptyText: "No TV releases cached for this week.",
      releases: tv,
    },
  ];
}

export function providerKey(release: Pick<DigitalRelease, "releaseSource" | "sourceId">): string {
  return `${release.releaseSource}:${release.sourceId}`;
}

export function isProviderFilterable(release: DigitalRelease): boolean {
  return release.releaseKind !== "digital";
}

export function collectProviderFilters(
  response: ReleaseWeekResponse | null,
  hiddenProviderKeys: Set<string>,
  knownProviders: ProviderFilter[] = [],
): ProviderFilter[] {
  const providers = new Map<string, ProviderFilter>();

  for (const provider of knownProviders) {
    providers.set(provider.key, {
      ...provider,
      hidden: hiddenProviderKeys.has(provider.key),
    });
  }

  for (const release of [...(response?.movies ?? []), ...(response?.tv ?? [])]) {
    if (!isProviderFilterable(release)) continue;
    const key = providerKey(release);
    providers.set(key, {
      key,
      name: release.sourceName,
      hidden: hiddenProviderKeys.has(key),
    });
  }

  return [...providers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function filterHiddenProviders(
  releases: DigitalRelease[],
  hiddenProviderKeys: Set<string>,
): DigitalRelease[] {
  return releases.filter(
    (release) => !isProviderFilterable(release) || !hiddenProviderKeys.has(providerKey(release)),
  );
}

export function cacheLabel(
  status: ReleaseWeekStatus,
  error: string | null,
  cache?: ReleaseWeekResponse["cache"] | null,
): string {
  if (status === "idle") return "Choose a week";
  if (status === "loading" || status === "refreshing") return "Refreshing";
  if (status === "error") return error || "Release data is unavailable";
  if (cache?.warning) return cache.warning;
  if (cache?.status === "stale") return "Showing cached data";
  if (cache?.fetchedAt) return "Cached";
  return "Ready";
}

export function releaseKey(release: DigitalRelease): string {
  return release.eventId;
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
