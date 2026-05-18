CREATE TABLE "ReleaseDetailCache" (
  "eventId" TEXT NOT NULL,
  "tmdbId" INTEGER,
  "mediaType" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "raw" JSONB NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseDetailCache_pkey" PRIMARY KEY ("eventId")
);

CREATE TABLE "TorrentSearchCache" (
  "cacheKey" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "quality" TEXT NOT NULL,
  "results" JSONB NOT NULL,
  "raw" JSONB,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TorrentSearchCache_pkey" PRIMARY KEY ("cacheKey")
);

CREATE TABLE "DownloadRecord" (
  "id" SERIAL NOT NULL,
  "releaseEventId" TEXT NOT NULL,
  "transmissionTorrentId" INTEGER,
  "torrentName" TEXT NOT NULL,
  "magnetLink" TEXT NOT NULL,
  "magnetHash" TEXT,
  "downloadDir" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DownloadRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReleaseDetailCache_tmdbId_idx" ON "ReleaseDetailCache"("tmdbId");
CREATE INDEX "TorrentSearchCache_eventId_idx" ON "TorrentSearchCache"("eventId");
CREATE INDEX "TorrentSearchCache_expiresAt_idx" ON "TorrentSearchCache"("expiresAt");
CREATE INDEX "DownloadRecord_releaseEventId_idx" ON "DownloadRecord"("releaseEventId");
CREATE INDEX "DownloadRecord_transmissionTorrentId_idx" ON "DownloadRecord"("transmissionTorrentId");
CREATE INDEX "DownloadRecord_magnetHash_idx" ON "DownloadRecord"("magnetHash");
