CREATE TYPE "EventRsvpResponse" AS ENUM ('GOING', 'MAYBE', 'NOT_GOING');

CREATE TABLE "EventRsvp" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "response" "EventRsvpResponse" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventRsvp_eventId_telegramUserId_key" ON "EventRsvp"("eventId", "telegramUserId");
CREATE INDEX "EventRsvp_eventId_response_idx" ON "EventRsvp"("eventId", "response");
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
