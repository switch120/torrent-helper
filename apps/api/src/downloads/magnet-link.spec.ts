import { describe, expect, it } from "vitest";
import { extractMagnetHash } from "./magnet-link";

describe("extractMagnetHash", () => {
  it("normalizes btih hashes from magnet links", () => {
    expect(extractMagnetHash("magnet:?xt=urn:btih:ABCDEF1234567890&dn=Movie")).toBe("abcdef1234567890");
  });

  it("returns null when no btih hash is present", () => {
    expect(extractMagnetHash("magnet:?dn=Movie")).toBeNull();
    expect(extractMagnetHash("not-a-magnet")).toBeNull();
  });
});
