import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { proxyStatusLabel, proxyToneClass } from "./downloads.utils";
import { ReleaseApiClient } from "./release-api.client";
import type { ProxyHealth, TransmissionDownload } from "./release.models";
import { modalRoute } from "./route-modal.utils";
import { formatBytes, formatEta, formatPeers, formatRate } from "./torrent.utils";

@Component({
  selector: "app-downloads",
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: "./downloads.component.html",
})
export class DownloadsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ReleaseApiClient);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly downloads = signal<TransmissionDownload[]>([]);
  readonly proxy = signal<ProxyHealth | null>(null);
  readonly status = signal<"loading" | "ready" | "error">("loading");
  readonly error = signal<string | null>(null);
  readonly refreshing = signal(false);
  readonly formatBytes = formatBytes;
  readonly formatEta = formatEta;
  readonly formatPeers = formatPeers;
  readonly formatRate = formatRate;
  readonly proxyStatusLabel = proxyStatusLabel;
  readonly proxyToneClass = proxyToneClass;
  readonly modalRoute = modalRoute;

  ngOnInit(): void {
    void this.load(true);
    this.refreshTimer = setInterval(() => void this.load(false), 5000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async load(showLoading = false): Promise<void> {
    if (showLoading && this.downloads().length === 0) {
      this.status.set("loading");
    } else {
      this.refreshing.set(true);
    }

    try {
      const response = await this.api.getDownloads();
      this.downloads.set(response.downloads);
      this.proxy.set(response.proxy);
      this.status.set("ready");
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Downloads are unavailable.");
      if (this.downloads().length === 0) this.status.set("error");
    } finally {
      this.refreshing.set(false);
    }
  }

  progress(download: TransmissionDownload): number {
    return Math.round(download.percentDone * 100);
  }
}
