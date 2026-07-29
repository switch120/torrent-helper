import { CommonModule } from "@angular/common";
import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  inject,
  signal,
} from "@angular/core";
import { Router, RouterLink, RouterOutlet } from "@angular/router";
import type { Subscription } from "rxjs";
import { AuthSessionService } from "./auth-session.service";
import { ReleaseApiClient } from "./release-api.client";
import { modalCloseRouteForUrl, modalRoute } from "./route-modal.utils";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly api = inject(ReleaseApiClient);
  private authSubscription: Subscription | null = null;
  private downloadCountTimer: ReturnType<typeof setInterval> | null = null;
  private loadingDownloadCount = false;

  readonly modalActive = signal(false);
  readonly activeDownloadCount = signal(0);
  readonly modalRoute = modalRoute;

  ngOnInit(): void {
    this.authSubscription = this.auth.isAuthenticated$.subscribe((authenticated) => {
      this.stopDownloadCountRefresh();
      this.activeDownloadCount.set(0);
      if (!authenticated) return;

      void this.loadActiveDownloadCount();
      this.downloadCountTimer = setInterval(() => {
        void this.loadActiveDownloadCount();
      }, 5000);
    });
  }

  ngOnDestroy(): void {
    this.stopDownloadCountRefresh();
    this.authSubscription?.unsubscribe();
  }

  login(): void {
    void this.router.navigate(["/login"], {
      queryParams: { returnUrl: this.router.url === "/login" ? "/" : this.router.url },
    });
  }

  logout(): void {
    this.auth.logout().subscribe(() => {
      void this.router.navigateByUrl("/login");
    });
  }

  onModalActivate(): void {
    this.modalActive.set(true);
  }

  onModalDeactivate(): void {
    this.modalActive.set(false);
  }

  closeModal(): void {
    if (!this.modalActive()) return;
    void this.router.navigate(modalCloseRouteForUrl(this.router.url), { queryParamsHandling: "preserve" });
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeModal();
  }

  private async loadActiveDownloadCount(): Promise<void> {
    if (this.loadingDownloadCount) return;
    this.loadingDownloadCount = true;
    try {
      const response = await this.api.getDownloads();
      this.activeDownloadCount.set(
        response.downloads.filter(
          (download) =>
            download.rawStatus >= 1 &&
            download.rawStatus <= 4 &&
            download.percentDone < 1 &&
            download.status !== "error",
        ).length,
      );
    } catch {
      // Keep the most recent count when Transmission is temporarily unavailable.
    } finally {
      this.loadingDownloadCount = false;
    }
  }

  private stopDownloadCountRefresh(): void {
    if (this.downloadCountTimer) clearInterval(this.downloadCountTimer);
    this.downloadCountTimer = null;
  }
}
