CREATE TABLE "WatchModeFetchCache" (
  "cacheKey" TEXT NOT NULL,
  "requestedStartDate" DATE NOT NULL,
  "requestedEndDate" DATE NOT NULL,
  "coveredStartDate" DATE NOT NULL,
  "coveredEndDate" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "warning" TEXT,
  "fetchedAt" TIMESTAMP(3),
  "rateLimitLimit" INTEGER,
  "rateLimitRemaining" INTEGER,
  "accountQuota" INTEGER,
  "accountQuotaUsed" INTEGER,
  "rawResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WatchModeFetchCache_pkey" PRIMARY KEY ("cacheKey")
);

INSERT INTO "WatchModeFetchCache" (
  "cacheKey",
  "requestedStartDate",
  "requestedEndDate",
  "coveredStartDate",
  "coveredEndDate",
  "status",
  "warning",
  "fetchedAt",
  "rateLimitLimit",
  "rateLimitRemaining",
  "accountQuota",
  "accountQuotaUsed",
  "rawResponse",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('legacy:week:', "weekStart"::TEXT),
  "weekStart",
  "weekEnd",
  "weekStart",
  "weekEnd",
  "status",
  "warning",
  "fetchedAt",
  "rateLimitLimit",
  "rateLimitRemaining",
  "accountQuota",
  "accountQuotaUsed",
  "rawResponse",
  "createdAt",
  "updatedAt"
FROM "ReleaseWeekCache";

DROP INDEX "ReleaseEvent_weekStart_idx";
ALTER TABLE "ReleaseEvent" DROP COLUMN "weekStart";
DROP TABLE "ReleaseWeekCache";

CREATE INDEX "WatchModeFetchCache_coveredStartDate_coveredEndDate_idx" ON "WatchModeFetchCache"("coveredStartDate", "coveredEndDate");
CREATE INDEX "WatchModeFetchCache_requestedStartDate_requestedEndDate_idx" ON "WatchModeFetchCache"("requestedStartDate", "requestedEndDate");
