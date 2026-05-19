import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { ReleaseApiClient } from "./release-api.client";
import type { ReleaseCastMember, ReleaseDetail, TorrentResult, TorrentSearchQuality } from "./release.models";
import {
  bottomFetchButtonLabel,
  bottomFetchCueLabel,
  bottomFetchProgress,
} from "./torrent-fetch-hold.utils";
import {
  confidenceLabel,
  confidenceTone,
  formatBytes,
  formatTorrentAge,
  qualityTone,
  sortTorrents,
  type TorrentSortKey,
} from "./torrent.utils";

@Component({
  selector: "app-release-detail",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./release-detail.component.html",
})
export class ReleaseDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReleaseApiClient);
  private bottomFetchObserver: IntersectionObserver | null = null;
  private bottomFetchProgressTimer: ReturnType<typeof setInterval> | null = null;
  private bottomFetchSuppressed = false;
  private bottomFetchStartedAt = 0;
  private bottomFetchInView = false;
  private bottomFetchUserScrolled = false;
  private readonly markBottomFetchScrollIntent = () => {
    this.bottomFetchUserScrolled = true;
    if (this.bottomFetchInView) this.startBottomHold();
  };

  @ViewChild("bottomFetchSentinel")
  set bottomFetchSentinel(element: ElementRef<HTMLElement> | undefined) {
    this.observeBottomFetchSentinel(element?.nativeElement ?? null);
  }

  readonly detail = signal<ReleaseDetail | null>(null);
  readonly torrents = signal<TorrentResult[]>([]);
  readonly status = signal<"loading" | "ready" | "error">("loading");
  readonly torrentStatus = signal<"idle" | "loading" | "ready" | "error">("idle");
  readonly error = signal<string | null>(null);
  readonly torrentWarning = signal<string | null>(null);
  readonly quality = signal<TorrentSearchQuality>("any");
  readonly sortKey = signal<TorrentSortKey>("seeders");
  readonly selectedTorrent = signal<TorrentResult | null>(null);
  readonly downloadDir = signal("/data/Movies/Sourced");
  readonly customDownloadDir = signal("");
  readonly addStatus = signal<"idle" | "adding" | "done" | "error">("idle");
  readonly addError = signal<string | null>(null);
  readonly duplicateWarning = signal<string | null>(null);
  readonly duplicateStatus = signal<"idle" | "checking" | "ready" | "error">("idle");
  readonly hasFetchedTorrents = signal(false);
  readonly bottomHoldActive = signal(false);
  readonly bottomHoldProgress = signal(0);

  readonly sortedTorrents = computed(() => sortTorrents(this.torrents(), this.sortKey()));
  readonly chosenDownloadDir = computed(() =>
    this.downloadDir() === "custom" ? this.customDownloadDir() : this.downloadDir(),
  );
  readonly fetchButtonLabel = computed(() =>
    bottomFetchButtonLabel({
      hasFetched: this.hasFetchedTorrents(),
      loading: this.torrentStatus() === "loading",
    }),
  );
  readonly bottomHoldLabel = computed(() => bottomFetchCueLabel(this.hasFetchedTorrents()));
  readonly bottomHoldPercent = computed(() => `${Math.round(this.bottomHoldProgress() * 100)}%`);

  readonly formatBytes = formatBytes;
  readonly confidenceLabel = confidenceLabel;
  readonly confidenceTone = confidenceTone;
  readonly formatTorrentAge = formatTorrentAge;
  readonly qualityTone = qualityTone;

  ngOnInit(): void {
    document.addEventListener("scroll", this.markBottomFetchScrollIntent, { capture: true, passive: true });
    const eventId = this.route.snapshot.paramMap.get("eventId");
    if (!eventId) {
      this.status.set("error");
      this.error.set("Missing release id.");
      return;
    }
    void this.load(eventId);
  }

  async load(eventId: string): Promise<void> {
    this.status.set("loading");
    try {
      const detail = await this.api.getReleaseDetail(eventId);
      this.detail.set(detail);
      this.status.set("ready");
    } catch (error) {
      this.status.set("error");
      this.error.set(error instanceof Error ? error.message : "Release detail is unavailable.");
    }
  }

  async search(): Promise<void> {
    const detail = this.detail();
    if (!detail) return;
    this.torrentStatus.set("loading");
    this.torrentWarning.set(null);
    this.cancelBottomHold({ resetSuppression: false });
    try {
      const response = await this.api.searchTorrents(detail.eventId, this.quality());
      this.torrents.set(response.results);
      this.torrentWarning.set(response.warning);
      this.torrentStatus.set("ready");
      this.hasFetchedTorrents.set(true);
    } catch (error) {
      this.torrentStatus.set("error");
      this.torrentWarning.set(error instanceof Error ? error.message : "Torrent search is unavailable.");
      this.hasFetchedTorrents.set(true);
    }
  }

  openAddDialog(torrent: TorrentResult): void {
    this.selectedTorrent.set(torrent);
    this.addStatus.set("idle");
    this.addError.set(null);
    this.duplicateWarning.set(null);
    this.duplicateStatus.set("checking");
    this.downloadDir.set(torrent.quality === "2160p" ? "/data/Movies/4k" : "/data/Movies/Sourced");
    void this.checkDuplicate(torrent.magnetLink);
  }

  closeAddDialog(): void {
    this.selectedTorrent.set(null);
  }

  async addSelectedTorrent(): Promise<void> {
    const detail = this.detail();
    const torrent = this.selectedTorrent();
    if (!detail || !torrent) return;
    this.addStatus.set("adding");
    this.addError.set(null);
    try {
      const response = await this.api.addDownload(detail.eventId, torrent.magnetLink, this.chosenDownloadDir());
      if (response.warning) this.duplicateWarning.set(response.warning);
      this.addStatus.set("done");
      this.selectedTorrent.set(null);
    } catch (error) {
      this.addStatus.set("error");
      this.addError.set(error instanceof Error ? error.message : "Download could not be added.");
    }
  }

  setQuality(value: string): void {
    if (value === "1080p" || value === "2160p" || value === "any") {
      this.quality.set(value);
    }
  }

  setSortKey(value: string): void {
    if (value === "seeders" || value === "size" || value === "quality" || value === "confidence") {
      this.sortKey.set(value);
    }
  }

  castProfileUrl(member: ReleaseCastMember): string {
    return member.id
      ? `https://www.themoviedb.org/person/${member.id}`
      : `https://www.themoviedb.org/search?query=${encodeURIComponent(member.name)}`;
  }

  ngOnDestroy(): void {
    document.removeEventListener("scroll", this.markBottomFetchScrollIntent, { capture: true });
    this.cancelBottomHold({ resetSuppression: true });
    this.bottomFetchObserver?.disconnect();
  }

  private observeBottomFetchSentinel(element: HTMLElement | null): void {
    this.bottomFetchObserver?.disconnect();
    this.bottomFetchObserver = null;
    if (!element || typeof IntersectionObserver === "undefined") return;

    this.bottomFetchObserver = new IntersectionObserver((entries) => {
      const isAtBottom = entries.some((entry) => entry.isIntersecting);
      this.bottomFetchInView = isAtBottom;
      if (isAtBottom) {
        this.startBottomHold();
      } else {
        this.cancelBottomHold({ resetSuppression: true });
      }
    });
    this.bottomFetchObserver.observe(element);
  }

  private startBottomHold(): void {
    if (!this.bottomFetchUserScrolled || !this.canBottomFetch() || this.bottomFetchSuppressed || this.bottomHoldActive()) {
      return;
    }

    this.bottomFetchStartedAt = Date.now();
    this.bottomHoldActive.set(true);
    this.bottomHoldProgress.set(0);
    this.bottomFetchProgressTimer = setInterval(() => {
      const progress = bottomFetchProgress(this.bottomFetchStartedAt, Date.now());
      this.bottomHoldProgress.set(progress);
      if (progress >= 1) {
        this.bottomFetchSuppressed = true;
        void this.search();
      }
    }, 50);
  }

  private cancelBottomHold(input: { resetSuppression: boolean }): void {
    if (this.bottomFetchProgressTimer) {
      clearInterval(this.bottomFetchProgressTimer);
      this.bottomFetchProgressTimer = null;
    }
    this.bottomHoldActive.set(false);
    this.bottomHoldProgress.set(0);
    if (input.resetSuppression) this.bottomFetchSuppressed = false;
  }

  private canBottomFetch(): boolean {
    return this.status() === "ready" && this.torrentStatus() !== "loading" && Boolean(this.detail());
  }

  private async checkDuplicate(magnetLink: string): Promise<void> {
    try {
      const response = await this.api.checkDownloadDuplicate(magnetLink);
      this.duplicateWarning.set(response.warning);
      this.duplicateStatus.set("ready");
    } catch {
      this.duplicateStatus.set("error");
    }
  }
}
