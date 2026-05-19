import { Component, OnInit, inject, signal } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { googleLoginAuthorizationParams } from "./auth-routing.utils";
import { ReleaseApiClient } from "./release-api.client";

@Component({
  selector: "app-access-denied",
  standalone: true,
  template: `
    <main class="release-shell">
      <section class="empty-state access-denied">
        <p class="eyebrow">Access denied</p>
        <h1>This Auth0 user is not allowed here.</h1>
        <p>Use the allowlisted Google account for this utility.</p>
        @if (checkingAccess()) {
          <p>Rechecking your current session...</p>
        }
        <div class="access-actions">
          <button type="button" class="refresh-button" (click)="login()">Login with Google</button>
          <button type="button" class="borderless-button" (click)="logout()">Logout</button>
        </div>
      </section>
    </main>
  `,
})
export class AccessDeniedComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ReleaseApiClient);
  private readonly router = inject(Router);

  readonly checkingAccess = signal(false);

  ngOnInit(): void {
    void this.recheckAccess();
  }

  login(): void {
    this.auth.loginWithRedirect({
      authorizationParams: googleLoginAuthorizationParams,
    }).subscribe();
  }

  logout(): void {
    this.auth.logout({
      logoutParams: { returnTo: window.location.origin },
    }).subscribe();
  }

  private async recheckAccess(): Promise<void> {
    const isAuthenticated = await firstValueFrom(this.auth.isAuthenticated$);
    if (!isAuthenticated) return;

    this.checkingAccess.set(true);
    try {
      await this.api.getProfile();
      await this.router.navigateByUrl("/");
    } catch {
      // Stay on the access-denied screen for real forbidden users.
    } finally {
      this.checkingAccess.set(false);
    }
  }
}
