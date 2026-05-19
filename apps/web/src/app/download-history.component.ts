import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { ReleaseApiClient } from "./release-api.client";
import type { DownloadHistoryEntry, DownloadHistoryStatus } from "./release.models";

@Component({
  selector: "app-download-history",
  standalone: true,
  imports: [CommonModule],
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
                  <div>
                    <h2>{{ entry.title || entry.torrentName }}</h2>
                    <p>{{ entry.torrentName }}</p>
                  </div>
                </div>
                <div class="history-meta">
                  <span>Added {{ entry.createdAt | date: "MMM d, h:mm a" }}</span>
                  @if (entry.tmdbId) {
                    <a
                      class="history-meta-link"
                      [href]="tmdbUrl(entry)"
                      target="_blank"
                      rel="noreferrer"
                      title="Open on TMDB"
                    >TMDB</a>
                  }
                  <span>{{ entry.downloadDir }}</span>
                  <button
                    type="button"
                    class="magnet-icon-button"
                    [title]="magnetTooltip(entry)"
                    aria-label="Show magnet hash"
                  >
                    <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7 4v7a5 5 0 0 0 10 0V4" />
                      <path d="M7 4h4" />
                      <path d="M13 4h4" />
                      <path d="M7 9h4" />
                      <path d="M13 9h4" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="history-actions">
                <span class="history-status" [ngClass]="statusTone(entry.status)">{{ statusLabel(entry.status) }}</span>
                <button
                  type="button"
                  class="trash-button"
                  (click)="remove(entry)"
                  aria-label="Remove download history entry"
                  title="Remove history entry"
                >
                  <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 15h10l1-15" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
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
    const confirmed = window.confirm(`Remove this history entry for ${entry.title || entry.torrentName}?`);
    if (!confirmed) return;

    await this.api.deleteDownloadHistory(entry.id);
    this.history.update((history) => history.filter((item) => item.id !== entry.id));
  }

  magnetPreview(magnetLink: string): string {
    return `${magnetLink.slice(0, 48)}...`;
  }

  magnetTooltip(entry: DownloadHistoryEntry): string {
    return entry.magnetHash || entry.magnetLink;
  }

  tmdbUrl(entry: DownloadHistoryEntry): string {
    const mediaPath = entry.releaseEventId.includes(":tv:") ? "tv" : "movie";
    return `https://www.themoviedb.org/${mediaPath}/${entry.tmdbId}`;
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
