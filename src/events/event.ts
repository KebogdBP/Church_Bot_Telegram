export type EventRecurrence = 'none' | 'weekly';

export interface ChurchEvent {
  id: string;
  chatId: string;
  title: string;
  startsAt: Date;
  timezone: string;
  recurrence: EventRecurrence;
  weeklyDay?: number;
  localTime?: string;
  reminderMinutesBefore: number;
  location?: string;
  topic?: string;
  biblePassage?: string;
  createdByUserId: string;
}

export type CreateChurchEvent = Omit<ChurchEvent, 'id'>;

export interface EventRepository {
  create(event: CreateChurchEvent): Promise<ChurchEvent>;
  listActive(chatId: string): Promise<ChurchEvent[]>;
  delete(chatId: string, eventId: string): Promise<boolean>;
}
