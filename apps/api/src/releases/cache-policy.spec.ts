import { describe, expect, it } from "vitest";
import { getCacheDecision } from "./cache-policy";

describe("release week cache policy", () => {
  const now = new Date("2026-05-16T12:00:00.000Z");

  it("fetches missing weeks", () => {
    expect(getCacheDecision({ weekStart: "2026-05-11", now })).toEqual({
      shouldFetch: true,
      reason: "missing",
    });
  });

  it("freezes successfully fetched past weeks", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-05-04",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-08T12:00:00.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: false, reason: "frozen-past" });
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

  it("keeps future weeks cached until their six hour expiry", () => {
    expect(
      getCacheDecision({
        weekStart: "2026-05-18",
        now,
        cache: {
          status: "fresh",
          fetchedAt: new Date("2026-05-16T08:00:00.000Z"),
        },
      }),
    ).toEqual({ shouldFetch: false, reason: "fresh" });
  });
});
