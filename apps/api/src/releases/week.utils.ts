export type WeekKind = "past" | "current" | "future";

export type WeekWindow = {
  weekStart: string;
  weekEnd: string;
  watchModeStart: number;
  watchModeEnd: number;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string): Date {
  if (!datePattern.test(value)) {
    throw new Error(`Expected date in YYYY-MM-DD format, received "${value}".`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date "${value}".`);
  }

  return date;
}

export function startOfIsoWeek(value: string | Date): Date {
  const date = typeof value === "string" ? parseDateOnly(value) : cloneUtcDate(value);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

export function isMondayWeekStart(value: string): boolean {
  return parseDateOnly(value).getUTCDay() === 1;
}

export function buildWeekWindow(value: string | Date): WeekWindow {
  const weekStartDate = startOfIsoWeek(value);
  const weekEndDate = addDays(weekStartDate, 6);

  return {
    weekStart: formatDateOnly(weekStartDate),
    weekEnd: formatDateOnly(weekEndDate),
    watchModeStart: formatWatchModeDateTime(weekStartDate, "start"),
    watchModeEnd: formatWatchModeDateTime(weekEndDate, "end"),
  };
}

export function classifyWeek(weekStart: string, now = new Date()): WeekKind {
  const selectedStart = parseDateOnly(weekStart);
  const currentStart = startOfIsoWeek(now);

  if (selectedStart.getTime() < currentStart.getTime()) return "past";
  if (selectedStart.getTime() > currentStart.getTime()) return "future";
  return "current";
}

export function formatWatchModeDateTime(date: Date, edge: "start" | "end"): number {
  const datePart = formatDateOnly(date).replaceAll("-", "");
  return Number(`${datePart}${edge === "start" ? "000000" : "235959"}`);
}

export function formatDateOnly(date: Date): string {
  return cloneUtcDate(date).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = cloneUtcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function cloneUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
