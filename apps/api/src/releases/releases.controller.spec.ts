import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { ReleasesController } from "./releases.controller";
import { ReleasesService } from "./releases.service";

describe("ReleasesController", () => {
  it("receives ReleasesService through Nest dependency injection", async () => {
    const releasesService = {
      getWeek: vi.fn().mockResolvedValue({ weekStart: "2026-05-11" }),
      refreshWeek: vi.fn().mockResolvedValue({ weekStart: "2026-05-11" }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ReleasesController],
      providers: [{ provide: ReleasesService, useValue: releasesService }],
    }).compile();

    const controller = moduleRef.get(ReleasesController);

    await expect(controller.getWeek("2026-05-11")).resolves.toEqual({
      weekStart: "2026-05-11",
    });
    expect(releasesService.getWeek).toHaveBeenCalledWith("2026-05-11");
  });
});
