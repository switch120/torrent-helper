CREATE TABLE "AppUser" (
  "id" SERIAL NOT NULL,
  "auth0Sub" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "pictureUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSettings" (
  "userId" INTEGER NOT NULL,
  "hiddenProviders" JSONB,
  "hiddenShowKeys" JSONB,
  "showOnlyFavorites" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "FavoriteShow" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "showKey" TEXT NOT NULL,
  "tmdbId" INTEGER,
  "watchmodeId" INTEGER,
  "title" TEXT NOT NULL,
  "posterUrl" TEXT,
  "backdropUrl" TEXT,
  "overview" TEXT,
  "status" TEXT,
  "isCanceled" BOOLEAN NOT NULL DEFAULT false,
  "currentSeasonNumber" INTEGER,
  "numberOfSeasons" INTEGER,
  "numberOfEpisodes" INTEGER,
  "lastAirDate" DATE,
  "lastEpisode" JSONB,
  "nextEpisode" JSONB,
  "releaseContext" JSONB,
  "raw" JSONB,
  "fetchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FavoriteShow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_auth0Sub_key" ON "AppUser"("auth0Sub");
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
CREATE UNIQUE INDEX "FavoriteShow_userId_showKey_key" ON "FavoriteShow"("userId", "showKey");
CREATE INDEX "FavoriteShow_userId_idx" ON "FavoriteShow"("userId");
CREATE INDEX "FavoriteShow_tmdbId_idx" ON "FavoriteShow"("tmdbId");
CREATE INDEX "FavoriteShow_watchmodeId_idx" ON "FavoriteShow"("watchmodeId");

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteShow" ADD CONSTRAINT "FavoriteShow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
