import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { favoriteSortLabel, filterFavoriteShows, sortFavoriteShows, type FavoriteSortKey } from "./favorites.utils";
import { ReleaseApiClient } from "./release-api.client";
import type {
  DownloadHistoryStatus,
  FavoriteEpisodeSummary,
  FavoriteSeasonDetail,
  FavoriteShowSummary,
  TorrentResult,
  TorrentSearchQuality,
} from "./release.models";
import {
  confidenceLabel,
  confidenceTone,
  formatBytes,
  formatTorrentAge,
  qualityTone,
} from "./torrent.utils";

type EpisodeTorrentState = {
  status: "loading" | "ready" | "error";
  requestId: number;
  results: TorrentResult[];
  warning: string | null;
  downloadStates: Record<string, EpisodeDownloadState>;
};

type EpisodeDownloadState = {
  status: "checking" | "available" | "adding" | "added" | "error";
  historyStatus: DownloadHistoryStatus | null;
  warning: string | null;
};

type SelectedEpisodeTorrent = {
  showKey: string;
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string | null;
  torrentStateKey: string;
  torrent: TorrentResult;
};

type FavoriteBrowserState = {
  seasonNumber: number;
  seasonStatus: "loading" | "ready" | "error";
  season: FavoriteSeasonDetail | null;
  error: string | null;
  quality: TorrentSearchQuality;
  expandedEpisodeNumber: number | null;
  torrentStates: Record<string, EpisodeTorrentState>;
};

@Component({
  selector: "app-favorites",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./favorites.component.html",
})
export class FavoritesComponent implements OnInit {
  private readonly api = inject(ReleaseApiClient);
  private nextTorrentRequestId = 0;
  readonly favorites = signal<FavoriteShowSummary[]>([]);
  readonly status = signal<"loading" | "ready" | "error">("loading");
  readonly error = signal<string | null>(null);
  readonly sortKey = signal<FavoriteSortKey>("lastEpisode");
  readonly showNoNextDate = signal(false);
  readonly expandedShowKey = signal<string | null>(null);
  readonly browserStates = signal<Record<string, FavoriteBrowserState>>({});
  readonly episodeHistoryStates = signal<Record<string, DownloadHistoryStatus>>({});
  readonly selectedEpisodeTorrent = signal<SelectedEpisodeTorrent | null>(null);
  readonly episodeDownloadDir = signal("/data/TV");
  readonly episodeAddStatus = signal<"idle" | "adding" | "error">("idle");
  readonly episodeAddError = signal<string | null>(null);
  readonly sortOptions: FavoriteSortKey[] = ["lastEpisode", "nextEpisode", "name"];
  readonly favoriteSortLabel = favoriteSortLabel;
  readonly visibleFavorites = computed(() =>
    sortFavoriteShows(filterFavoriteShows(this.favorites(), this.showNoNextDate()), this.sortKey()),
  );
  readonly formatBytes = formatBytes;
  readonly formatTorrentAge = formatTorrentAge;
  readonly qualityTone = qualityTone;
  readonly confidenceLabel = confidenceLabel;
  readonly confidenceTone = confidenceTone;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.status.set("loading");
    this.error.set(null);
    const historyPromise = this.api.getDownloadHistory().catch(() => []);
    try {
      this.favorites.set(await this.api.getFavorites());
      this.status.set("ready");
      const history = await historyPromise;
      this.episodeHistoryStates.set(
        history.reduce<Record<string, DownloadHistoryStatus>>((states, entry) => ({
          ...states,
          [entry.releaseEventId]: preferredHistoryStatus(states[entry.releaseEventId], entry.status),
        }), {}),
      );
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
    const number = episode.seasonNumber !== null && episode.episodeNumber
      ? `S${episode.seasonNumber}:E${episode.episodeNumber}`
      : null;
    return [number, episode.name].filter(Boolean).join(" - ") || "Unknown";
  }

  canBrowseEpisodes(show: FavoriteShowSummary): boolean {
    return Boolean(show.tmdbId && (show.currentSeasonNumber || show.numberOfSeasons));
  }

  seasonOptions(show: FavoriteShowSummary): number[] {
    const maxSeason = Math.max(show.numberOfSeasons || 0, show.currentSeasonNumber || 0);
    return [
      ...Array.from({ length: maxSeason }, (_, index) => maxSeason - index),
      0,
    ];
  }

  browserState(showKey: string): FavoriteBrowserState | null {
    return this.browserStates()[showKey] || null;
  }

  episodeTorrentState(
    showKey: string,
    episodeNumber: number | null,
  ): EpisodeTorrentState | null {
    const browser = this.browserState(showKey);
    if (!browser || !episodeNumber) return null;
    return browser.torrentStates[this.torrentKey(browser, episodeNumber)] || null;
  }

  episodeDownloadState(
    showKey: string,
    episodeNumber: number,
    torrent: TorrentResult,
  ): EpisodeDownloadState | null {
    return this.episodeTorrentState(showKey, episodeNumber)?.downloadStates[torrent.magnetLink] || null;
  }

  canAddEpisodeTorrent(state: EpisodeDownloadState | null): boolean {
    return state?.status === "available";
  }

  episodeDownloadButtonLabel(state: EpisodeDownloadState | null): string {
    if (!state || state.status === "checking") return "Checking...";
    if (state.status === "available") return "Download";
    if (state.status === "adding") return "Adding...";
    if (state.status === "error") return "Unavailable";
    if (state.historyStatus === "pending") return "Downloading";
    if (state.historyStatus === "downloaded" || state.historyStatus === "completed") return "Downloaded";
    return "Already added";
  }

  episodeDownloadStatus(
    showKey: string,
    episodeNumber: number | null,
  ): "Adding" | "Downloading" | "Downloaded" | "Added" | null {
    const browser = this.browserState(showKey);
    if (!browser || !episodeNumber) return null;

    const episodeKeyPrefix = `${browser.seasonNumber}:${episodeNumber}:`;
    const states = Object.entries(browser.torrentStates)
      .filter(([key]) => key.startsWith(episodeKeyPrefix))
      .flatMap(([, torrentState]) => Object.values(torrentState.downloadStates));
    const historyStatus = this.episodeHistoryStates()[
      favoriteEpisodeEventId(showKey, browser.seasonNumber, episodeNumber)
    ];

    if (states.some((state) => state.status === "adding")) return "Adding";
    if (
      historyStatus === "pending" ||
      states.some((state) => state.status === "added" && state.historyStatus === "pending")
    ) {
      return "Downloading";
    }
    if (
      historyStatus === "downloaded" ||
      historyStatus === "completed" ||
      states.some((state) =>
        state.status === "added" &&
        (state.historyStatus === "downloaded" || state.historyStatus === "completed")
      )
    ) {
      return "Downloaded";
    }
    return states.some((state) => state.status === "added") ? "Added" : null;
  }

  async toggleBrowser(show: FavoriteShowSummary): Promise<void> {
    if (!this.canBrowseEpisodes(show)) return;
    if (this.expandedShowKey() === show.showKey) {
      this.expandedShowKey.set(null);
      return;
    }

    this.expandedShowKey.set(show.showKey);
    if (this.browserState(show.showKey)) return;

    const seasonNumber = show.currentSeasonNumber || show.numberOfSeasons || 1;
    this.browserStates.update((states) => ({
      ...states,
      [show.showKey]: {
        seasonNumber,
        seasonStatus: "loading",
        season: null,
        error: null,
        quality: "2160p",
        expandedEpisodeNumber: null,
        torrentStates: {},
      },
    }));
    await this.loadSeason(show, seasonNumber);
  }

  async setSeason(show: FavoriteShowSummary, value: string | number): Promise<void> {
    const seasonNumber = Number(value);
    if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return;
    await this.loadSeason(show, seasonNumber);
  }

  setQuality(show: FavoriteShowSummary, value: string): void {
    if (value !== "2160p" && value !== "1080p" && value !== "any") return;
    const browser = this.browserState(show.showKey);
    if (!browser) return;
    this.updateBrowser(show.showKey, (state) => ({ ...state, quality: value }));
    if (browser.expandedEpisodeNumber) {
      void this.searchEpisodeTorrents(show, browser.expandedEpisodeNumber);
    }
  }

  toggleEpisode(show: FavoriteShowSummary, episode: FavoriteEpisodeSummary): void {
    const episodeNumber = episode.episodeNumber;
    const browser = this.browserState(show.showKey);
    if (!browser || !episodeNumber) return;
    const isClosing = browser.expandedEpisodeNumber === episodeNumber;
    this.updateBrowser(show.showKey, (state) => ({
      ...state,
      expandedEpisodeNumber: isClosing ? null : episodeNumber,
    }));
    if (!isClosing && !browser.torrentStates[this.torrentKey(browser, episodeNumber)]) {
      void this.searchEpisodeTorrents(show, episodeNumber);
    }
  }

  async searchEpisodeTorrents(
    show: FavoriteShowSummary,
    episodeNumber: number,
  ): Promise<void> {
    const browser = this.browserState(show.showKey);
    if (!browser) return;
    const key = this.torrentKey(browser, episodeNumber);
    const requestId = ++this.nextTorrentRequestId;
    this.updateBrowser(show.showKey, (state) => ({
      ...state,
      torrentStates: {
        ...state.torrentStates,
        [key]: {
          status: "loading",
          requestId,
          results: [],
          warning: null,
          downloadStates: {},
        },
      },
    }));

    try {
      const response = await this.api.searchFavoriteEpisodeTorrents(
        show.showKey,
        browser.seasonNumber,
        episodeNumber,
        browser.quality,
      );
      this.updateBrowser(show.showKey, (state) => {
        if (state.torrentStates[key]?.requestId !== requestId) return state;
        return {
          ...state,
          torrentStates: {
            ...state.torrentStates,
            [key]: {
              status: "ready",
              requestId,
              results: response.results,
              warning: response.warning,
              downloadStates: Object.fromEntries(
                response.results.map((torrent) => [
                  torrent.magnetLink,
                  { status: "checking", historyStatus: null, warning: null },
                ]),
              ),
            },
          },
        };
      });
      if (this.browserState(show.showKey)?.torrentStates[key]?.requestId !== requestId) {
        return;
      }
      await this.loadEpisodeDownloadStates(
        show.showKey,
        key,
        response.results,
        requestId,
      );
    } catch (error) {
      this.updateBrowser(show.showKey, (state) => {
        if (state.torrentStates[key]?.requestId !== requestId) return state;
        return {
          ...state,
          torrentStates: {
            ...state.torrentStates,
            [key]: {
              status: "error",
              requestId,
              results: [],
              warning: error instanceof Error ? error.message : "Torrent search is unavailable.",
              downloadStates: {},
            },
          },
        };
      });
    }
  }

  openEpisodeAddDialog(
    show: FavoriteShowSummary,
    episode: FavoriteEpisodeSummary,
    torrent: TorrentResult,
  ): void {
    const browser = this.browserState(show.showKey);
    const episodeNumber = episode.episodeNumber;
    if (!browser || !episodeNumber || !this.canAddEpisodeTorrent(this.episodeDownloadState(show.showKey, episodeNumber, torrent))) {
      return;
    }
    this.selectedEpisodeTorrent.set({
      showKey: show.showKey,
      showTitle: show.title,
      seasonNumber: browser.seasonNumber,
      episodeNumber,
      episodeName: episode.name,
      torrentStateKey: this.torrentKey(browser, episodeNumber),
      torrent,
    });
    this.episodeDownloadDir.set(show.preferredDownloadDir || "/data/TV");
    this.episodeAddStatus.set("idle");
    this.episodeAddError.set(null);
  }

  closeEpisodeAddDialog(): void {
    if (this.episodeAddStatus() === "adding") return;
    this.selectedEpisodeTorrent.set(null);
  }

  async addSelectedEpisodeTorrent(): Promise<void> {
    const selected = this.selectedEpisodeTorrent();
    const downloadDir = this.episodeDownloadDir().trim();
    if (!selected || !downloadDir || this.episodeAddStatus() === "adding") return;

    this.episodeAddStatus.set("adding");
    this.episodeAddError.set(null);
    this.updateEpisodeDownloadState(selected, {
      status: "adding",
      historyStatus: null,
      warning: null,
    });

    try {
      const response = await this.api.addFavoriteEpisodeDownload(
        selected.showKey,
        selected.seasonNumber,
        selected.episodeNumber,
        selected.torrent.magnetLink,
        downloadDir,
      );
      this.updateEpisodeDownloadState(selected, {
        status: "added",
        historyStatus: response.historyRecord.status,
        warning: response.warning,
      });
      this.setEpisodeHistoryStatus(
        selected.showKey,
        selected.seasonNumber,
        selected.episodeNumber,
        response.historyRecord.status,
      );
      this.favorites.update((favorites) =>
        favorites.map((favorite) =>
          favorite.showKey === selected.showKey
            ? { ...favorite, preferredDownloadDir: response.historyRecord.downloadDir }
            : favorite,
        ),
      );
      this.episodeAddStatus.set("idle");
      this.selectedEpisodeTorrent.set(null);
    } catch (error) {
      const duplicate = await this.api.checkDownloadDuplicate(selected.torrent.magnetLink).catch(() => null);
      if (duplicate?.historyRecord) {
        this.setEpisodeHistoryStatus(
          selected.showKey,
          selected.seasonNumber,
          selected.episodeNumber,
          duplicate.historyRecord.status,
        );
      }
      this.updateEpisodeDownloadState(selected, duplicate?.duplicate
        ? {
            status: "added",
            historyStatus: duplicate.historyRecord?.status || null,
            warning: duplicate.warning,
          }
        : {
            status: "available",
            historyStatus: null,
            warning: null,
          });
      this.episodeAddStatus.set("error");
      this.episodeAddError.set(
        duplicate?.warning ||
        (error instanceof Error ? error.message : "Download could not be added."),
      );
    }
  }

  private async loadSeason(show: FavoriteShowSummary, seasonNumber: number): Promise<void> {
    this.updateBrowser(show.showKey, (state) => ({
      ...state,
      seasonNumber,
      seasonStatus: "loading",
      season: null,
      error: null,
      expandedEpisodeNumber: null,
    }));
    try {
      const season = await this.api.getFavoriteSeason(show.showKey, seasonNumber);
      const current = this.browserState(show.showKey);
      if (!current || current.seasonNumber !== seasonNumber) return;
      this.updateBrowser(show.showKey, (state) => ({
        ...state,
        seasonStatus: "ready",
        season,
      }));
    } catch (error) {
      const current = this.browserState(show.showKey);
      if (!current || current.seasonNumber !== seasonNumber) return;
      this.updateBrowser(show.showKey, (state) => ({
        ...state,
        seasonStatus: "error",
        error: error instanceof Error ? error.message : "Episodes are unavailable.",
      }));
    }
  }

  private torrentKey(browser: FavoriteBrowserState, episodeNumber: number): string {
    return `${browser.seasonNumber}:${episodeNumber}:${browser.quality}`;
  }

  private async loadEpisodeDownloadStates(
    showKey: string,
    torrentStateKey: string,
    torrents: TorrentResult[],
    requestId: number,
  ): Promise<void> {
    const entries = await Promise.all(
      torrents.map(async (torrent): Promise<[string, EpisodeDownloadState]> => {
        try {
          const response = await this.api.checkDownloadDuplicate(torrent.magnetLink);
          return [
            torrent.magnetLink,
            response.duplicate
              ? {
                  status: "added",
                  historyStatus: response.historyRecord?.status || null,
                  warning: response.warning,
                }
              : {
                  status: "available",
                  historyStatus: null,
                  warning: null,
                },
          ];
        } catch {
          return [
            torrent.magnetLink,
            {
              status: "error",
              historyStatus: null,
              warning: "Download history could not be checked.",
            },
          ];
        }
      }),
    );

    this.updateBrowser(showKey, (state) => {
      const torrentState = state.torrentStates[torrentStateKey];
      if (!torrentState || torrentState.requestId !== requestId) return state;
      return {
        ...state,
        torrentStates: {
          ...state.torrentStates,
          [torrentStateKey]: {
            ...torrentState,
            downloadStates: Object.fromEntries(entries),
          },
        },
      };
    });
  }

  private updateEpisodeDownloadState(
    selected: SelectedEpisodeTorrent,
    downloadState: EpisodeDownloadState,
  ): void {
    this.updateBrowser(selected.showKey, (state) => {
      const torrentState = state.torrentStates[selected.torrentStateKey];
      if (!torrentState) return state;
      return {
        ...state,
        torrentStates: {
          ...state.torrentStates,
          [selected.torrentStateKey]: {
            ...torrentState,
            downloadStates: {
              ...torrentState.downloadStates,
              [selected.torrent.magnetLink]: downloadState,
            },
          },
        },
      };
    });
  }

  private setEpisodeHistoryStatus(
    showKey: string,
    seasonNumber: number,
    episodeNumber: number,
    status: DownloadHistoryStatus,
  ): void {
    const eventId = favoriteEpisodeEventId(showKey, seasonNumber, episodeNumber);
    this.episodeHistoryStates.update((states) => ({
      ...states,
      [eventId]: preferredHistoryStatus(states[eventId], status),
    }));
  }

  private updateBrowser(
    showKey: string,
    update: (state: FavoriteBrowserState) => FavoriteBrowserState,
  ): void {
    this.browserStates.update((states) => {
      const current = states[showKey];
      if (!current) return states;
      return { ...states, [showKey]: update(current) };
    });
  }
}

function favoriteEpisodeEventId(
  showKey: string,
  seasonNumber: number,
  episodeNumber: number,
): string {
  return `${showKey}:s${seasonNumber}:e${episodeNumber}`;
}

function preferredHistoryStatus(
  current: DownloadHistoryStatus | undefined,
  next: DownloadHistoryStatus,
): DownloadHistoryStatus {
  const priority: Record<DownloadHistoryStatus, number> = {
    canceled: 0,
    completed: 1,
    downloaded: 2,
    pending: 3,
  };
  return !current || priority[next] > priority[current] ? next : current;
}
