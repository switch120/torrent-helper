import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { ReleaseWeekStore } from "./release-week.store";
import { modalRoute } from "./route-modal.utils";

@Component({
  selector: "app-provider-settings",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="settings-shell">
      <header class="settings-header">
        <a [routerLink]="modalRoute('settings')" queryParamsHandling="preserve" class="back-link">&lt; Settings</a>
        <p class="eyebrow">Release view</p>
        <h1>Providers</h1>
      </header>

      <section class="settings-panel">
        <label class="select-control provider-add-wide">
          <span>Add provider</span>
          <select [ngModel]="''" (ngModelChange)="addProvider($event)">
            <option value="">Choose provider</option>
            @for (provider of store.addableProviderFilters(); track provider.key) {
              <option [value]="provider.key">
                {{ provider.name }} ({{ provider.count ?? 0 }})
              </option>
            }
          </select>
        </label>
      </section>

      <section class="settings-panel">
        <h2>Selected</h2>
        <div class="settings-provider-grid">
          @for (provider of store.selectedProviderFilters(); track provider.key) {
            <button
              type="button"
              class="settings-provider-row"
              [class.is-empty]="provider.disabled"
              (click)="store.removeSelectedProvider(provider.key)"
              [attr.aria-label]="'Remove ' + provider.name"
            >
              <span>{{ provider.name }}</span>
              <strong>{{ provider.count ?? 0 }}</strong>
              <em aria-hidden="true">Remove</em>
            </button>
          } @empty {
            <p class="empty-state">No providers selected.</p>
          }
        </div>
      </section>
    </main>
  `,
})
export class ProviderSettingsComponent {
  readonly store = inject(ReleaseWeekStore);
  readonly modalRoute = modalRoute;

  addProvider(value: string): void {
    if (!value) return;
    this.store.addSelectedProvider(value);
  }
}
