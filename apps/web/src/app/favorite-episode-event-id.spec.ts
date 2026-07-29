import { describe, expect, it } from "vitest";
import { isFavoriteEpisodeEventId } from "./favorite-episode-event-id";

describe("favorite episode event ids", () => {
  it("recognizes synthetic TMDB and title episode ids", () => {
    expect(isFavoriteEpisodeEventId("tmdb:100:s3:e5")).toBe(true);
    expect(isFavoriteEpisodeEventId("title:house-of-the-dragon:s3:e5")).toBe(true);
  });

  it("does not classify regular release ids as favorite episodes", () => {
    expect(isFavoriteEpisodeEventId("tmdb:100:tv:2026-07-19")).toBe(false);
    expect(isFavoriteEpisodeEventId("tmdb:100:movie:2026-07-19")).toBe(false);
    expect(isFavoriteEpisodeEventId(undefined)).toBe(false);
  });
});
