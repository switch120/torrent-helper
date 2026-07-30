import { describe, expect, it } from "vitest";
import { extractMagnetHash } from "./magnet-link";

describe("extractMagnetHash", () => {
  it("normalizes btih hashes from magnet links", () => {
    expect(extractMagnetHash("magnet:?xt=urn:btih:ABCDEF1234567890&dn=Movie")).toBe("abcdef1234567890");
  });

  it("canonicalizes 32-character base32 btih hashes to hexadecimal", () => {
    const base32 = "CI2FM6EQCI2FM6EQCI2FM6EQCI2FM6EQ";
    const hexadecimal = "1234567890123456789012345678901234567890";

    expect(extractMagnetHash(`magnet:?xt=urn:btih:${base32}`)).toBe(hexadecimal);
    expect(extractMagnetHash(`magnet:?xt=urn:btih:${hexadecimal}`)).toBe(hexadecimal);
  });

  it("returns null when no btih hash is present", () => {
    expect(extractMagnetHash("magnet:?dn=Movie")).toBeNull();
    expect(extractMagnetHash("not-a-magnet")).toBeNull();
  });
});
