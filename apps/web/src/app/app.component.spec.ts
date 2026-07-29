// @vitest-environment jsdom

import { provideZonelessChangeDetection, ɵresolveComponentResources } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { provideRouter } from "@angular/router";
import { readFile } from "node:fs/promises";
import { BehaviorSubject, of } from "rxjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppComponent } from "./app.component";
import { AuthSessionService } from "./auth-session.service";
import { ReleaseApiClient } from "./release-api.client";

describe("AppComponent download navigation badge", () => {
  const authenticated = new BehaviorSubject(true);
  const auth = {
    isAuthenticated$: authenticated.asObservable(),
    user$: of({ username: "admin" }),
    logout: vi.fn(() => of(undefined)),
  };
  const api = {
    getDownloads: vi.fn(),
  };

  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    await ɵresolveComponentResources((url) =>
      readFile(new URL(url, import.meta.url), "utf8"),
    );
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authenticated.next(true);
    api.getDownloads.mockResolvedValue({
      downloads: [
        { id: 1, status: "downloading", rawStatus: 4, percentDone: 0.5 },
        { id: 2, status: "queued", rawStatus: 3, percentDone: 0 },
        { id: 3, status: "stopped", rawStatus: 0, percentDone: 0.2 },
        { id: 4, status: "queued", rawStatus: 5, percentDone: 1 },
        { id: 5, status: "seeding", rawStatus: 6, percentDone: 1 },
        { id: 6, status: "error", rawStatus: 4, percentDone: 0.5 },
      ],
      proxy: null,
    });
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthSessionService, useValue: auth },
        { provide: ReleaseApiClient, useValue: api },
      ],
    });
  });

  it("shows active Transmission downloads and clears the badge after logout", async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(api.getDownloads).toHaveBeenCalledTimes(1));
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector(".nav-count-badge") as HTMLElement;
    expect(badge.textContent).toContain("2");
    expect(badge.getAttribute("aria-label")).toBe("2 active downloads");

    fixture.componentInstance.activeDownloadCount.set(1);
    fixture.detectChanges();
    expect(badge.getAttribute("aria-label")).toBe("1 active download");

    authenticated.next(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(".nav-count-badge")).toBeNull();
    fixture.destroy();
  });
});
