import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";
import { ReleasesService } from "./releases.service";

@Controller("releases")
export class ReleasesController {
  constructor(
    @Inject(ReleasesService) private readonly releasesService: ReleasesService,
  ) {}

  @Get("week")
  getWeek(@Query("start") start: string) {
    return this.releasesService.getWeek(start);
  }

  @Post("week/refresh")
  refreshWeek(@Body("weekStart") weekStart: string) {
    return this.releasesService.refreshWeek(weekStart);
  }
}
