import type { FavoriteShowSummary } from "./release.models";

export type FavoriteSortKey = "lastEpisode" | "nextEpisode" | "name";

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

function compareNames(a: FavoriteShowSummary, b: FavoriteShowSummary): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function compareDates(a: string | null, b: string | null, direction: "asc" | "desc"): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}
