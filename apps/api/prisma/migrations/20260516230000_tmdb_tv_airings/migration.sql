CREATE TABLE "TmdbTvWeekCache" (
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "warning" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TmdbTvWeekCache_pkey" PRIMARY KEY ("weekStart")
);

CREATE TABLE "TmdbTvAiring" (
    "eventId" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleType" TEXT NOT NULL,
    "posterUrl" TEXT,
    "releaseDate" DATE NOT NULL,
    "firstAirDate" DATE,
    "providerId" INTEGER NOT NULL,
    "providerName" TEXT NOT NULL,
    "seasonNumber" INTEGER,
    "episodeNumber" INTEGER,
    "episodeName" TEXT,
    "imdbId" TEXT,
    "popularity" DOUBLE PRECISION,
    "voteCount" INTEGER,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TmdbTvAiring_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "TmdbTvAiring_releaseDate_idx" ON "TmdbTvAiring"("releaseDate");
CREATE INDEX "TmdbTvAiring_tmdbId_idx" ON "TmdbTvAiring"("tmdbId");
CREATE INDEX "TmdbTvAiring_providerId_idx" ON "TmdbTvAiring"("providerId");
CREATE INDEX "TmdbTvAiring_popularity_idx" ON "TmdbTvAiring"("popularity");
