CREATE TABLE "TmdbDigitalWeekCache" (
  "weekStart" DATE NOT NULL,
  "weekEnd" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "warning" TEXT,
  "fetchedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "rawResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TmdbDigitalWeekCache_pkey" PRIMARY KEY ("weekStart")
);

CREATE TABLE "TmdbDigitalMovie" (
  "eventId" TEXT NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "posterUrl" TEXT,
  "releaseDate" DATE NOT NULL,
  "raw" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TmdbDigitalMovie_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "TmdbDigitalMovie_releaseDate_idx" ON "TmdbDigitalMovie"("releaseDate");
CREATE INDEX "TmdbDigitalMovie_tmdbId_idx" ON "TmdbDigitalMovie"("tmdbId");
