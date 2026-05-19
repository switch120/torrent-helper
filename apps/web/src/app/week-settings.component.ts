import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ReleaseWeekStore } from "./release-week.store";
import { modalRoute } from "./route-modal.utils";

@Component({
  selector: "app-week-settings",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="settings-shell">
      <header class="settings-header">
        <p class="eyebrow">Release view</p>
        <h1>Settings</h1>
      </header>

      <section class="settings-panel" aria-label="TV release favorites filter">
        <h2>Shows</h2>
        <div class="radio-filter" role="radiogroup" aria-label="TV release favorites filter">
          <label class="pill-toggle">
            <input
              type="radio"
              name="week-settings-favorite-filter"
              [checked]="!store.showOnlyFavorites()"
              (change)="store.setShowOnlyFavorites(false)"
            >
            <span>All</span>
          </label>
          <label class="pill-toggle">
            <input
              type="radio"
              name="week-settings-favorite-filter"
              [checked]="store.showOnlyFavorites()"
              (change)="store.setShowOnlyFavorites(true)"
            >
            <span>Favorites</span>
          </label>
        </div>
      </section>

      <section class="settings-panel" aria-label="Language filters">
        <h2>Language</h2>
        <div class="settings-filter-row">
          <span>International</span>
          <div class="radio-filter" role="radiogroup" aria-label="International release visibility">
            <label class="pill-toggle">
              <input
                type="radio"
                name="week-settings-international-filter"
                [checked]="!store.showInternational()"
                (change)="store.setShowInternational(false)"
              >
              <span>Hide</span>
            </label>
            <label class="pill-toggle">
              <input
                type="radio"
                name="week-settings-international-filter"
                [checked]="store.showInternational()"
                (change)="store.setShowInternational(true)"
              >
              <span>Show</span>
            </label>
          </div>
        </div>
        <div class="settings-filter-row">
          <span>Dubbed</span>
          <div class="radio-filter" role="radiogroup" aria-label="Dubbed release visibility">
            <label class="pill-toggle">
              <input
                type="radio"
                name="week-settings-dubbed-filter"
                [checked]="!store.showDubbed()"
                (change)="store.setShowDubbed(false)"
              >
              <span>Hide</span>
            </label>
            <label class="pill-toggle">
              <input
                type="radio"
                name="week-settings-dubbed-filter"
                [checked]="store.showDubbed()"
                (change)="store.setShowDubbed(true)"
              >
              <span>Show</span>
            </label>
          </div>
        </div>
      </section>

      <nav class="settings-list" aria-label="Release settings">
        <a [routerLink]="modalRoute('settings', 'providers')" queryParamsHandling="preserve">
          <span>
            <strong>Providers</strong>
            <small>{{ store.selectedProviderFilters().length }} selected</small>
          </span>
          <em aria-hidden="true">&gt;</em>
        </a>
        <a [routerLink]="modalRoute('settings', 'hidden-shows')" queryParamsHandling="preserve">
          <span>
            <strong>Hidden shows</strong>
            <small>{{ store.hiddenShowFilters().length }} hidden this week</small>
          </span>
          <em aria-hidden="true">&gt;</em>
        </a>
      </nav>
    </main>
  `,
})
export class WeekSettingsComponent {
  readonly store = inject(ReleaseWeekStore);
  readonly modalRoute = modalRoute;
}
