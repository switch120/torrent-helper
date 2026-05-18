import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ProviderPreference, UserSettingsResponse, UserSettingsUpdate } from "./user-settings.types";

@Injectable()
export class UserSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: Pick<PrismaService, "userSettings">) {}

  async getSettings(userId: number): Promise<UserSettingsResponse> {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        hiddenProviders: [],
        hiddenShowKeys: [],
        showOnlyFavorites: false,
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
        hiddenShowKeys: sanitized.hiddenShowKeys as Prisma.InputJsonValue,
        showOnlyFavorites: sanitized.showOnlyFavorites,
      },
      update: {
        hiddenProviders: sanitized.hiddenProviders as Prisma.InputJsonValue,
        hiddenShowKeys: sanitized.hiddenShowKeys as Prisma.InputJsonValue,
        showOnlyFavorites: sanitized.showOnlyFavorites,
      },
    });

    return mapSettings(settings);
  }
}

function sanitizeSettings(input: UserSettingsUpdate): UserSettingsResponse {
  return {
    hiddenProviders: sanitizeProviders(input.hiddenProviders),
    hiddenShowKeys: uniqueStrings(input.hiddenShowKeys),
    showOnlyFavorites: input.showOnlyFavorites === true,
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

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}

function mapSettings(value: {
  hiddenProviders: unknown;
  hiddenShowKeys: unknown;
  showOnlyFavorites: boolean;
}): UserSettingsResponse {
  return {
    hiddenProviders: sanitizeProviders(value.hiddenProviders),
    hiddenShowKeys: uniqueStrings(value.hiddenShowKeys),
    showOnlyFavorites: value.showOnlyFavorites === true,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
