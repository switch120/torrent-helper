import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { authHttpInterceptorFn, provideAuth0 } from "@auth0/auth0-angular";
import { AppComponent } from "./app/app.component";
import { routes } from "./app/app.routes";
import { buildAuth0Config } from "./app/auth0-config";
import type { AuthPublicConfig } from "./app/release.models";

loadAuthConfig()
  .then((authConfig) => {
    if (!authConfig.configured) {
      renderAuthConfigError();
      return undefined;
    }

    return bootstrapApplication(AppComponent, {
      providers: [
        provideHttpClient(withInterceptors([authHttpInterceptorFn])),
        provideRouter(routes),
        provideAuth0(buildAuth0Config(authConfig)),
      ],
    });
  })
  .catch((error) => console.error(error));

async function loadAuthConfig(): Promise<AuthPublicConfig> {
  const response = await fetch("/api/auth/config");
  if (!response.ok) {
    throw new Error("Auth configuration could not be loaded.");
  }
  return response.json() as Promise<AuthPublicConfig>;
}

function renderAuthConfigError(): void {
  document.body.innerHTML = `
    <main style="max-width: 720px; margin: 48px auto; padding: 0 18px; font-family: system-ui, sans-serif;">
      <p style="color: #1b758d; font-weight: 800; text-transform: uppercase;">Release Hub</p>
      <h1>Auth0 is not configured</h1>
      <p>Add AUTH0_DOMAIN, AUTH0_AUDIENCE, and AUTH0_CLIENT_ID to .env, then recreate releaseApi and releaseWeb.</p>
    </main>
  `;
}
