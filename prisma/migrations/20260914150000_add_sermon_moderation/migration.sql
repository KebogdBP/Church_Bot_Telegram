ALTER TYPE "SermonPostStatus" ADD VALUE 'REJECTED';

ALTER TABLE "Sermon"
ADD COLUMN "regeneratedByUserId" TEXT,
ADD COLUMN "regeneratedAt" TIMESTAMP(3);

ALTER TABLE "SermonPost"
ADD COLUMN "editedByUserId" TEXT,
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "rejectedByUserId" TEXT,
ADD COLUMN "rejectedAt" TIMESTAMP(3);
