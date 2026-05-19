import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import type {
  AuthenticatedUser,
  AddDownloadResponse,
  DownloadDuplicateResponse,
  DownloadHistoryEntry,
  DownloadListResponse,
  FavoriteShowSummary,
  ReleaseDetail,
  ReleaseWeekResponse,
  TorrentSearchQuality,
  TorrentSearchResponse,
  UserSettings,
} from "./release.models";

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

  getReleaseDetail(eventId: string): Promise<ReleaseDetail> {
    return firstValueFrom(
      this.http.get<ReleaseDetail>(`/api/releases/${encodeURIComponent(eventId)}/detail`),
    );
  }

  searchTorrents(
    eventId: string,
    quality: TorrentSearchQuality,
  ): Promise<TorrentSearchResponse> {
    const params = new HttpParams().set("quality", quality);
    return firstValueFrom(
      this.http.get<TorrentSearchResponse>(
        `/api/releases/${encodeURIComponent(eventId)}/torrents`,
        { params },
      ),
    );
  }

  addDownload(
    eventId: string,
    magnetLink: string,
    downloadDir: string,
  ): Promise<AddDownloadResponse> {
    return firstValueFrom(
      this.http.post<AddDownloadResponse>(
        `/api/releases/${encodeURIComponent(eventId)}/downloads`,
        { magnetLink, downloadDir },
      ),
    );
  }

  getDownloads(): Promise<DownloadListResponse> {
    return firstValueFrom(this.http.get<DownloadListResponse>("/api/downloads"));
  }

  getDownloadHistory(): Promise<DownloadHistoryEntry[]> {
    return firstValueFrom(this.http.get<DownloadHistoryEntry[]>("/api/downloads/history"));
  }

  checkDownloadDuplicate(magnetLink: string): Promise<DownloadDuplicateResponse> {
    const params = new HttpParams().set("magnetLink", magnetLink);
    return firstValueFrom(
      this.http.get<DownloadDuplicateResponse>("/api/downloads/history/duplicate", { params }),
    );
  }

  deleteDownloadHistory(id: number): Promise<{ deleted: boolean }> {
    return firstValueFrom(
      this.http.delete<{ deleted: boolean }>(`/api/downloads/history/${id}`),
    );
  }

  getSettings(): Promise<UserSettings> {
    return firstValueFrom(this.http.get<UserSettings>("/api/settings"));
  }

  updateSettings(settings: UserSettings): Promise<UserSettings> {
    return firstValueFrom(this.http.put<UserSettings>("/api/settings", settings));
  }

  getFavorites(): Promise<FavoriteShowSummary[]> {
    return firstValueFrom(this.http.get<FavoriteShowSummary[]>("/api/favorites"));
  }

  addFavorite(eventId: string): Promise<FavoriteShowSummary> {
    return firstValueFrom(
      this.http.post<FavoriteShowSummary>("/api/favorites", { eventId }),
    );
  }

  removeFavorite(showKey: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(
      this.http.delete<{ deleted: boolean }>(`/api/favorites/${encodeURIComponent(showKey)}`),
    );
  }

  getProfile(): Promise<AuthenticatedUser> {
    return firstValueFrom(this.http.get<AuthenticatedUser>("/api/auth/me"));
  }
}
