CREATE TABLE "DownloadClaim" (
  "userId" INTEGER NOT NULL,
  "magnetKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DownloadClaim_pkey" PRIMARY KEY ("userId", "magnetKey")
);

INSERT INTO "DownloadClaim" ("userId", "magnetKey", "createdAt")
SELECT
  "userId",
  CASE
    WHEN "magnetHash" IS NOT NULL AND BTRIM("magnetHash") <> ''
      THEN CONCAT('hash:', LOWER("magnetHash"))
    ELSE CONCAT('link:', MD5("magnetLink"))
  END,
  MIN("createdAt")
FROM "DownloadRecord"
WHERE "userId" IS NOT NULL
GROUP BY
  "userId",
  CASE
    WHEN "magnetHash" IS NOT NULL AND BTRIM("magnetHash") <> ''
      THEN CONCAT('hash:', LOWER("magnetHash"))
    ELSE CONCAT('link:', MD5("magnetLink"))
  END
ON CONFLICT DO NOTHING;

ALTER TABLE "DownloadClaim"
  ADD CONSTRAINT "DownloadClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
