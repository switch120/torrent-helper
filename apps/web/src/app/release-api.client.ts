import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import type { ReleaseWeekResponse } from "./release.models";

@Injectable({ providedIn: "root" })
export class ReleaseApiClient {
  private readonly http = inject(HttpClient);

  getWeek(weekStart: string): Promise<ReleaseWeekResponse> {
    const params = new HttpParams().set("start", weekStart);
    return firstValueFrom(
      this.http.get<ReleaseWeekResponse>("/api/releases/week", { params }),
    );
  }

  refreshWeek(weekStart: string): Promise<ReleaseWeekResponse> {
    return firstValueFrom(
      this.http.post<ReleaseWeekResponse>("/api/releases/week/refresh", {
        weekStart,
      }),
    );
  }
}
