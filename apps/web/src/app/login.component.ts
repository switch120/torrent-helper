import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { finalize } from "rxjs";
import { AuthSessionService } from "./auth-session.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="login-shell">
      <section class="login-card" aria-labelledby="login-title">
        <div class="login-mark" aria-hidden="true">RH</div>
        <p class="eyebrow">Release Hub</p>
        <h1 id="login-title">Welcome back</h1>
        <p class="login-copy">Sign in to browse release weeks, favorites, episodes, and downloads.</p>

        <form class="login-form" (ngSubmit)="login()">
          <label>
            <span>Username</span>
            <input
              name="username"
              type="text"
              autocomplete="username"
              [(ngModel)]="username"
              [disabled]="submitting()"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              [disabled]="submitting()"
              required
            />
          </label>

          @if (errorMessage()) {
            <p class="login-error" role="alert">{{ errorMessage() }}</p>
          }

          <button class="refresh-button login-submit" type="submit" [disabled]="submitting()">
            {{ submitting() ? "Signing in…" : "Sign in" }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  username = "admin";
  password = "";
  readonly submitting = signal(false);
  readonly errorMessage = signal("");

  login(): void {
    if (!this.username.trim() || !this.password || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set("");
    this.auth
      .login(this.username.trim(), this.password)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(this.safeReturnUrl());
        },
        error: () => {
          this.errorMessage.set("That username or password was not recognized.");
        },
      });
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get("returnUrl") || "/";
    return returnUrl.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/";
  }
}
