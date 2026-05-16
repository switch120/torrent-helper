import { CommonModule } from "@angular/common";
import { Component, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ReleaseWeekStore } from "./release-week.store";
import { releaseKey, startOfIsoWeek } from "./release-week.utils";
import type { DigitalRelease } from "./release.models";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [ReleaseWeekStore],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent implements OnInit {
  readonly store = inject(ReleaseWeekStore);
  readonly releaseKey = (_index: number, release: DigitalRelease) => releaseKey(release);

  ngOnInit(): void {
    void this.store.loadWeek();
  }

  onDateChange(value: string): void {
    if (!value) return;
    void this.store.loadWeek(startOfIsoWeek(new Date(`${value}T00:00:00.000Z`)));
  }
}
