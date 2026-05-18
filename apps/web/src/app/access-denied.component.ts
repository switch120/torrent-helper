import { Component, inject } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";

@Component({
  selector: "app-access-denied",
  standalone: true,
  template: `
    <main class="release-shell">
      <section class="empty-state access-denied">
        <p class="eyebrow">Access denied</p>
        <h1>This Auth0 user is not allowed here.</h1>
        <p>Use the allowlisted Google account for this utility.</p>
        <div class="access-actions">
          <button type="button" class="refresh-button" (click)="login()">Login with Google</button>
          <button type="button" class="borderless-button" (click)="logout()">Logout</button>
        </div>
      </section>
    </main>
  `,
})
export class AccessDeniedComponent {
  private readonly auth = inject(AuthService);

  login(): void {
    this.auth.loginWithRedirect({
      authorizationParams: { connection: "google-oauth2" },
    }).subscribe();
  }

  logout(): void {
    this.auth.logout({
      logoutParams: { returnTo: window.location.origin },
    }).subscribe();
  }
}
