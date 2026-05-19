const englishLanguageCode = "en";
const dubbedCuePattern = /\b(dubbed|dub|dual[\s-]?audio|english[\s-]?audio|multi[\s-]?audio)\b/i;

export function normalizeOriginalLanguage(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function isInternationalLanguage(value: string | null | undefined): boolean {
  const normalized = normalizeOriginalLanguage(value);
  return Boolean(normalized && normalized !== englishLanguageCode);
}

export function hasDubbedCue(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => Boolean(value && dubbedCuePattern.test(value)));
}
