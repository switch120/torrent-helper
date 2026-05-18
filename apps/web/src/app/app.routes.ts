import type { Routes } from "@angular/router";
import { AccessDeniedComponent } from "./access-denied.component";
import { DownloadsComponent } from "./downloads.component";
import { FavoritesComponent } from "./favorites.component";
import { releaseHubAuthGuard } from "./release-hub-auth.guard";
import { ReleaseDetailComponent } from "./release-detail.component";
import { WeekBrowserComponent } from "./week-browser.component";

export const routes: Routes = [
  { path: "", component: WeekBrowserComponent, canActivate: [releaseHubAuthGuard] },
  { path: "release/:eventId", component: ReleaseDetailComponent, canActivate: [releaseHubAuthGuard] },
  { path: "downloads", component: DownloadsComponent, canActivate: [releaseHubAuthGuard] },
  { path: "favorites", component: FavoritesComponent, canActivate: [releaseHubAuthGuard] },
  { path: "release/:eventId", component: ReleaseDetailComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "downloads", component: DownloadsComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "favorites", component: FavoritesComponent, outlet: "modal", canActivate: [releaseHubAuthGuard] },
  { path: "access-denied", component: AccessDeniedComponent },
  { path: "**", redirectTo: "" },
];
