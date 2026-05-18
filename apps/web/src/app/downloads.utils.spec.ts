import { describe, expect, it } from "vitest";
import { proxyStatusLabel, proxyToneClass } from "./downloads.utils";

describe("downloads utilities", () => {
  it("formats proxy status labels and tones", () => {
    expect(proxyStatusLabel("up")).toBe("Proxy up");
    expect(proxyToneClass("up")).toBe("proxy-health is-up");
    expect(proxyStatusLabel("down")).toBe("Proxy exposed");
    expect(proxyToneClass("down")).toBe("proxy-health is-down");
    expect(proxyStatusLabel("unknown")).toBe("Proxy unknown");
    expect(proxyToneClass("unknown")).toBe("proxy-health is-unknown");
  });
});
