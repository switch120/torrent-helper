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
        }),
      },
    };
    const service = new UserSettingsService(prisma as never);

    await expect(service.getSettings(7)).resolves.toEqual({
      hiddenProviders: [],
      hiddenShowKeys: [],
      showOnlyFavorites: false,
    });
  });

  it("persists sanitized settings updates", async () => {
    const prisma = {
      userSettings: {
        upsert: vi.fn().mockResolvedValue({
          userId: 7,
          hiddenProviders: [{ key: "watchmode:1", name: "Provider", hidden: true }],
          hiddenShowKeys: ["tmdb:22"],
          showOnlyFavorites: true,
        }),
      },
    };
    const service = new UserSettingsService(prisma as never);

    const result = await service.updateSettings(7, {
      hiddenProviders: [{ key: "watchmode:1", name: "Provider", hidden: true }, { key: "", name: "", hidden: true }],
      hiddenShowKeys: ["tmdb:22", "", "tmdb:22"],
      showOnlyFavorites: true,
    });

    expect(prisma.userSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 7,
          hiddenProviders: [{ key: "watchmode:1", name: "Provider", hidden: true }],
          hiddenShowKeys: ["tmdb:22"],
          showOnlyFavorites: true,
        }),
      }),
    );
    expect(result).toEqual({
      hiddenProviders: [{ key: "watchmode:1", name: "Provider", hidden: true }],
      hiddenShowKeys: ["tmdb:22"],
      showOnlyFavorites: true,
    });
  });
});
