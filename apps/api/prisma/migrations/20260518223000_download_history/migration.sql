ALTER TABLE "DownloadRecord" ADD COLUMN "userId" INTEGER;
ALTER TABLE "DownloadRecord" ADD COLUMN "tmdbId" INTEGER;
ALTER TABLE "DownloadRecord" ADD COLUMN "title" TEXT;
ALTER TABLE "DownloadRecord" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "DownloadRecord" ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "DownloadRecord_userId_idx" ON "DownloadRecord"("userId");
CREATE INDEX "DownloadRecord_status_idx" ON "DownloadRecord"("status");

ALTER TABLE "DownloadRecord" ADD CONSTRAINT "DownloadRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
