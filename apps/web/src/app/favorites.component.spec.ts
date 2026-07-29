// @vitest-environment jsdom

import { provideZonelessChangeDetection, ɵresolveComponentResources } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FavoritesComponent } from "./favorites.component";
import { ReleaseApiClient } from "./release-api.client";
import type { FavoriteShowSummary, TorrentResult } from "./release.models";

describe("FavoritesComponent episode browser", () => {
  const favorite = show();
  const api = {
    getFavorites: vi.fn(),
    getDownloadHistory: vi.fn(),
    removeFavorite: vi.fn(),
    getFavoriteSeason: vi.fn(),
    searchFavoriteEpisodeTorrents: vi.fn(),
    checkDownloadDuplicate: vi.fn(),
    addFavoriteEpisodeDownload: vi.fn(),
  };

  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    await ɵresolveComponentResources((url) =>
      readFile(new URL(url, import.meta.url), "utf8"),
    );
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.getFavorites.mockResolvedValue([favorite]);
    api.getDownloadHistory.mockResolvedValue([]);
    api.getFavoriteSeason.mockResolvedValue({
      showKey: favorite.showKey,
      seasonNumber: 3,
      airDate: "2026-07-01",
      overview: "Current season",
      posterUrl: null,
      episodes: [
        {
          name: "Premiere",
          seasonNumber: 3,
          episodeNumber: 1,
          airDate: "2026-07-01",
          overview: "The season begins.",
        },
      ],
    });
    api.searchFavoriteEpisodeTorrents.mockResolvedValue({
      results: [torrent()],
      warning: null,
    });
    api.checkDownloadDuplicate.mockResolvedValue({
      duplicate: false,
      historyRecord: null,
      warning: null,
    });
    api.addFavoriteEpisodeDownload.mockResolvedValue({
      download: null,
      historyRecord: { status: "pending", downloadDir: "/data/TV/Example Show" },
      duplicate: false,
      warning: null,
    });

    TestBed.configureTestingModule({
      imports: [FavoritesComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReleaseApiClient, useValue: api },
      ],
    });
  });

  it("selects the current season, defaults to 2160p, and searches the expanded episode", async () => {
    const fixture = TestBed.createComponent(FavoritesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBeNull();

    const toggle = fixture.nativeElement.querySelector(".episode-browser-toggle") as HTMLButtonElement;
    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const controls = fixture.nativeElement.querySelectorAll(
      ".episode-browser-controls select",
    ) as NodeListOf<HTMLSelectElement>;
    expect(controls).toHaveLength(2);
    expect(controls[0].selectedOptions[0]?.textContent).toContain("Season 3 · Current");
    expect(controls[1].value).toBe("2160p");
    expect(fixture.componentInstance.browserState(favorite.showKey)?.seasonNumber).toBe(3);
    expect(api.getFavoriteSeason).toHaveBeenCalledWith("tmdb:100", 3);

    const episode = fixture.nativeElement.querySelector(".episode-row-summary") as HTMLButtonElement;
    episode.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.searchFavoriteEpisodeTorrents).toHaveBeenCalledWith(
      "tmdb:100",
      3,
      1,
      "2160p",
    );
    expect(fixture.nativeElement.querySelector(".episode-torrent-row strong")?.textContent)
      .toContain("Example Show S03E01 2160p");
    expect(api.checkDownloadDuplicate).toHaveBeenCalledWith("magnet:?xt=urn:btih:example");
    expect((fixture.nativeElement.querySelector(".episode-download-button") as HTMLButtonElement).textContent)
      .toContain("Download");
  });

  it("opens an editable TV-path prompt and adds the selected episode torrent", async () => {
    const fixture = TestBed.createComponent(FavoritesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".episode-browser-toggle") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector(".episode-row-summary") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".episode-download-button") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input[aria-label="TV episode download directory"]',
    ) as HTMLInputElement;
    expect(input.value).toBe("/data/TV");
    input.value = "/data/TV/Example Show";
    input.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".add-dialog .refresh-button") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.addFavoriteEpisodeDownload).toHaveBeenCalledWith(
      "tmdb:100",
      3,
      1,
      "magnet:?xt=urn:btih:example",
      "/data/TV/Example Show",
    );
    expect(fixture.nativeElement.querySelector(".add-dialog")).toBeNull();
    expect((fixture.nativeElement.querySelector(".episode-download-button") as HTMLButtonElement).textContent)
      .toContain("Downloading");
    expect(fixture.componentInstance.favorites()[0]?.preferredDownloadDir)
      .toBe("/data/TV/Example Show");

    const episode = fixture.nativeElement.querySelector(".episode-row-summary") as HTMLButtonElement;
    expect(episode.querySelector(".episode-row-download-status")?.textContent).toContain("Downloading");
    episode.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(".episode-torrent-panel")).toBeNull();
    expect(episode.querySelector(".episode-row-download-status")?.textContent).toContain("Downloading");
  });

  it("starts the dialog at the directory last used for that show", async () => {
    api.getFavorites.mockResolvedValue([{
      ...favorite,
      preferredDownloadDir: "/data/TV/House of the Dragon",
    }]);
    const fixture = TestBed.createComponent(FavoritesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".episode-browser-toggle") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector(".episode-row-summary") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector(".episode-download-button") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input[aria-label="TV episode download directory"]',
    ) as HTMLInputElement;
    expect(input.value).toBe("/data/TV/House of the Dragon");
  });

  it("shows an account-history download on the episode row before torrent drill-down", async () => {
    api.getDownloadHistory.mockResolvedValue([{
      releaseEventId: "tmdb:100:s3:e1",
      status: "pending",
    }]);
    const fixture = TestBed.createComponent(FavoritesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".episode-browser-toggle") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(".episode-torrent-panel")).toBeNull();
    expect(fixture.nativeElement.querySelector(".episode-row-download-status")?.textContent)
      .toContain("Downloading");
  });

  it("grays out a torrent that is already in download history", async () => {
    api.checkDownloadDuplicate.mockResolvedValue({
      duplicate: true,
      historyRecord: { status: "pending" },
      warning: "This magnet was already added.",
    });
    const fixture = TestBed.createComponent(FavoritesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".episode-browser-toggle") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector(".episode-row-summary") as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(".episode-download-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Downloading");
    expect(fixture.nativeElement.querySelector(".episode-torrent-row.is-download-known")).not.toBeNull();
  });
});

function show(): FavoriteShowSummary {
  return {
    showKey: "tmdb:100",
    tmdbId: 100,
    sourceTitleId: 500,
    title: "Example Show",
    posterUrl: null,
    backdropUrl: null,
    overview: "A favorite show.",
    status: "Returning Series",
    isCanceled: false,
    currentSeasonNumber: 3,
    numberOfSeasons: 3,
    numberOfEpisodes: 21,
    lastAirDate: "2026-07-01",
    lastEpisode: {
      name: "Premiere",
      seasonNumber: 3,
      episodeNumber: 1,
      airDate: "2026-07-01",
    },
    nextEpisode: null,
    releaseContext: null,
    preferredDownloadDir: null,
    fetchedAt: "2026-07-01T12:00:00.000Z",
  };
}

function torrent(): TorrentResult {
  return {
    id: "torrent",
    title: "Example Show S03E01 2160p WEB-DL",
    indexer: "Indexer",
    magnetLink: "magnet:?xt=urn:btih:example",
    sizeBytes: 8_000_000_000,
    seeders: 42,
    leechers: 3,
    quality: "2160p",
    publishedAt: "2026-07-01T12:00:00.000Z",
    confidence: 94,
  };
}
