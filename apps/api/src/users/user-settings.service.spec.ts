import { describe, expect, it, vi } from "vitest";
import { UserSettingsService } from "./user-settings.service";

describe("UserSettingsService", () => {
  it("creates default settings when none exist", async () => {
    const prisma = {
      userSettings: {
        upsert: vi.fn().mockResolvedValue({
          userId: 7,
          hiddenProviders: null,
          hiddenShowKeys: null,
          showOnlyFavorites: false,
          showInternational: false,
          showDubbed: false,
        }),
      },
    };
    const service = new UserSettingsService(prisma as never);

    await expect(service.getSettings(7)).resolves.toEqual({
      hiddenProviders: [],
      selectedProviders: [
        { key: "provider:appletv", name: "Apple TV+", hidden: false },
        { key: "provider:netflix", name: "Netflix", hidden: false },
        { key: "provider:max", name: "Max", hidden: false },
        { key: "provider:disney", name: "Disney+", hidden: false },
        { key: "provider:hulu", name: "Hulu", hidden: false },
        { key: "provider:prime", name: "Prime", hidden: false },
        { key: "provider:paramount", name: "Paramount+", hidden: false },
        { key: "provider:peacock", name: "Peacock", hidden: false },
        { key: "provider:hbo", name: "HBO", hidden: false },
        { key: "provider:starz", name: "STARZ", hidden: false },
      ],
      hiddenShowKeys: [],
      showOnlyFavorites: false,
      showInternational: false,
      showDubbed: false,
    });
  });

  it("persists sanitized settings updates", async () => {
    const prisma = {
      userSettings: {
        upsert: vi.fn().mockResolvedValue({
          userId: 7,
          hiddenProviders: [{ key: "tmdb:1", name: "Provider", hidden: true }],
          selectedProviders: [
            { key: "provider:hulu", name: "Hulu", hidden: false },
            { key: "provider:appletv", name: "Apple TV+", hidden: true },
          ],
          hiddenShowKeys: ["tmdb:22"],
          showOnlyFavorites: true,
          showInternational: true,
          showDubbed: true,
        }),
      },
    };
    const service = new UserSettingsService(prisma as never);

    const result = await service.updateSettings(7, {
      hiddenProviders: [{ key: "tmdb:1", name: "Provider", hidden: true }, { key: "", name: "", hidden: true }],
      selectedProviders: [
        { key: "provider:hulu", name: "Hulu", hidden: false },
        { key: "provider:appletv", name: "Apple TV+", hidden: true },
        { key: "provider:hulu", name: "Hulu", hidden: false },
        { key: "", name: "", hidden: false },
      ],
      hiddenShowKeys: ["tmdb:22", "", "tmdb:22"],
      showOnlyFavorites: true,
      showInternational: true,
      showDubbed: true,
    });

    expect(prisma.userSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 7,
          hiddenProviders: [{ key: "tmdb:1", name: "Provider", hidden: true }],
          selectedProviders: [
            { key: "provider:hulu", name: "Hulu", hidden: false },
            { key: "provider:appletv", name: "Apple TV+", hidden: false },
          ],
          hiddenShowKeys: ["tmdb:22"],
          showOnlyFavorites: true,
          showInternational: true,
          showDubbed: true,
        }),
      }),
    );
    expect(result).toEqual({
      hiddenProviders: [{ key: "tmdb:1", name: "Provider", hidden: true }],
      selectedProviders: [
        { key: "provider:hulu", name: "Hulu", hidden: false },
        { key: "provider:appletv", name: "Apple TV+", hidden: false },
      ],
      hiddenShowKeys: ["tmdb:22"],
      showOnlyFavorites: true,
      showInternational: true,
      showDubbed: true,
    });
  });
});
