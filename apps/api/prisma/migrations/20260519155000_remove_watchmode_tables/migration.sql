DROP TABLE IF EXISTS "ReleaseEvent";
DROP TABLE IF EXISTS "WatchModeFetchCache";
DROP TABLE IF EXISTS "ReleaseTitle";
DROP TABLE IF EXISTS "ReleaseSource";

ALTER TABLE IF EXISTS "FavoriteShow"
  RENAME COLUMN "watchmodeId" TO "sourceTitleId";

DROP INDEX IF EXISTS "FavoriteShow_watchmodeId_idx";
CREATE INDEX IF NOT EXISTS "FavoriteShow_sourceTitleId_idx" ON "FavoriteShow"("sourceTitleId");
