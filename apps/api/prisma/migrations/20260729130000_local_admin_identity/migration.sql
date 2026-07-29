ALTER TABLE "AppUser"
  ADD COLUMN "localAuthKey" TEXT;

UPDATE "AppUser"
SET "localAuthKey" = 'primary'
WHERE "id" = (
  SELECT "id"
  FROM "AppUser"
  WHERE LOWER("email") = 'switch120@gmail.com'
     OR LOWER("username") = 'admin'
  ORDER BY
    CASE WHEN LOWER("email") = 'switch120@gmail.com' THEN 0 ELSE 1 END,
    "id"
  LIMIT 1
);

CREATE UNIQUE INDEX "AppUser_localAuthKey_key" ON "AppUser"("localAuthKey");
