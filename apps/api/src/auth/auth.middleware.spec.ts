import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthMiddleware } from "./auth.middleware";
import type { AuthenticatedRequest } from "./auth.types";

describe("AuthMiddleware", () => {
  it("attaches the first-party user for a valid bearer access token", async () => {
    const user = {
      id: 1,
      username: "admin",
      email: "switch120@gmail.com",
      name: "Scott Byers",
      pictureUrl: null,
    };
    const verifyAccessToken = vi.fn().mockResolvedValue(user);
    const middleware = new AuthMiddleware({ verifyAccessToken } as never);
    const request = {
      path: "/api/favorites",
      headers: { authorization: "Bearer access-token" },
    } as AuthenticatedRequest;

    await new Promise<void>((resolve, reject) => {
      middleware.use(request, {} as never, (error?: unknown) => {
        if (error) reject(error);
        else resolve();
      });
    });

    expect(verifyAccessToken).toHaveBeenCalledWith("access-token");
    expect(request.releaseHubUser).toEqual(user);
  });

  it("rejects protected routes without a bearer token", async () => {
    const middleware = new AuthMiddleware({ verifyAccessToken: vi.fn() } as never);
    const request = {
      path: "/api/favorites",
      headers: {},
    } as AuthenticatedRequest;

    const error = await new Promise<unknown>((resolve) => {
      middleware.use(request, {} as never, (nextError?: unknown) => resolve(nextError));
    });

    expect(error).toBeInstanceOf(UnauthorizedException);
  });

  it("leaves health and token endpoints public", async () => {
    const verifyAccessToken = vi.fn();
    const middleware = new AuthMiddleware({ verifyAccessToken } as never);

    for (const path of ["/api/health", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout"]) {
      await new Promise<void>((resolve, reject) => {
        middleware.use(
          { path, headers: {} } as AuthenticatedRequest,
          {} as never,
          (error?: unknown) => (error ? reject(error) : resolve()),
        );
      });
    }

    expect(verifyAccessToken).not.toHaveBeenCalled();
  });
});
