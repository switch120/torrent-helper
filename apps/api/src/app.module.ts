import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthController } from "./auth/auth.controller";
import { AuthMiddleware } from "./auth/auth.middleware";
import { DownloadsController } from "./downloads/downloads.controller";
import { TorrentCleanupService } from "./downloads/torrent-cleanup.service";
import { createTransmissionRpcClientFromEnv } from "./downloads/transmission-rpc.client";
import { FavoritesController } from "./favorites/favorites.controller";
import { FavoritesService } from "./favorites/favorites.service";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";
import { ReleasesController } from "./releases/releases.controller";
import { PROWLARR_CLIENT, RELEASE_REPOSITORY, TMDB_CLIENT, TRANSMISSION_CLIENT, WATCHMODE_CLIENT } from "./releases/release.tokens";
import { PrismaReleaseRepository } from "./releases/prisma-release.repository";
import { ReleaseWorkflowService } from "./releases/release-workflow.service";
import { ReleasesService } from "./releases/releases.service";
import { TmdbClient } from "./releases/tmdb.client";
import { WatchModeClient } from "./releases/watchmode.client";
import { ProwlarrClient } from "./torrents/prowlarr.client";
import { UserSettingsController } from "./users/user-settings.controller";
import { UserSettingsService } from "./users/user-settings.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [HealthController, AuthController, ReleasesController, DownloadsController, UserSettingsController, FavoritesController],
  providers: [
    PrismaService,
    AuthMiddleware,
    ReleasesService,
    ReleaseWorkflowService,
    TorrentCleanupService,
    UserSettingsService,
    FavoritesService,
    {
      provide: RELEASE_REPOSITORY,
      useClass: PrismaReleaseRepository,
    },
    {
      provide: WATCHMODE_CLIENT,
      useFactory: () =>
        new WatchModeClient({
          apiKey: process.env.WATCHMODE_API_KEY,
        }),
    },
    {
      provide: TMDB_CLIENT,
      useFactory: () =>
        new TmdbClient({
          apiKey: process.env.TMDB_API_KEY,
          readAccessToken: process.env.TMDB_READ_ACCESS_TOKEN,
        }),
    },
    {
      provide: PROWLARR_CLIENT,
      useFactory: () =>
        new ProwlarrClient({
          baseUrl: process.env.PROWLARR_BASE_URL,
          apiKey: process.env.PROWLARR_API_KEY,
          openAiApiKey: process.env.OPENAI_API_KEY,
          openAiModel: process.env.OPENAI_MODEL,
          openAiRerankEnabled: process.env.OPENAI_TORRENT_RERANK_ENABLED === "true",
        }),
    },
    {
      provide: TRANSMISSION_CLIENT,
      useFactory: () => createTransmissionRpcClientFromEnv(process.env),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes({ path: "*path", method: RequestMethod.ALL });
  }
}
