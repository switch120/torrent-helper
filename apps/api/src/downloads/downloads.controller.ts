import { Controller, Delete, Get, Inject, Param, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedAppUser } from "../auth/auth.types";
import { ReleaseWorkflowService } from "../releases/release-workflow.service";

@Controller("downloads")
export class DownloadsController {
  constructor(
    @Inject(ReleaseWorkflowService) private readonly workflowService: ReleaseWorkflowService,
  ) {}

  @Get()
  listDownloads(@CurrentUser() user: AuthenticatedAppUser) {
    return this.workflowService.getDownloadStatus(user.id);
  }

  @Get("history")
  listHistory(@CurrentUser() user: AuthenticatedAppUser) {
    return this.workflowService.getDownloadHistory(user.id);
  }

  @Get("history/duplicate")
  checkDuplicate(
    @CurrentUser() user: AuthenticatedAppUser,
    @Query("magnetLink") magnetLink: string,
  ) {
    return this.workflowService.getDownloadDuplicate(user.id, magnetLink || "");
  }

  @Delete("history/:id")
  deleteHistory(
    @CurrentUser() user: AuthenticatedAppUser,
    @Param("id") id: string,
  ) {
    return this.workflowService.deleteDownloadHistory(user.id, Number(id));
  }
}
