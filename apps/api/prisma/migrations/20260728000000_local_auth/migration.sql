BEGIN;

ALTER TABLE "AppUser"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "passwordHash" TEXT;

UPDATE "AppUser"
SET
  "username" = 'admin',
  "passwordHash" = 'scrypt$eXGxkuEpN3x5k348gEb-Hg$P8QMn-4YKTvegy8n-gC4EOq5NuP-xU2Y3POzcT78bceqYqTphh_5vtcAgBEnGhSmmc72EbjozySH4rwOZH0-ug'
WHERE LOWER("email") = 'switch120@gmail.com';

UPDATE "AppUser"
SET "username" = CONCAT('legacy-user-', "id")
WHERE "username" IS NULL;

ALTER TABLE "AppUser" ALTER COLUMN "username" SET NOT NULL;

DROP INDEX "AppUser_auth0Sub_key";
ALTER TABLE "AppUser" DROP COLUMN "auth0Sub";

CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");

CREATE TABLE "RefreshToken" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "rotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "replacedByTokenId" INTEGER,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
