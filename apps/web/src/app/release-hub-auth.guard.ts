import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { AuthSessionService } from "./auth-session.service";
import { ReleaseApiClient } from "./release-api.client";

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
    const token = await firstValueFrom(auth.ensureAccessToken());
    if (!token) throw new Error("No access token is available.");
    const user = await api.getProfile();
    auth.storeUserSnapshot(user);
    return true;
  } catch {
    auth.clearSession();
    return router.createUrlTree(["/login"], {
      queryParams: { returnUrl: state.url },
    });
  }
};
