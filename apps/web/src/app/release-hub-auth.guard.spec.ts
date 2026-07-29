// @vitest-environment jsdom

import "@angular/compiler";
import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { provideRouter } from "@angular/router";
import { NEVER, of } from "rxjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthSessionService } from "./auth-session.service";
import { ReleaseApiClient } from "./release-api.client";
import { releaseHubAuthGuard } from "./release-hub-auth.guard";

describe("releaseHubAuthGuard", () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("redirects when access-token refresh does not complete", async () => {
    vi.useFakeTimers();
    const auth = {
      hasStoredSession: vi.fn(() => true),
      ensureAccessToken: vi.fn(() => NEVER),
      clearSession: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthSessionService, useValue: auth },
        { provide: ReleaseApiClient, useValue: { getProfile: vi.fn() } },
      ],
    });

    const resultPromise = Promise.resolve(
      TestBed.runInInjectionContext(() =>
        releaseHubAuthGuard({} as never, { url: "/favorites" } as never),
      ),
    );
    await vi.advanceTimersByTimeAsync(10_001);
    const result = await resultPromise;

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(String(result)).toBe("/login?returnUrl=%2Ffavorites");
  });

  it("redirects when the profile request does not complete", async () => {
    vi.useFakeTimers();
    const auth = {
      hasStoredSession: vi.fn(() => true),
      ensureAccessToken: vi.fn(() => of("access-token")),
      storeUserSnapshot: vi.fn(),
      clearSession: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthSessionService, useValue: auth },
        {
          provide: ReleaseApiClient,
          useValue: { getProfile: vi.fn(() => new Promise(() => undefined)) },
        },
      ],
    });

    const resultPromise = Promise.resolve(
      TestBed.runInInjectionContext(() =>
        releaseHubAuthGuard({} as never, { url: "/downloads" } as never),
      ),
    );
    await vi.advanceTimersByTimeAsync(10_001);
    const result = await resultPromise;

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(String(result)).toBe("/login?returnUrl=%2Fdownloads");
  });

  it("clears an invalid session after a profile 401", async () => {
    const auth = {
      hasStoredSession: vi.fn(() => true),
      ensureAccessToken: vi.fn(() => of("access-token")),
      storeUserSnapshot: vi.fn(),
      clearSession: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthSessionService, useValue: auth },
        {
          provide: ReleaseApiClient,
          useValue: {
            getProfile: vi.fn().mockRejectedValue(
              new HttpErrorResponse({ status: 401, statusText: "Unauthorized" }),
            ),
          },
        },
      ],
    });

    const result = await Promise.resolve(
      TestBed.runInInjectionContext(() =>
        releaseHubAuthGuard({} as never, { url: "/favorites" } as never),
      ),
    );

    expect(auth.clearSession).toHaveBeenCalledTimes(1);
    expect(String(result)).toBe("/login?returnUrl=%2Ffavorites");
  });

  it("retains the stored session after a transient profile failure", async () => {
    const auth = {
      hasStoredSession: vi.fn(() => true),
      ensureAccessToken: vi.fn(() => of("access-token")),
      storeUserSnapshot: vi.fn(),
      clearSession: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthSessionService, useValue: auth },
        {
          provide: ReleaseApiClient,
          useValue: {
            getProfile: vi.fn().mockRejectedValue(
              new HttpErrorResponse({ status: 503, statusText: "Unavailable" }),
            ),
          },
        },
      ],
    });

    const result = await Promise.resolve(
      TestBed.runInInjectionContext(() =>
        releaseHubAuthGuard({} as never, { url: "/downloads" } as never),
      ),
    );

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(String(result)).toBe("/login?returnUrl=%2Fdownloads");
  });
});
