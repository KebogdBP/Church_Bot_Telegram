CREATE TYPE "RegistrationFormStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "RegistrationFieldKind" AS ENUM ('TEXT', 'NUMBER', 'CHOICE');
CREATE TYPE "RegistrationEntryStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

CREATE TABLE "RegistrationForm" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL DEFAULT upper(substr(md5(((random())::text || (clock_timestamp())::text)), 1, 6)),
  "churchGroupId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "totalLimit" INTEGER NOT NULL,
  "status" "RegistrationFormStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationForm_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistrationForm_totalLimit_check" CHECK ("totalLimit" BETWEEN 1 AND 10000)
);

CREATE TABLE "RegistrationCity" (
  "id" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quota" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationCity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistrationCity_quota_check" CHECK ("quota" BETWEEN 1 AND 10000)
);

CREATE TABLE "RegistrationField" (
  "id" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "kind" "RegistrationFieldKind" NOT NULL,
  "options" JSONB NOT NULL DEFAULT '[]',
  "required" BOOLEAN NOT NULL DEFAULT true,
  "sequence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationEntry" (
  "id" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "firstNameEncrypted" TEXT NOT NULL,
  "lastNameEncrypted" TEXT NOT NULL,
  "age" INTEGER NOT NULL,
  "answersEncrypted" TEXT NOT NULL,
  "status" "RegistrationEntryStatus" NOT NULL DEFAULT 'CONFIRMED',
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistrationEntry_age_check" CHECK ("age" BETWEEN 1 AND 120)
);

CREATE TABLE "RegistrationFlow" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "formId" TEXT,
  "mode" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "dataEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationFlow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationForm_publicId_key" ON "RegistrationForm"("publicId");
CREATE INDEX "RegistrationForm_churchGroupId_status_createdAt_idx" ON "RegistrationForm"("churchGroupId", "status", "createdAt");
CREATE UNIQUE INDEX "RegistrationCity_formId_name_key" ON "RegistrationCity"("formId", "name");
CREATE INDEX "RegistrationCity_formId_idx" ON "RegistrationCity"("formId");
CREATE UNIQUE INDEX "RegistrationField_formId_sequence_key" ON "RegistrationField"("formId", "sequence");
CREATE INDEX "RegistrationField_formId_idx" ON "RegistrationField"("formId");
CREATE UNIQUE INDEX "RegistrationEntry_formId_telegramUserId_key" ON "RegistrationEntry"("formId", "telegramUserId");
CREATE INDEX "RegistrationEntry_formId_status_createdAt_idx" ON "RegistrationEntry"("formId", "status", "createdAt");
CREATE INDEX "RegistrationEntry_cityId_status_idx" ON "RegistrationEntry"("cityId", "status");
CREATE UNIQUE INDEX "RegistrationFlow_chatId_telegramUserId_key" ON "RegistrationFlow"("chatId", "telegramUserId");
CREATE INDEX "RegistrationFlow_expiresAt_idx" ON "RegistrationFlow"("expiresAt");

ALTER TABLE "RegistrationForm" ADD CONSTRAINT "RegistrationForm_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationCity" ADD CONSTRAINT "RegistrationCity_formId_fkey" FOREIGN KEY ("formId") REFERENCES "RegistrationForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationField" ADD CONSTRAINT "RegistrationField_formId_fkey" FOREIGN KEY ("formId") REFERENCES "RegistrationForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationEntry" ADD CONSTRAINT "RegistrationEntry_formId_fkey" FOREIGN KEY ("formId") REFERENCES "RegistrationForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationEntry" ADD CONSTRAINT "RegistrationEntry_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "RegistrationCity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistrationFlow" ADD CONSTRAINT "RegistrationFlow_formId_fkey" FOREIGN KEY ("formId") REFERENCES "RegistrationForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
