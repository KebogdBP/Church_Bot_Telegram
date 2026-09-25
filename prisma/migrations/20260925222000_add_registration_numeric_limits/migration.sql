ALTER TABLE "RegistrationForm"
ADD COLUMN "ageMin" INTEGER,
ADD COLUMN "ageMax" INTEGER,
ADD COLUMN "ageRejectionMessage" TEXT NOT NULL DEFAULT 'Спасибо за интерес к мероприятию. К сожалению, эта регистрация открыта для другой возрастной группы. Если возраст был указан ошибочно, отправьте правильное число ещё раз.';

ALTER TABLE "RegistrationField"
ADD COLUMN "minValue" DOUBLE PRECISION,
ADD COLUMN "maxValue" DOUBLE PRECISION,
ADD COLUMN "rejectionMessage" TEXT;

ALTER TABLE "RegistrationForm"
ADD CONSTRAINT "RegistrationForm_ageMin_check" CHECK ("ageMin" IS NULL OR "ageMin" BETWEEN 1 AND 120),
ADD CONSTRAINT "RegistrationForm_ageMax_check" CHECK ("ageMax" IS NULL OR "ageMax" BETWEEN 1 AND 120),
ADD CONSTRAINT "RegistrationForm_ageRange_check" CHECK ("ageMin" IS NULL OR "ageMax" IS NULL OR "ageMin" <= "ageMax");

ALTER TABLE "RegistrationField"
ADD CONSTRAINT "RegistrationField_numericRange_check" CHECK ("minValue" IS NULL OR "maxValue" IS NULL OR "minValue" <= "maxValue");
