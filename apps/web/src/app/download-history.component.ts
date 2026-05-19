import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ReleaseApiClient } from "./release-api.client";
import type { DownloadHistoryEntry, DownloadHistoryStatus } from "./release.models";
import { modalRoute } from "./route-modal.utils";

@Component({
  selector: "app-download-history",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="settings-shell download-history-shell">
      <header class="settings-header">
        <p class="eyebrow">Downloads</p>
        <h1>History</h1>
      </header>

      @if (status() === "loading") {
        <p class="empty-state">Loading download history...</p>
      } @else if (status() === "error") {
        <p class="empty-state">{{ error() }}</p>
      } @else if (history().length === 0) {
        <p class="empty-state">No download history yet.</p>
      } @else {
        <section class="download-history-list" aria-label="Download history">
          @for (entry of history(); track entry.id) {
            <article class="download-history-row">
              <div class="history-main">
                <div class="history-title-line">
                  <h2>{{ entry.title || entry.torrentName }}</h2>
                  <span class="history-status" [ngClass]="statusTone(entry.status)">{{ statusLabel(entry.status) }}</span>
                </div>
                <p>{{ entry.torrentName }}</p>
                <dl>
                  <div>
                    <dt>Added</dt>
                    <dd>{{ entry.createdAt | date: "MMM d, y, h:mm a" }}</dd>
                  </div>
                  <div>
                    <dt>TMDB</dt>
                    <dd>{{ entry.tmdbId || "Unknown" }}</dd>
                  </div>
                  <div>
                    <dt>Save path</dt>
                    <dd>{{ entry.downloadDir }}</dd>
                  </div>
                  <div>
                    <dt>Magnet</dt>
                    <dd>{{ entry.magnetHash || magnetPreview(entry.magnetLink) }}</dd>
                  </div>
                </dl>
              </div>
              <div class="history-actions">
                <a [routerLink]="modalRoute('release', entry.releaseEventId)" queryParamsHandling="preserve">Release detail</a>
                <button type="button" class="borderless-button" (click)="remove(entry)">Remove</button>
              </div>
            </article>
          }
        </section>
      }
    </main>
  `,
})
export class DownloadHistoryComponent implements OnInit {
  private readonly api = inject(ReleaseApiClient);

  readonly history = signal<DownloadHistoryEntry[]>([]);
  readonly status = signal<"loading" | "ready" | "error">("loading");
  readonly error = signal<string | null>(null);
  readonly modalRoute = modalRoute;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.status.set("loading");
    try {
      this.history.set(await this.api.getDownloadHistory());
      this.status.set("ready");
      this.error.set(null);
    } catch (error) {
      this.status.set("error");
      this.error.set(error instanceof Error ? error.message : "Download history is unavailable.");
    }
  }

  async remove(entry: DownloadHistoryEntry): Promise<void> {
    await this.api.deleteDownloadHistory(entry.id);
    this.history.update((history) => history.filter((item) => item.id !== entry.id));
  }

  magnetPreview(magnetLink: string): string {
    return `${magnetLink.slice(0, 48)}...`;
  }

  statusLabel(status: DownloadHistoryStatus): string {
    if (status === "downloaded") return "Downloaded";
    if (status === "completed") return "Completed";
    if (status === "canceled") return "Canceled";
    return "Pending";
  }

  statusTone(status: DownloadHistoryStatus): string {
    return `is-${status}`;
  }
}
