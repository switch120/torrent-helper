import { inject } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { CanActivateFn, Router } from "@angular/router";
import { combineLatest, firstValueFrom } from "rxjs";
import { filter, take } from "rxjs/operators";
import { googleLoginAuthorizationParams, isForbiddenAuthError, isUnauthorizedAuthError } from "./auth-routing.utils";
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
        authorizationParams: googleLoginAuthorizationParams,
      }),
    );
    return false;
  }

  try {
    await api.getProfile();
    return true;
  } catch (error) {
    if (isUnauthorizedAuthError(error)) {
      await firstValueFrom(
        auth.loginWithRedirect({
          appState: { target: state.url },
          authorizationParams: googleLoginAuthorizationParams,
        }),
      );
      return false;
    }

    if (isForbiddenAuthError(error)) {
      return router.createUrlTree(["/access-denied"]);
    }

    return false;
  }
};
