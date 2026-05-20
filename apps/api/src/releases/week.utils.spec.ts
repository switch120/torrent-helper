import { describe, expect, it } from "vitest";
import {
  buildWeekWindow,
  classifyWeek,
  isMondayWeekStart,
  startOfIsoWeek,
} from "./week.utils";

describe("week utilities", () => {
  it("normalizes any date in a week to the Monday week start", () => {
    expect(startOfIsoWeek("2026-05-16").toISOString().slice(0, 10)).toBe("2026-05-11");
    expect(startOfIsoWeek("2026-05-11").toISOString().slice(0, 10)).toBe("2026-05-11");
    expect(isMondayWeekStart("2026-05-11")).toBe(true);
    expect(isMondayWeekStart("2026-05-12")).toBe(false);
  });

  it("builds a Monday through Sunday inclusive week window", () => {
    const window = buildWeekWindow("2026-05-11");

    expect(window.weekStart).toBe("2026-05-11");
    expect(window.weekEnd).toBe("2026-05-17");
  });

  it("classifies past, current, and future weeks from a provided clock", () => {
    const now = new Date("2026-05-16T12:00:00.000Z");

    expect(classifyWeek("2026-05-04", now)).toBe("past");
    expect(classifyWeek("2026-05-11", now)).toBe("current");
    expect(classifyWeek("2026-05-18", now)).toBe("future");
  });
});
