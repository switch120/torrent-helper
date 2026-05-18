import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { favoriteSortLabel, filterFavoriteShows, sortFavoriteShows, type FavoriteSortKey } from "./favorites.utils";
import { ReleaseApiClient } from "./release-api.client";
import type { FavoriteEpisodeSummary, FavoriteShowSummary } from "./release.models";

@Component({
  selector: "app-favorites",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./favorites.component.html",
})
export class FavoritesComponent implements OnInit {
  private readonly api = inject(ReleaseApiClient);
  readonly favorites = signal<FavoriteShowSummary[]>([]);
  readonly status = signal<"loading" | "ready" | "error">("loading");
  readonly error = signal<string | null>(null);
  readonly sortKey = signal<FavoriteSortKey>("lastEpisode");
  readonly showNoNextDate = signal(false);
  readonly sortOptions: FavoriteSortKey[] = ["lastEpisode", "nextEpisode", "name"];
  readonly favoriteSortLabel = favoriteSortLabel;
  readonly visibleFavorites = computed(() =>
    sortFavoriteShows(filterFavoriteShows(this.favorites(), this.showNoNextDate()), this.sortKey()),
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.status.set("loading");
    this.error.set(null);
    try {
      this.favorites.set(await this.api.getFavorites());
      this.status.set("ready");
    } catch (error) {
      this.status.set("error");
      this.error.set(error instanceof Error ? error.message : "Favorites are unavailable");
    }
  }

  async remove(show: FavoriteShowSummary): Promise<void> {
    await this.api.removeFavorite(show.showKey);
    this.favorites.update((favorites) => favorites.filter((favorite) => favorite.showKey !== show.showKey));
  }

  setSortKey(sortKey: string): void {
    if (sortKey === "lastEpisode" || sortKey === "nextEpisode" || sortKey === "name") {
      this.sortKey.set(sortKey);
    }
  }

  episodeLabel(episode: FavoriteEpisodeSummary | null): string {
    if (!episode) return "Unknown";
    const number = episode.seasonNumber && episode.episodeNumber
      ? `S${episode.seasonNumber}:E${episode.episodeNumber}`
      : null;
    return [number, episode.name].filter(Boolean).join(" - ") || "Unknown";
  }
}
