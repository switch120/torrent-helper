import type {
  DigitalRelease,
  HiddenShowFilter,
  ProviderFilter,
  ReleaseProviderSource,
  ReleaseSection,
  ReleaseWeekResponse,
  ReleaseWeekStatus,
} from "./release.models";

type TvFilterOptions = {
  hiddenShowKeys?: Set<string>;
  showOnlyFavorites?: boolean;
  favoriteShowKeys?: Set<string>;
  showInternational?: boolean;
  showDubbed?: boolean;
};

export const DEFAULT_SELECTED_PROVIDER_NAMES = [
  "Apple TV+",
  "Netflix",
  "Max",
  "Disney+",
  "Hulu",
  "Prime",
  "Paramount+",
  "Peacock",
  "HBO",
  "STARZ",
];

export const DEFAULT_SELECTED_PROVIDERS: ProviderFilter[] = DEFAULT_SELECTED_PROVIDER_NAMES.map((name) => ({
  key: providerKeyFromName(name),
  name,
  hidden: false,
  selected: true,
}));

export function startOfIsoWeek(value = new Date()): string {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function normalizeWeekStartParam(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;

  return startOfIsoWeek(date);
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
  selectedProviderKeys: Set<string> | null = null,
  hiddenShowKeys = new Set<string>(),
  favoriteOptions: TvFilterOptions = {},
): ReleaseSection[] {
  const movies = filterLanguageVisibility(response?.movies ?? [], favoriteOptions);
  const tvRows = filterLanguageVisibility(groupTvReleases(response?.tv ?? []), favoriteOptions);
  const tvWithProviders = filterSelectedProviders(tvRows, selectedProviderKeys);
  const tvWithoutHiddenShows = filterHiddenShows(tvWithProviders, hiddenShowKeys);
  const tv = filterFavoriteShows(
    tvWithoutHiddenShows,
    favoriteOptions.showOnlyFavorites === true,
    favoriteOptions.favoriteShowKeys ?? new Set(),
  );

  return [
    {
      title: "Movies",
      count: movies.length,
      hiddenCount: 0,
      emptyText: "No movie releases cached for this week.",
      releases: movies,
    },
    {
      title: "TV",
      count: tv.length,
      hiddenCount: tvWithProviders.length - tvWithoutHiddenShows.length,
      emptyText: "No TV releases cached for this week.",
      releases: tv,
    },
  ];
}

export function providerKey(release: Pick<DigitalRelease, "releaseSource" | "sourceId">): string {
  if ("sourceName" in release && typeof release.sourceName === "string") {
    return providerKeyFromName(release.sourceName);
  }
  return `provider:${release.sourceId}`;
}

export function providerKeyFromName(value: string): string {
  const slug = providerSlug(canonicalProviderName(value));
  return `provider:${slug || "unknown"}`;
}

export function providerDisplayName(value: string): string {
  return canonicalProviderName(value);
}

export function releaseSources(release: DigitalRelease): ReleaseProviderSource[] {
  if (release.sources?.length) return release.sources.map(normalizeProviderSource);
  return [providerSourceFromRelease(release)];
}

export function releaseStreamingSources(release: DigitalRelease): ReleaseProviderSource[] {
  if (!release.sources?.length) return [];
  return uniqueProviderSources(
    release.sources
      .map(normalizeProviderSource)
      .filter((source) => source.sourceType !== "digital"),
  );
}

export function showKey(release: Pick<DigitalRelease, "mediaType" | "tmdbId" | "title">): string {
  if (release.mediaType !== "tv") return "";
  if (release.tmdbId) return `tmdb:${release.tmdbId}`;
  return `title:${release.title.toLowerCase().trim()}`;
}

export function isProviderFilterable(release: DigitalRelease): boolean {
  return release.releaseKind !== "digital";
}

export function canHideShow(
  release: Pick<DigitalRelease, "mediaType" | "tmdbId" | "title">,
  favoriteShowKeys: Set<string>,
): boolean {
  const key = showKey(release);
  return Boolean(key && !favoriteShowKeys.has(key));
}

export function collectProviderFilters(
  response: ReleaseWeekResponse | null,
  selectedProviderKeys: Set<string>,
  knownProviders: ProviderFilter[] = [],
  filterOptions: TvFilterOptions = {},
): ProviderFilter[] {
  const providers = new Map<string, ProviderFilter>();
  const counts = new Map<string, number>();

  for (const provider of knownProviders) {
    const key = providerKeyFromName(provider.name);
    providers.set(key, {
      key,
      name: canonicalProviderName(provider.name),
      hidden: false,
      selected: selectedProviderKeys.has(key),
      count: 0,
      disabled: true,
    });
  }

  const groupedTvRows = filterLanguageVisibility(groupTvReleases(response?.tv ?? []), filterOptions);
  for (const release of groupedTvRows) {
    if (!isProviderFilterable(release)) continue;
    for (const source of releaseSources(release)) {
      const key = providerKeyFromName(source.name);
      providers.set(key, {
        key,
        name: canonicalProviderName(source.name),
        hidden: false,
        selected: selectedProviderKeys.has(key),
        count: 0,
        disabled: true,
      });
    }
  }

  const countableTvRows = filterFavoriteShows(
    filterHiddenShows(groupedTvRows, filterOptions.hiddenShowKeys ?? new Set()),
    filterOptions.showOnlyFavorites === true,
    filterOptions.favoriteShowKeys ?? new Set(),
  );

  for (const release of countableTvRows) {
    for (const source of releaseSources(release)) {
      const key = providerKeyFromName(source.name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...providers.values()]
    .map((provider) => {
      const count = counts.get(provider.key) ?? 0;
      return {
        ...provider,
        hidden: false,
        selected: selectedProviderKeys.has(provider.key),
        count,
        disabled: count === 0,
      };
    })
    .sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.name.localeCompare(b.name));
}

export function collectHiddenShowFilters(
  response: ReleaseWeekResponse | null,
  hiddenShowKeys: Set<string>,
): HiddenShowFilter[] {
  return groupTvReleases(response?.tv ?? [])
    .filter((release) => hiddenShowKeys.has(showKey(release)))
    .map((release) => ({
      key: showKey(release),
      title: release.title,
      posterUrl: release.posterUrl,
      releaseDate: release.releaseDate,
      seasonNumber: release.seasonNumber,
      episodeNumber: release.episodeNumber,
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.releaseDate.localeCompare(b.releaseDate));
}

export function collectAddableProviderFilters(providers: ProviderFilter[]): ProviderFilter[] {
  return providers
    .filter((provider) => provider.selected !== true)
    .sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.name.localeCompare(b.name));
}

function filterSelectedProviders(
  releases: DigitalRelease[],
  selectedProviderKeys: Set<string> | null,
): DigitalRelease[] {
  if (selectedProviderKeys === null) return releases;
  return releases.filter(
    (release) =>
      !isProviderFilterable(release) ||
      releaseSources(release).some((source) => selectedProviderKeys.has(providerKeyFromName(source.name))),
  );
}

function filterHiddenShows(
  releases: DigitalRelease[],
  hiddenShowKeys: Set<string>,
): DigitalRelease[] {
  return releases.filter((release) => !hiddenShowKeys.has(showKey(release)));
}

function filterFavoriteShows(
  releases: DigitalRelease[],
  showOnlyFavorites: boolean,
  favoriteShowKeys: Set<string>,
): DigitalRelease[] {
  if (!showOnlyFavorites) return releases;
  return releases.filter((release) => favoriteShowKeys.has(showKey(release)));
}

function filterLanguageVisibility(
  releases: DigitalRelease[],
  options: Pick<TvFilterOptions, "showInternational" | "showDubbed">,
): DigitalRelease[] {
  return releases.filter((release) => {
    if (release.isInternational === true && options.showInternational !== true) return false;
    if (release.isDubbed === true && options.showDubbed !== true) return false;
    return true;
  });
}

function groupTvReleases(releases: DigitalRelease[]): DigitalRelease[] {
  const groups = new Map<string, DigitalRelease[]>();

  for (const release of releases) {
    const key = tvGroupKey(release);
    groups.set(key, [...(groups.get(key) ?? []), release]);
  }

  return [...groups.values()].map(mergeTvReleaseGroup);
}

function tvGroupKey(release: DigitalRelease): string {
  return [
    normalizeTitle(release.title) || showKey(release),
    release.seasonNumber ?? "none",
  ].join(":");
}

function mergeTvReleaseGroup(releases: DigitalRelease[]): DigitalRelease {
  const representative = [...releases].sort(compareTvRepresentative)[0];
  const sources = uniqueProviderSources(releases.flatMap((release) => releaseSources(release)));
  const ratedRelease = releases.find(hasTmdbRating);

  if (releases.length === 1) return representative;

  return {
    ...representative,
    isOriginal: releases.some((release) => release.isOriginal),
    voteAverage: representative.voteAverage ?? ratedRelease?.voteAverage ?? null,
    voteCount: representative.voteCount ?? ratedRelease?.voteCount ?? null,
    sources,
  };
}

function compareTvRepresentative(a: DigitalRelease, b: DigitalRelease): number {
  return (
    Number(Boolean(b.episodeNumber)) - Number(Boolean(a.episodeNumber)) ||
    Number(b.releaseSource === "tmdb") - Number(a.releaseSource === "tmdb") ||
    Number(Boolean(b.posterUrl)) - Number(Boolean(a.posterUrl))
  );
}

function uniqueProviderSources(sources: ReleaseProviderSource[]): ReleaseProviderSource[] {
  const byKey = new Map<string, ReleaseProviderSource>();
  for (const source of sources) {
    const normalized = normalizeProviderSource(source);
    byKey.set(normalized.key, normalized);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function providerSourceFromRelease(release: DigitalRelease): ReleaseProviderSource {
  return {
    key: providerKeyFromName(release.sourceName),
    name: canonicalProviderName(release.sourceName),
    sourceId: release.sourceId,
    sourceType: release.sourceType,
    releaseSource: release.releaseSource,
  };
}

function normalizeProviderSource(source: ReleaseProviderSource): ReleaseProviderSource {
  return {
    ...source,
    key: providerKeyFromName(source.name),
    name: canonicalProviderName(source.name),
  };
}

function canonicalProviderName(value: string): string {
  const trimmed = value.trim();
  const slug = providerSlug(trimmed);
  const aliases: Record<string, string> = {
    amazonprime: "Prime",
    amazonprimevideo: "Prime",
    appletv: "Apple TV+",
    appletvplus: "Apple TV+",
    disney: "Disney+",
    disneyplus: "Disney+",
    fox: "FOX",
    fx: "FX",
    hbomax: "Max",
    max: "Max",
    paramount: "Paramount+",
    paramountplus: "Paramount+",
    peacock: "Peacock",
    prime: "Prime",
    primevideo: "Prime",
    roku: "The Roku Channel",
    starz: "STARZ",
    therokuchannel: "The Roku Channel",
  };

  return aliases[slug] || trimmed;
}

function providerSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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

export function formatTmdbRating(
  release: Pick<DigitalRelease, "voteAverage" | "voteCount">,
): string | null {
  const voteAverage = release.voteAverage ?? 0;
  const voteCount = release.voteCount ?? 0;
  if (voteAverage <= 0) return null;

  if (voteCount <= 0) return `TMDB ${voteAverage.toFixed(1)}`;

  return `TMDB ${voteAverage.toFixed(1)} · ${formatVoteCount(voteCount)} votes`;
}

export function ratingToneClass(
  release: Pick<DigitalRelease, "voteAverage">,
): string {
  const voteAverage = release.voteAverage ?? 0;
  if (voteAverage <= 0) return "rating-chip is-unrated";
  if (voteAverage >= 8) return "rating-chip is-hot";
  if (voteAverage >= 6.8) return "rating-chip is-warm";
  return "rating-chip is-cool";
}

function hasTmdbRating(release: Pick<DigitalRelease, "voteAverage">): boolean {
  return (release.voteAverage ?? 0) > 0;
}

function formatVoteCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
