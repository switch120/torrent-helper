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

  it("refreshes recently completed weeks during the correction window", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-05-04",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-11T12:00:00.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: true, reason: "expired" });
  });

  it("keeps past weeks fetched after the correction window permanently", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-04-06",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-04-16T12:00:00.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: false, reason: "fresh" });
  });

  it("refreshes a past week when the cached snapshot was taken before that week completed", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-06-01",
        now: new Date("2026-06-09T12:00:00.000Z"),
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-28T18:51:26.006Z"),
        },
      }),
    ).toEqual({ shouldFetch: true, reason: "expired" });
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

  it("reports expiry timestamps for recently completed weeks during the correction window", () => {
    expect(
      getNextExpiry("2026-05-04", new Date("2026-05-11T12:00:00.000Z"), now)?.toISOString(),
    ).toBe("2026-05-12T12:00:00.000Z");
  });

  it("does not report expiry timestamps after the past-week correction window", () => {
    expect(getNextExpiry("2026-05-04", new Date("2026-05-14T12:00:00.000Z"), now)).toBeNull();
  });

  it("reports expiry timestamps for past weeks cached before the week completed", () => {
    expect(
      getNextExpiry(
        "2026-06-01",
        new Date("2026-05-28T18:51:26.006Z"),
        new Date("2026-06-09T12:00:00.000Z"),
      )?.toISOString(),
    ).toBe("2026-05-29T18:51:26.006Z");
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
