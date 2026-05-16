ALTER TABLE "TmdbDigitalMovie"
  ADD COLUMN "primaryReleaseDate" DATE,
  ADD COLUMN "popularity" DOUBLE PRECISION,
  ADD COLUMN "voteCount" INTEGER,
  ADD COLUMN "isFeaturedDigital" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TmdbDigitalMovie_isFeaturedDigital_idx" ON "TmdbDigitalMovie"("isFeaturedDigital");
CREATE INDEX "TmdbDigitalMovie_popularity_idx" ON "TmdbDigitalMovie"("popularity");
