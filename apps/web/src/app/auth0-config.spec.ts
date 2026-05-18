import { describe, expect, it, vi } from "vitest";
import { buildAuth0Config } from "./auth0-config";

describe("buildAuth0Config", () => {
  it("uses durable local storage with refresh tokens", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:4200" } });

    const config = buildAuth0Config({
      domain: "https://example.us.auth0.com/",
      audience: "release-api",
      clientId: "client-id",
      configured: true,
    });

    expect(config.domain).toBe("example.us.auth0.com");
    expect(config.cacheLocation).toBe("localstorage");
    expect(config.useRefreshTokens).toBe(true);
    expect(config.authorizationParams).toEqual(
      expect.objectContaining({
        audience: "release-api",
        redirect_uri: "http://localhost:4200",
      }),
    );

    vi.unstubAllGlobals();
  });
});
