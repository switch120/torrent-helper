import { describe, expect, it } from "vitest";
import { bottomFetchButtonLabel, bottomFetchCueLabel, bottomFetchProgress } from "./torrent-fetch-hold.utils";

describe("torrent fetch hold UX helpers", () => {
  it("labels manual fetch by whether results already exist", () => {
    expect(bottomFetchButtonLabel({ hasFetched: false, loading: false })).toBe("Fetch torrents");
    expect(bottomFetchButtonLabel({ hasFetched: true, loading: false })).toBe("Refresh torrents");
    expect(bottomFetchButtonLabel({ hasFetched: true, loading: true })).toBe("Fetching...");
  });

  it("labels bottom-hold intent by whether results already exist", () => {
    expect(bottomFetchCueLabel(false)).toBe("Hold to fetch torrent results");
    expect(bottomFetchCueLabel(true)).toBe("Hold to refresh torrent results");
  });

  it("clamps hold progress between zero and one", () => {
    expect(bottomFetchProgress(1000, 900, 1200)).toBe(0);
    expect(bottomFetchProgress(1000, 1600, 1200)).toBe(0.5);
    expect(bottomFetchProgress(1000, 2600, 1200)).toBe(1);
  });
});
