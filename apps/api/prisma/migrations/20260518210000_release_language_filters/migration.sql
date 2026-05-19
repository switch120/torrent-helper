ALTER TABLE "TmdbDigitalMovie"
  ADD COLUMN "originalLanguage" TEXT,
  ADD COLUMN "isInternational" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isDubbed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TmdbTvAiring"
  ADD COLUMN "originalLanguage" TEXT,
  ADD COLUMN "isInternational" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isDubbed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "UserSettings"
  ADD COLUMN "showInternational" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showDubbed" BOOLEAN NOT NULL DEFAULT false;
