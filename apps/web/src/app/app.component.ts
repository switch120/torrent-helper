import { CommonModule } from "@angular/common";
import { Component, HostListener, ViewEncapsulation, inject, signal } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { Router, RouterLink, RouterOutlet } from "@angular/router";
import { googleLoginAuthorizationParams } from "./auth-routing.utils";
import { closeModalRoute, modalRoute } from "./route-modal.utils";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly modalActive = signal(false);
  readonly closeModalRoute = closeModalRoute;
  readonly modalRoute = modalRoute;

  login(): void {
    this.auth.loginWithRedirect({
      authorizationParams: googleLoginAuthorizationParams,
    }).subscribe();
  }

  logout(): void {
    this.auth.logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    }).subscribe();
  }

  onModalActivate(): void {
    this.modalActive.set(true);
  }

  onModalDeactivate(): void {
    this.modalActive.set(false);
  }

  closeModal(): void {
    if (!this.modalActive()) return;
    void this.router.navigate(closeModalRoute(), { queryParamsHandling: "preserve" });
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeModal();
  }
}
