import type { FavoriteShowSummary } from "./release.models";

export type FavoriteSortKey = "lastEpisode" | "nextEpisode" | "name";

const newSeriesWindowDays = 90;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

const sortLabels: Record<FavoriteSortKey, string> = {
  lastEpisode: "Last episode",
  nextEpisode: "Next episode",
  name: "Name",
};

export function favoriteSortLabel(sortKey: FavoriteSortKey): string {
  return sortLabels[sortKey];
}

export function sortFavoriteShows(favorites: FavoriteShowSummary[], sortKey: FavoriteSortKey): FavoriteShowSummary[] {
  return [...favorites].sort((a, b) => {
    if (sortKey === "name") return compareNames(a, b);
    if (sortKey === "nextEpisode") return compareDates(a.nextEpisode?.airDate ?? null, b.nextEpisode?.airDate ?? null, "asc") || compareNames(a, b);
    return compareDates(a.lastEpisode?.airDate ?? null, b.lastEpisode?.airDate ?? null, "desc") || compareNames(a, b);
  });
}

export function filterFavoriteShows(favorites: FavoriteShowSummary[], showOnlyNoNextDate: boolean): FavoriteShowSummary[] {
  return showOnlyNoNextDate
    ? favorites.filter((favorite) => favorite.isCanceled || !favorite.nextEpisode?.airDate)
    : favorites;
}

export function favoriteLifecycleLabel(show: FavoriteShowSummary): string | null {
  if (show.status === "Returning Series") return "Active";
  if (show.status === "In Production") return "In production";
  if (show.status) return show.status;
  return show.isCanceled ? "Canceled" : null;
}

export function favoriteSeriesStageLabel(
  show: FavoriteShowSummary,
  now: Date = new Date(),
): "New series" | "First season" | "Returning" | null {
  const observedSeasonNumber = Math.max(
    show.currentSeasonNumber ?? 0,
    show.lastEpisode?.seasonNumber ?? 0,
    show.nextEpisode?.seasonNumber ?? 0,
  );
  const seasonNumber = observedSeasonNumber || show.numberOfSeasons || 0;
  if (seasonNumber > 1) return "Returning";
  if (seasonNumber !== 1) return null;

  const premiereAgeDays = dateAgeInDays(show.firstAirDate, now);
  if (premiereAgeDays !== null && premiereAgeDays >= 0 && premiereAgeDays < newSeriesWindowDays) {
    return "New series";
  }
  return premiereAgeDays !== null && premiereAgeDays < 0 ? null : "First season";
}

function compareNames(a: FavoriteShowSummary, b: FavoriteShowSummary): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function dateAgeInDays(dateOnly: string | null, now: Date): number | null {
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  const premiere = Date.parse(`${dateOnly}T00:00:00.000Z`);
  if (!Number.isFinite(premiere)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - premiere) / millisecondsPerDay);
}

function compareDates(a: string | null, b: string | null, direction: "asc" | "desc"): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}
