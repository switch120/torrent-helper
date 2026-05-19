import type { Routes } from "@angular/router";
import { AccessDeniedComponent } from "./access-denied.component";
import { DownloadHistoryComponent } from "./download-history.component";
import { DownloadsComponent } from "./downloads.component";
import { FavoritesComponent } from "./favorites.component";
import { HiddenShowsComponent } from "./hidden-shows.component";
import { ProviderSettingsComponent } from "./provider-settings.component";
import { releaseHubAuthGuard } from "./release-hub-auth.guard";
import { ReleaseDetailComponent } from "./release-detail.component";
import { WeekSettingsComponent } from "./week-settings.component";
import { WeekBrowserComponent } from "./week-browser.component";

export const routes: Routes = [
  { path: "", component: WeekBrowserComponent, canActivate: [releaseHubAuthGuard] },
  { path: "release/:eventId", component: ReleaseDetailComponent, canActivate: [releaseHubAuthGuard] },
  { path: "downloads", component: DownloadsComponent, canActivate: [releaseHubAuthGuard] },
  { path: "favorites", component: FavoritesComponent, canActivate: [releaseHubAuthGuard] },
  { path: "release/:eventId", component: ReleaseDetailComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "downloads", component: DownloadsComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "downloads/history", component: DownloadHistoryComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "favorites", component: FavoritesComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "settings", component: WeekSettingsComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "settings/providers", component: ProviderSettingsComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "settings/hidden-shows", component: HiddenShowsComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "access-denied", component: AccessDeniedComponent },
  { path: "**", redirectTo: "" },
];
