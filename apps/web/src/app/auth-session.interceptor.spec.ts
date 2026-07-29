import "@angular/compiler";
import { HttpErrorResponse, HttpRequest } from "@angular/common/http";
import { Injector, runInInjectionContext } from "@angular/core";
import { firstValueFrom, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { authSessionInterceptor } from "./auth-session.interceptor";
import { AuthSessionService } from "./auth-session.service";

describe("authSessionInterceptor", () => {
  it("keeps the refreshed session when the retried endpoint fails", async () => {
    const expired = new HttpErrorResponse({
      status: 401,
      error: { code: "access_token_expired" },
    });
    const retryFailure = new HttpErrorResponse({
      status: 500,
      error: { message: "Temporary failure" },
    });
    const auth = {
      ensureAccessToken: vi.fn(() => of("expired-token")),
      refreshAccessToken: vi.fn(() => of("refreshed-token")),
      clearSession: vi.fn(),
    };
    const next = vi
      .fn()
      .mockReturnValueOnce(throwError(() => expired))
      .mockReturnValueOnce(throwError(() => retryFailure));
    const request = new HttpRequest("GET", "/api/favorites");
    const injector = Injector.create({
      providers: [{ provide: AuthSessionService, useValue: auth }],
    });

    const result = runInInjectionContext(injector, () =>
      firstValueFrom(authSessionInterceptor(request, next)),
    );

    await expect(result).rejects.toBe(retryFailure);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[1]?.[0].headers.get("Authorization")).toBe(
      "Bearer refreshed-token",
    );
    expect(auth.clearSession).not.toHaveBeenCalled();
  });

  it("clears the session when token refresh itself fails", async () => {
    const expired = new HttpErrorResponse({
      status: 401,
      error: { code: "access_token_expired" },
    });
    const refreshFailure = new HttpErrorResponse({
      status: 401,
      error: { message: "Invalid refresh token" },
    });
    const auth = {
      ensureAccessToken: vi.fn(() => of("expired-token")),
      refreshAccessToken: vi.fn(() =>
        throwError(() => refreshFailure),
      ),
      clearSession: vi.fn(),
    };
    const next = vi.fn(() => throwError(() => expired));
    const request = new HttpRequest("GET", "/api/favorites");
    const injector = Injector.create({
      providers: [{ provide: AuthSessionService, useValue: auth }],
    });

    const result = runInInjectionContext(injector, () =>
      firstValueFrom(authSessionInterceptor(request, next)),
    );

    await expect(result).rejects.toBe(refreshFailure);
    expect(auth.clearSession).toHaveBeenCalledTimes(1);
  });

  it("refreshes once when an unexpired access token receives a generic 401", async () => {
    const rejected = new HttpErrorResponse({
      status: 401,
      error: { message: "Invalid access token" },
    });
    const auth = {
      ensureAccessToken: vi.fn(() => of("still-unexpired-token")),
      refreshAccessToken: vi.fn(() => of("newly-signed-token")),
      clearSession: vi.fn(),
    };
    const next = vi.fn(() => throwError(() => rejected));
    const request = new HttpRequest("GET", "/api/auth/me");
    const injector = Injector.create({
      providers: [{ provide: AuthSessionService, useValue: auth }],
    });

    const result = runInInjectionContext(injector, () =>
      firstValueFrom(authSessionInterceptor(request, next)),
    );

    await expect(result).rejects.toBe(rejected);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[1]?.[0].headers.get("Authorization")).toBe(
      "Bearer newly-signed-token",
    );
    expect(auth.clearSession).not.toHaveBeenCalled();
  });

  it("preserves the session when the retry refresh fails transiently", async () => {
    const rejected = new HttpErrorResponse({ status: 401 });
    const refreshFailure = new HttpErrorResponse({
      status: 503,
      error: { message: "Temporarily unavailable" },
    });
    const auth = {
      ensureAccessToken: vi.fn(() => of("rejected-token")),
      refreshAccessToken: vi.fn(() => throwError(() => refreshFailure)),
      clearSession: vi.fn(),
    };
    const next = vi.fn(() => throwError(() => rejected));
    const request = new HttpRequest("GET", "/api/favorites");
    const injector = Injector.create({
      providers: [{ provide: AuthSessionService, useValue: auth }],
    });

    const result = runInInjectionContext(injector, () =>
      firstValueFrom(authSessionInterceptor(request, next)),
    );

    await expect(result).rejects.toBe(refreshFailure);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(auth.clearSession).not.toHaveBeenCalled();
  });
});
