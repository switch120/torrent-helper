CREATE TABLE "ReleaseTitle" (
  "watchmodeId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "titleType" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "tmdbId" INTEGER,
  "tmdbType" TEXT,
  "imdbId" TEXT,
  "posterUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseTitle_pkey" PRIMARY KEY ("watchmodeId")
);

CREATE TABLE "ReleaseSource" (
  "watchmodeId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseSource_pkey" PRIMARY KEY ("watchmodeId")
);

CREATE TABLE "ReleaseWeekCache" (
  "weekStart" DATE NOT NULL,
  "weekEnd" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "warning" TEXT,
  "fetchedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "rateLimitLimit" INTEGER,
  "rateLimitRemaining" INTEGER,
  "accountQuota" INTEGER,
  "accountQuotaUsed" INTEGER,
  "rawResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseWeekCache_pkey" PRIMARY KEY ("weekStart")
);

CREATE TABLE "ReleaseEvent" (
  "id" TEXT NOT NULL,
  "titleId" INTEGER NOT NULL,
  "sourceId" INTEGER NOT NULL,
  "weekStart" DATE NOT NULL,
  "releaseDate" DATE NOT NULL,
  "seasonNumber" INTEGER,
  "isOriginal" BOOLEAN NOT NULL,
  "raw" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReleaseEvent_weekStart_idx" ON "ReleaseEvent"("weekStart");
CREATE INDEX "ReleaseEvent_releaseDate_idx" ON "ReleaseEvent"("releaseDate");
CREATE INDEX "ReleaseEvent_titleId_idx" ON "ReleaseEvent"("titleId");
CREATE INDEX "ReleaseEvent_sourceId_idx" ON "ReleaseEvent"("sourceId");

ALTER TABLE "ReleaseEvent"
  ADD CONSTRAINT "ReleaseEvent_titleId_fkey"
  FOREIGN KEY ("titleId") REFERENCES "ReleaseTitle"("watchmodeId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReleaseEvent"
  ADD CONSTRAINT "ReleaseEvent_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "ReleaseSource"("watchmodeId")
  ON DELETE CASCADE ON UPDATE CASCADE;
