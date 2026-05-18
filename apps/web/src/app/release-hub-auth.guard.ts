import { inject } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { CanActivateFn, Router } from "@angular/router";
import { combineLatest, firstValueFrom } from "rxjs";
import { filter, take } from "rxjs/operators";
import { ReleaseApiClient } from "./release-api.client";

export const releaseHubAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const api = inject(ReleaseApiClient);
  const router = inject(Router);

  const [, authenticated] = await firstValueFrom(
    combineLatest([auth.isLoading$, auth.isAuthenticated$]).pipe(
      filter(([loading]) => !loading),
      take(1),
    ),
  );

  if (!authenticated) {
    await firstValueFrom(
      auth.loginWithRedirect({
        appState: { target: state.url },
        authorizationParams: { connection: "google-oauth2" },
      }),
    );
    return false;
  }

  try {
    await api.getProfile();
    return true;
  } catch {
    return router.createUrlTree(["/access-denied"]);
  }
};
