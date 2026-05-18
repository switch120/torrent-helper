import type { AuthConfig } from "@auth0/auth0-angular";
import type { AuthPublicConfig } from "./release.models";

export function buildAuth0Config(authConfig: AuthPublicConfig): AuthConfig {
  return {
    domain: normalizeAuth0Domain(authConfig.domain),
    clientId: authConfig.clientId,
    cacheLocation: "localstorage",
    useRefreshTokens: true,
    authorizationParams: {
      audience: authConfig.audience,
      redirect_uri: window.location.origin,
      scope: "openid profile email",
    },
    httpInterceptor: {
      allowedList: [
        {
          uri: "/api/*",
          tokenOptions: {
            authorizationParams: {
              audience: authConfig.audience,
            },
          },
        },
      ],
    },
  };
}

function normalizeAuth0Domain(domain: string): string {
  return domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
