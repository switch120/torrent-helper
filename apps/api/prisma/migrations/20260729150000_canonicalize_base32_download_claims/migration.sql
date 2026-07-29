CREATE FUNCTION "_release_hub_base32_btih_to_hex"("value" TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  "alphabet" CONSTANT TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  "bits" TEXT := '';
  "hexValue" TEXT := '';
  "characterValue" INTEGER;
  "position" INTEGER;
BEGIN
  IF "value" !~* '^[A-Z2-7]{32}$' THEN
    RETURN LOWER("value");
  END IF;

  FOR "position" IN 1..LENGTH("value") LOOP
    "characterValue" := STRPOS("alphabet", UPPER(SUBSTRING("value" FROM "position" FOR 1))) - 1;
    "bits" := "bits" || (("characterValue"::BIT(5))::TEXT);
  END LOOP;

  FOR "position" IN 0..39 LOOP
    "hexValue" := "hexValue" || SUBSTRING(
      '0123456789abcdef'
      FROM ((SUBSTRING("bits" FROM ("position" * 4) + 1 FOR 4)::BIT(4))::INTEGER) + 1
      FOR 1
    );
  END LOOP;

  RETURN "hexValue";
END;
$$;

UPDATE "DownloadRecord"
SET "magnetHash" = "_release_hub_base32_btih_to_hex"("magnetHash")
WHERE "magnetHash" ~* '^[A-Z2-7]{32}$';

INSERT INTO "DownloadClaim" ("userId", "magnetKey", "createdAt")
SELECT
  "userId",
  CONCAT(
    'hash:',
    "_release_hub_base32_btih_to_hex"(SUBSTRING("magnetKey" FROM 6))
  ),
  "createdAt"
FROM "DownloadClaim"
WHERE "magnetKey" ~* '^hash:[A-Z2-7]{32}$'
ON CONFLICT ("userId", "magnetKey") DO UPDATE
SET "createdAt" = LEAST(
  "DownloadClaim"."createdAt",
  EXCLUDED."createdAt"
);

DELETE FROM "DownloadClaim"
WHERE "magnetKey" ~* '^hash:[A-Z2-7]{32}$';

DROP FUNCTION "_release_hub_base32_btih_to_hex"(TEXT);
