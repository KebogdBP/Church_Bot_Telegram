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
export type UpdateChurchEvent = Pick<
  ChurchEvent,
  'title' | 'startsAt' | 'weeklyDay' | 'localTime' | 'reminderMinutesBefore' | 'location'
>;

export interface EventRepository {
  create(event: CreateChurchEvent): Promise<ChurchEvent>;
  findActive(chatId: string, eventId: string): Promise<ChurchEvent | null>;
  listActive(chatId: string): Promise<ChurchEvent[]>;
  update(chatId: string, eventId: string, event: UpdateChurchEvent): Promise<ChurchEvent | null>;
  delete(chatId: string, eventId: string): Promise<boolean>;
}
