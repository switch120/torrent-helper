// @vitest-environment jsdom

import "@angular/compiler";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
});
