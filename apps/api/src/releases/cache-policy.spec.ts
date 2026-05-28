import { describe, expect, it } from "vitest";
import { getCacheDecision, getNextExpiry } from "./cache-policy";

describe("release week cache policy", () => {
  const now = new Date("2026-05-16T12:00:00.000Z");

  it("fetches missing weeks", () => {
    expect(getCacheDecision({ weekStart: "2026-05-11", now })).toEqual({
      shouldFetch: true,
      reason: "missing",
    });
  });

  it("keeps cached prior weeks permanently until manually refreshed", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-05-04",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-08T12:00:00.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: false, reason: "fresh" });
  });

  it("keeps older cached past weeks permanently until manually refreshed", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-04-06",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-04-10T12:00:00.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: false, reason: "fresh" });
  });

  it("lets manually refreshed past weeks bypass the decay window", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-05-04",
        now,
        forceRefresh: true,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-16T11:00:00.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: true, reason: "refresh-requested" });
  });

  it("refreshes current weeks after twenty four hours", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-05-11",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-15T11:59:59.000Z"),
        },
      }).shouldFetch,
    ).toBe(true);
  });

  it("keeps future weeks cached within their twenty four hour expiry", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-05-18",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-15T12:00:01.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: false, reason: "fresh" });
  });

  it("refreshes future weeks after twenty four hours", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-05-18",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-15T11:59:59.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: true, reason: "expired" });
  });

  it("does not report expiry timestamps for cached past weeks", () => {
    expect(getNextExpiry("2026-05-04", new Date("2026-05-08T12:00:00.000Z"), now)).toBeNull();
  });

  it("reports twenty four hour expiry timestamps for future weeks", () => {
    expect(
      getNextExpiry(
        "2026-05-18",
        new Date("2026-05-15T12:00:00.000Z"),
        now,
      )?.toISOString(),
    ).toBe("2026-05-16T12:00:00.000Z");
  });
});
