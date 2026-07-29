// @vitest-environment jsdom

import "@angular/compiler";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { firstValueFrom } from "rxjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionService } from "./auth-session.service";

describe("AuthSessionService", () => {
  let service: AuthSessionService;
  let http: HttpTestingController;

  const session = {
    accessToken: "header.eyJleHAiOjQxMDI0NDQ4MDB9.signature",
    refreshToken: "refresh-token",
    user: {
      id: 1,
      username: "admin",
      email: "switch120@gmail.com",
      name: "Scott Byers",
      pictureUrl: null,
    },
  };

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthSessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http?.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it("stores the username/password token pair and user snapshot after login", () => {
    service.login("admin", "admin@123").subscribe();

    const request = http.expectOne("/api/auth/login");
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({
      username: "admin",
      password: "admin@123",
    });
    request.flush(session);

    expect(service.snapshot()).toEqual(session.user);
    expect(service.hasStoredSession()).toBe(true);
    expect(localStorage.getItem("release-hub.auth.session.v1")).toContain(
      "\"refreshToken\":\"refresh-token\"",
    );
  });

  it("clears the browser session and revokes the refresh token on logout", () => {
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);

    service.logout().subscribe();

    const request = http.expectOne("/api/auth/logout");
    expect(request.request.body).toEqual({ refreshToken: "refresh-token" });
    request.flush({ loggedOut: true });
    expect(service.hasStoredSession()).toBe(false);
    expect(localStorage.getItem("release-hub.auth.session.v1")).toBeNull();
  });

  it("clears the in-memory session when another tab removes stored auth", async () => {
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);

    localStorage.removeItem("release-hub.auth.session.v1");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "release-hub.auth.session.v1",
        newValue: null,
      }),
    );

    expect(service.snapshot()).toBeUndefined();
    expect(service.hasStoredSession()).toBe(false);
    await expect(firstValueFrom(service.ensureAccessToken())).resolves.toBeUndefined();
  });

  it("adopts a newer session from another tab when a stale refresh is rejected", async () => {
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);

    const refreshedAccessToken = firstValueFrom(service.refreshAccessToken(true));
    const staleRefresh = http.expectOne("/api/auth/refresh");
    expect(staleRefresh.request.body).toEqual({ refreshToken: "refresh-token" });

    const newerSession = {
      ...session,
      accessToken: "header.eyJleHAiOjQxMDI0NDQ4MDB9.new-signature",
      refreshToken: "rotated-refresh-token",
    };
    localStorage.setItem(
      "release-hub.auth.session.v1",
      JSON.stringify(newerSession),
    );
    staleRefresh.flush(
      { message: "Invalid refresh token." },
      { status: 401, statusText: "Unauthorized" },
    );

    await expect(refreshedAccessToken).resolves.toBe(newerSession.accessToken);
    expect(service.snapshot()).toEqual(newerSession.user);
    expect(service.hasStoredSession()).toBe(true);
    expect(localStorage.getItem("release-hub.auth.session.v1")).toContain(
      "\"refreshToken\":\"rotated-refresh-token\"",
    );
  });

  it("waits for a cross-tab storage event beyond the old one-second window", async () => {
    vi.useFakeTimers();
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);

    const refreshedAccessToken = firstValueFrom(service.refreshAccessToken(true));
    const staleRefresh = http.expectOne("/api/auth/refresh");
    const newerSession = {
      ...session,
      accessToken: "header.eyJleHAiOjQxMDI0NDQ4MDB9.concurrent",
      refreshToken: "concurrently-rotated-refresh-token",
    };
    staleRefresh.flush(
      {
        code: "refresh_token_rotated",
        message: "Invalid refresh token.",
      },
      { status: 401, statusText: "Unauthorized" },
    );
    await vi.advanceTimersByTimeAsync(1_500);
    localStorage.setItem(
      "release-hub.auth.session.v1",
      JSON.stringify(newerSession),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "release-hub.auth.session.v1",
        newValue: JSON.stringify(newerSession),
      }),
    );

    await expect(refreshedAccessToken).resolves.toBe(newerSession.accessToken);
    expect(service.snapshot()).toEqual(newerSession.user);
    expect(service.hasStoredSession()).toBe(true);
  });

  it("revokes the rotated lineage when cross-tab synchronization never arrives", async () => {
    vi.useFakeTimers();
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);

    const refreshedAccessToken = firstValueFrom(service.refreshAccessToken(true));
    http.expectOne("/api/auth/refresh").flush(
      {
        code: "refresh_token_rotated",
        message: "Invalid refresh token.",
      },
      { status: 401, statusText: "Unauthorized" },
    );

    await vi.advanceTimersByTimeAsync(30_000);
    const revocation = http.expectOne("/api/auth/logout");
    expect(revocation.request.body).toEqual({ refreshToken: "refresh-token" });
    revocation.flush({ loggedOut: true });

    await expect(refreshedAccessToken).rejects.toMatchObject({ status: 401 });
    expect(service.hasStoredSession()).toBe(false);
    expect(localStorage.getItem("release-hub.auth.session.v1")).toBeNull();
  });

  it("clears a terminally invalid refresh token without waiting for another tab", async () => {
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);

    const refreshedAccessToken = firstValueFrom(service.refreshAccessToken(true));
    http.expectOne("/api/auth/refresh").flush(
      { message: "Invalid refresh token." },
      { status: 401, statusText: "Unauthorized" },
    );

    await expect(refreshedAccessToken).rejects.toMatchObject({ status: 401 });
    expect(service.snapshot()).toBeUndefined();
    expect(service.hasStoredSession()).toBe(false);
    expect(localStorage.getItem("release-hub.auth.session.v1")).toBeNull();
  });

  it("preserves the session across retryable refresh failures", async () => {
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);

    const unavailableRefresh = firstValueFrom(service.refreshAccessToken(true));
    http.expectOne("/api/auth/refresh").flush(
      { message: "Temporarily unavailable." },
      { status: 503, statusText: "Service Unavailable" },
    );
    await expect(unavailableRefresh).rejects.toMatchObject({ status: 503 });

    const networkRefresh = firstValueFrom(service.refreshAccessToken(true));
    http.expectOne("/api/auth/refresh").error(new ProgressEvent("error"));
    await expect(networkRefresh).rejects.toMatchObject({ status: 0 });

    expect(service.snapshot()).toEqual(session.user);
    expect(service.hasStoredSession()).toBe(true);
    expect(localStorage.getItem("release-hub.auth.session.v1")).toContain(
      "\"refreshToken\":\"refresh-token\"",
    );
  });

  it("revokes the newest stored refresh token when another tab rotated it", () => {
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);
    localStorage.setItem(
      "release-hub.auth.session.v1",
      JSON.stringify({
        ...session,
        refreshToken: "rotated-refresh-token",
      }),
    );

    service.logout().subscribe();

    const request = http.expectOne("/api/auth/logout");
    expect(request.request.body).toEqual({
      refreshToken: "rotated-refresh-token",
    });
    request.flush({ loggedOut: true });
    expect(service.hasStoredSession()).toBe(false);
    expect(localStorage.getItem("release-hub.auth.session.v1")).toBeNull();
  });

  it("does not restore a session when refresh completes after logout", () => {
    service.login("admin", "admin@123").subscribe();
    http.expectOne("/api/auth/login").flush(session);
    let refreshedAccessToken: string | undefined = "pending";
    service.refreshAccessToken(true).subscribe((accessToken) => {
      refreshedAccessToken = accessToken;
    });
    const refresh = http.expectOne("/api/auth/refresh");

    service.logout().subscribe();
    const logout = http.expectOne("/api/auth/logout");
    logout.flush({ loggedOut: true });
    refresh.flush({
      ...session,
      accessToken: "header.eyJleHAiOjQxMDI0NDQ4MDB9.rotated",
      refreshToken: "late-refresh-token",
    });

    expect(refreshedAccessToken).toBeUndefined();
    expect(service.hasStoredSession()).toBe(false);
    expect(localStorage.getItem("release-hub.auth.session.v1")).toBeNull();
  });
});
