import { inject } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { CanActivateFn, Router } from "@angular/router";
import { combineLatest, firstValueFrom } from "rxjs";
import { filter, take, timeout } from "rxjs/operators";
import { googleLoginAuthorizationParams, isForbiddenAuthError, isUnauthorizedAuthError } from "./auth-routing.utils";
import { ReleaseApiClient } from "./release-api.client";

const AUTH_STATE_TIMEOUT_MS = 8000;
const PROFILE_TIMEOUT_MS = 10000;

export const releaseHubAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const api = inject(ReleaseApiClient);
  const router = inject(Router);

  let authenticated: boolean;
  try {
    [, authenticated] = await firstValueFrom(
      combineLatest([auth.isLoading$, auth.isAuthenticated$]).pipe(
        filter(([loading]) => !loading),
        take(1),
        timeout(AUTH_STATE_TIMEOUT_MS),
      ),
    );
  } catch {
    await redirectToLogin(auth, state.url);
    return false;
  }

  if (!authenticated) {
    await redirectToLogin(auth, state.url);
    return false;
  }

  try {
    await firstValueFrom(
      auth.getAccessTokenSilently({ timeoutInSeconds: 8 }).pipe(
        take(1),
        timeout(PROFILE_TIMEOUT_MS),
      ),
    );
    await withTimeout(api.getProfile(), PROFILE_TIMEOUT_MS);
    return true;
  } catch (error) {
    if (isUnauthorizedAuthError(error)) {
      await redirectToLogin(auth, state.url);
      return false;
    }

    if (isForbiddenAuthError(error)) {
      return router.createUrlTree(["/access-denied"]);
    }

    await redirectToLogin(auth, state.url);
    return false;
  }
};

function redirectToLogin(auth: AuthService, target: string): Promise<void> {
  return firstValueFrom(
    auth.loginWithRedirect({
      appState: { target },
      authorizationParams: googleLoginAuthorizationParams,
    }),
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error("Auth profile check timed out.")), timeoutMs);
    }),
  ]);
}
