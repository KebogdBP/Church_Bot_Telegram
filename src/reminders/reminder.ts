import type { ChurchEvent } from '../events/event.js';
import type { PlannedReminder } from '../events/reminder-time.js';

export interface ClaimedReminder {
  deliveryId: string;
  event: ChurchEvent;
  occurrenceAt: Date;
  attempt: number;
}

export interface ReminderRepository {
  listEventsForPlanning(): Promise<ChurchEvent[]>;
  plan(eventId: string, reminder: PlannedReminder): Promise<boolean>;
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  expirePast(now: Date): Promise<number>;
  claimDue(now: Date, limit: number): Promise<ClaimedReminder[]>;
  markSent(deliveryId: string, sentAt: Date): Promise<void>;
  markFailed(deliveryId: string, error: string, retryAt: Date): Promise<void>;
}
