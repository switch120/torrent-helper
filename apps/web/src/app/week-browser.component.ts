import { CommonModule } from "@angular/common";
import { Component, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ReleaseWeekStore } from "./release-week.store";
import { addWeeks, formatTmdbRating, normalizeWeekStartParam, ratingToneClass, releaseKey, releaseSources, showKey, startOfIsoWeek } from "./release-week.utils";
import type { DigitalRelease, ReleaseProviderSource } from "./release.models";
import { modalRoute } from "./route-modal.utils";

@Component({
  selector: "app-week-browser",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./week-browser.component.html",
})
export class WeekBrowserComponent implements OnInit {
  readonly store = inject(ReleaseWeekStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly releaseKey = (_index: number, release: DigitalRelease) => releaseKey(release);
  readonly formatTmdbRating = formatTmdbRating;
  readonly modalRoute = modalRoute;
  readonly ratingToneClass = ratingToneClass;
  readonly releaseSources = releaseSources;

  ngOnInit(): void {
    const weekStart = normalizeWeekStartParam(this.route.snapshot.queryParamMap.get("week")) ?? this.store.weekStart();
    void this.loadAndRememberWeek(weekStart);
  }

  onDateChange(value: string): void {
    if (!value) return;
    void this.loadAndRememberWeek(startOfIsoWeek(new Date(`${value}T00:00:00.000Z`)));
  }

  previousWeek(): void {
    void this.loadAndRememberWeek(addWeeks(this.store.weekStart(), -1));
  }

  nextWeek(): void {
    void this.loadAndRememberWeek(addWeeks(this.store.weekStart(), 1));
  }

  stop(event: Event): void {
    event.stopPropagation();
  }

  isFavorite(release: DigitalRelease): boolean {
    const key = showKey(release);
    return Boolean(key && this.store.favoriteShowKeySet().has(key));
  }

  addFavorite(event: Event, release: DigitalRelease): void {
    this.stop(event);
    void this.store.addFavorite(release);
  }

  hideProvider(event: Event, source: ReleaseProviderSource): void {
    this.stop(event);
    this.store.hideProviderKey(source.key, source.name);
  }

  private async loadAndRememberWeek(weekStart: string): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { week: weekStart },
      queryParamsHandling: "merge",
    });
    await this.store.loadWeek(weekStart);
  }
}
