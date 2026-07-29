import { HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { firstValueFrom, from, timeout } from "rxjs";
import { AuthSessionService } from "./auth-session.service";
import { ReleaseApiClient } from "./release-api.client";

const authGuardTimeoutMs = 10_000;

export const releaseHubAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthSessionService);
  const api = inject(ReleaseApiClient);
  const router = inject(Router);

  if (!auth.hasStoredSession()) {
    return router.createUrlTree(["/login"], {
      queryParams: { returnUrl: state.url },
    });
  }

  try {
    const token = await firstValueFrom(
      auth.ensureAccessToken().pipe(timeout({ first: authGuardTimeoutMs })),
    );
    if (!token) throw new Error("No access token is available.");
    const user = await firstValueFrom(
      from(api.getProfile()).pipe(timeout({ first: authGuardTimeoutMs })),
    );
    auth.storeUserSnapshot(user);
    return true;
  } catch (error) {
    if (isTerminalAuthFailure(error)) auth.clearSession();
    return router.createUrlTree(["/login"], {
      queryParams: { returnUrl: state.url },
    });
  }
};

function isTerminalAuthFailure(error: unknown): boolean {
  return (
    (error instanceof HttpErrorResponse && error.status === 401) ||
    (error instanceof Error && error.message === "No access token is available.")
  );
}
