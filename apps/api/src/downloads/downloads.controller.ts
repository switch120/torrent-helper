import { Controller, Get, Inject } from "@nestjs/common";
import { ReleaseWorkflowService } from "../releases/release-workflow.service";

@Controller("downloads")
export class DownloadsController {
  constructor(
    @Inject(ReleaseWorkflowService) private readonly workflowService: ReleaseWorkflowService,
  ) {}

  @Get()
  listDownloads() {
    return this.workflowService.getDownloadStatus();
  }
}
