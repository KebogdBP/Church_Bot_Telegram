ALTER TABLE "ChurchGroup"
ADD COLUMN "audioRetentionDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "transcriptRetentionDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN "prayerRetentionDays" INTEGER NOT NULL DEFAULT 365;

ALTER TABLE "ChurchGroup"
ADD CONSTRAINT "ChurchGroup_audioRetentionDays_check" CHECK ("audioRetentionDays" BETWEEN 1 AND 3650),
ADD CONSTRAINT "ChurchGroup_transcriptRetentionDays_check" CHECK ("transcriptRetentionDays" BETWEEN 1 AND 3650),
ADD CONSTRAINT "ChurchGroup_prayerRetentionDays_check" CHECK ("prayerRetentionDays" BETWEEN 1 AND 3650);
