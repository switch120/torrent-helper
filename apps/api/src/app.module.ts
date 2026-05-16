import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";
import { ReleasesController } from "./releases/releases.controller";
import { RELEASE_REPOSITORY, TMDB_CLIENT, WATCHMODE_CLIENT } from "./releases/release.tokens";
import { PrismaReleaseRepository } from "./releases/prisma-release.repository";
import { ReleasesService } from "./releases/releases.service";
import { TmdbClient } from "./releases/tmdb.client";
import { WatchModeClient } from "./releases/watchmode.client";

@Module({
  controllers: [HealthController, ReleasesController],
  providers: [
    PrismaService,
    ReleasesService,
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
  ],
})
export class AppModule {}
