import { describe, expect, it } from "vitest";
import { validateDownloadDir } from "./download-path";

describe("download directory validation", () => {
  it("accepts fixed and custom /data paths", () => {
    expect(validateDownloadDir("/data/Movies/Sourced")).toBe("/data/Movies/Sourced");
    expect(validateDownloadDir("/data/Movies/4k")).toBe("/data/Movies/4k");
    expect(validateDownloadDir("/data/Custom Folder")).toBe("/data/Custom Folder");
  });

  it("rejects paths outside /data and traversal attempts", () => {
    expect(() => validateDownloadDir("/downloads")).toThrow("Download directory must start with /data");
    expect(() => validateDownloadDir("/data/../config")).toThrow("Download directory cannot contain ..");
  });
});
