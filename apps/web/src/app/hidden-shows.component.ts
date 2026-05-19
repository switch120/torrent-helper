import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ReleaseWeekStore } from "./release-week.store";
import { modalRoute } from "./route-modal.utils";

@Component({
  selector: "app-hidden-shows",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="settings-shell">
      <header class="settings-header">
        <a [routerLink]="modalRoute('settings')" queryParamsHandling="preserve" class="back-link">&lt; Settings</a>
        <p class="eyebrow">Release view</p>
        <h1>Hidden shows</h1>
      </header>

      <section class="settings-panel">
        @if (store.hiddenShowFilters().length === 0) {
          <p class="empty-state">No hidden shows in this week.</p>
        } @else {
          <div class="hidden-show-list">
            @for (show of store.hiddenShowFilters(); track show.key) {
              <article class="hidden-show-row">
                <div class="poster-frame is-small">
                  @if (show.posterUrl) {
                    <img [src]="show.posterUrl" [alt]="show.title + ' poster'" loading="lazy">
                  } @else {
                    <span>{{ show.title.slice(0, 1) }}</span>
                  }
                </div>
                <div>
                  <h2>{{ show.title }}</h2>
                  <p>
                    <time [dateTime]="show.releaseDate">{{ show.releaseDate | date: "EEE, MMM d" }}</time>
                    @if (show.seasonNumber) {
                      <span>Season {{ show.seasonNumber }}</span>
                    }
                    @if (show.episodeNumber) {
                      <span>Episode {{ show.episodeNumber }}</span>
                    }
                  </p>
                </div>
                <button type="button" class="refresh-button" (click)="store.restoreHiddenShow(show.key)">
                  Restore
                </button>
              </article>
            }
          </div>
        }
      </section>
    </main>
  `,
})
export class HiddenShowsComponent {
  readonly store = inject(ReleaseWeekStore);
  readonly modalRoute = modalRoute;
}
