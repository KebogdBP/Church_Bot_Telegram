ALTER TABLE "Sermon" ADD COLUMN "publicId" TEXT;

UPDATE "Sermon"
SET "publicId" = upper(substr(md5("id"), 1, 6));

ALTER TABLE "Sermon" ALTER COLUMN "publicId" SET NOT NULL;
ALTER TABLE "Sermon" ALTER COLUMN "publicId" SET DEFAULT upper(substr(md5((random())::text || (clock_timestamp())::text), 1, 6));
CREATE UNIQUE INDEX "Sermon_publicId_key" ON "Sermon"("publicId");
