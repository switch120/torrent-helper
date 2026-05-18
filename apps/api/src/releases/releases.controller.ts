import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { ReleasesService } from "./releases.service";
import { ReleaseWorkflowService } from "./release-workflow.service";

@Controller("releases")
export class ReleasesController {
  constructor(
    @Inject(ReleasesService) private readonly releasesService: ReleasesService,
    @Inject(ReleaseWorkflowService) private readonly workflowService: ReleaseWorkflowService,
  ) {}

  @Get("week")
  getWeek(@Query("start") start: string) {
    return this.releasesService.getWeek(start);
  }

  @Post("week/refresh")
  refreshWeek(@Body("weekStart") weekStart: string) {
    return this.releasesService.refreshWeek(weekStart);
  }

  @Get(":eventId/detail")
  getDetail(@Param("eventId") eventId: string) {
    return this.workflowService.getDetail(eventId);
  }

  @Get(":eventId/torrents")
  searchTorrents(
    @Param("eventId") eventId: string,
    @Query("quality") quality: string = "any",
  ) {
    return this.workflowService.searchTorrents(eventId, quality as "1080p" | "2160p" | "any");
  }

  @Post(":eventId/downloads")
  addDownload(
    @Param("eventId") eventId: string,
    @Body() body: { magnetLink?: string; downloadDir?: string },
  ) {
    return this.workflowService.addDownload(eventId, body);
  }
}
