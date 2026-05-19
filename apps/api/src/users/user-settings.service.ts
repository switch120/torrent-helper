import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ProviderPreference, UserSettingsResponse, UserSettingsUpdate } from "./user-settings.types";

const DEFAULT_SELECTED_PROVIDER_NAMES = [
  "Apple TV+",
  "Netflix",
  "Max",
  "Disney+",
  "Hulu",
  "Prime",
  "Paramount+",
  "Peacock",
  "HBO",
  "STARZ",
];

const DEFAULT_SELECTED_PROVIDERS = DEFAULT_SELECTED_PROVIDER_NAMES.map((name) => ({
  key: providerKeyFromName(name),
  name,
  hidden: false,
}));

@Injectable()
export class UserSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: Pick<PrismaService, "userSettings">) {}

  async getSettings(userId: number): Promise<UserSettingsResponse> {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        hiddenProviders: [],
        selectedProviders: DEFAULT_SELECTED_PROVIDERS as Prisma.InputJsonValue,
        hiddenShowKeys: [],
        showOnlyFavorites: false,
        showInternational: false,
        showDubbed: false,
      },
      update: {},
    });

    return mapSettings(settings);
  }

  async updateSettings(userId: number, input: UserSettingsUpdate): Promise<UserSettingsResponse> {
    const sanitized = sanitizeSettings(input);
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        hiddenProviders: sanitized.hiddenProviders as Prisma.InputJsonValue,
        selectedProviders: sanitized.selectedProviders as Prisma.InputJsonValue,
        hiddenShowKeys: sanitized.hiddenShowKeys as Prisma.InputJsonValue,
        showOnlyFavorites: sanitized.showOnlyFavorites,
        showInternational: sanitized.showInternational,
        showDubbed: sanitized.showDubbed,
      },
      update: {
        hiddenProviders: sanitized.hiddenProviders as Prisma.InputJsonValue,
        selectedProviders: sanitized.selectedProviders as Prisma.InputJsonValue,
        hiddenShowKeys: sanitized.hiddenShowKeys as Prisma.InputJsonValue,
        showOnlyFavorites: sanitized.showOnlyFavorites,
        showInternational: sanitized.showInternational,
        showDubbed: sanitized.showDubbed,
      },
    });

    return mapSettings(settings);
  }
}

function sanitizeSettings(input: UserSettingsUpdate): UserSettingsResponse {
  return {
    hiddenProviders: sanitizeProviders(input.hiddenProviders),
    selectedProviders: sanitizeSelectedProviders(input.selectedProviders),
    hiddenShowKeys: uniqueStrings(input.hiddenShowKeys),
    showOnlyFavorites: input.showOnlyFavorites === true,
    showInternational: input.showInternational === true,
    showDubbed: input.showDubbed === true,
  };
}

function sanitizeProviders(value: unknown): ProviderPreference[] {
  if (!Array.isArray(value)) return [];
  const providers = new Map<string, ProviderPreference>();

  for (const item of value) {
    if (!isRecord(item)) continue;
    const key = stringValue(item.key);
    const name = stringValue(item.name);
    if (!key || !name) continue;
    providers.set(key, {
      key,
      name,
      hidden: item.hidden === true,
    });
  }

  return [...providers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function sanitizeSelectedProviders(value: unknown): ProviderPreference[] {
  if (!Array.isArray(value)) return DEFAULT_SELECTED_PROVIDERS;
  const providers = new Map<string, ProviderPreference>();

  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = stringValue(item.name);
    if (!name) continue;
    const key = providerKeyFromName(name);
    if (providers.has(key)) continue;
    providers.set(key, {
      key,
      name: canonicalProviderName(name),
      hidden: false,
    });
  }

  return [...providers.values()];
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}

function mapSettings(value: {
  hiddenProviders: unknown;
  selectedProviders?: unknown;
  hiddenShowKeys: unknown;
  showOnlyFavorites: boolean;
  showInternational?: boolean;
  showDubbed?: boolean;
}): UserSettingsResponse {
  return {
    hiddenProviders: sanitizeProviders(value.hiddenProviders),
    selectedProviders: sanitizeSelectedProviders(value.selectedProviders),
    hiddenShowKeys: uniqueStrings(value.hiddenShowKeys),
    showOnlyFavorites: value.showOnlyFavorites === true,
    showInternational: value.showInternational === true,
    showDubbed: value.showDubbed === true,
  };
}

function providerKeyFromName(value: string): string {
  const slug = providerSlug(canonicalProviderName(value));
  return `provider:${slug || "unknown"}`;
}

function canonicalProviderName(value: string): string {
  const trimmed = value.trim();
  const aliases: Record<string, string> = {
    amazonprime: "Prime",
    amazonprimevideo: "Prime",
    appletv: "Apple TV+",
    appletvplus: "Apple TV+",
    disney: "Disney+",
    disneyplus: "Disney+",
    hbomax: "Max",
    hbo: "HBO",
    hulu: "Hulu",
    max: "Max",
    netflix: "Netflix",
    paramount: "Paramount+",
    paramountplus: "Paramount+",
    peacock: "Peacock",
    prime: "Prime",
    primevideo: "Prime",
    starz: "STARZ",
  };

  return aliases[providerSlug(trimmed)] || trimmed;
}

function providerSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
