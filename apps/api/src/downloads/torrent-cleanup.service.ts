import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { TRANSMISSION_CLIENT } from "../releases/release.tokens";
import type { TransmissionRpcClient } from "./transmission-rpc.client";

const COMPLETED_TRANSMISSION_STATUS = 6;

@Injectable()
export class TorrentCleanupService {
  private readonly logger = new Logger(TorrentCleanupService.name);
  private running = false;

  constructor(
    @Inject(TRANSMISSION_CLIENT)
    private readonly transmission: Pick<TransmissionRpcClient, "getDownloads" | "removeTorrent">,
  ) {}

  @Cron("*/30 * * * * *")
  async cleanupCompletedTorrents(): Promise<void> {
    if (this.running) return;

    this.running = true;
    try {
      const downloads = await this.transmission.getDownloads();
      for (const download of downloads) {
        if (download.rawStatus !== COMPLETED_TRANSMISSION_STATUS) continue;

        this.logger.log(`Cleaning completed torrent: ${download.id}`);
        await this.transmission.removeTorrent(download.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Torrent cleanup failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
