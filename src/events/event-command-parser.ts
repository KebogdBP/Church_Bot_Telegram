import { z } from 'zod';

const oneTimeHeadSchema = z.tuple([
  z.string(),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.string().regex(/^\d{2}:\d{2}$/),
]);

const weeklyHeadSchema = z.tuple([
  z.string(),
  z.coerce.number().int().min(1).max(7),
  z.string().regex(/^\d{2}:\d{2}$/),
]);

export interface ParsedOneTimeEventCommand {
  date: string;
  time: string;
  title: string;
  location?: string;
  reminderMinutesBefore: number;
}

export interface ParsedWeeklyEventCommand extends Omit<ParsedOneTimeEventCommand, 'date'> {
  weekday: number;
}

export function parseOneTimeEventCommand(text: string): ParsedOneTimeEventCommand | null {
  const sections = splitSections(text);
  const head = oneTimeHeadSchema.safeParse(sections[0]?.split(/\s+/));
  return buildParsedCommand(head.success ? head.data.slice(1) : null, sections);
}

export function parseWeeklyEventCommand(text: string): ParsedWeeklyEventCommand | null {
  const sections = splitSections(text);
  const head = weeklyHeadSchema.safeParse(sections[0]?.split(/\s+/));
  const common = parseCommonSections(sections);
  if (!common || !head.success) return null;

  return {
    weekday: head.data[1],
    time: head.data[2],
    ...common,
  };
}

function splitSections(text: string): string[] {
  return text.split('|').map((part) => part.trim());
}

function buildParsedCommand(
  dateAndTime: Array<string | number> | null,
  sections: string[],
): ParsedOneTimeEventCommand | null {
  const common = parseCommonSections(sections);
  if (!dateAndTime || typeof dateAndTime[0] !== 'string' || typeof dateAndTime[1] !== 'string' || !common) {
    return null;
  }

  return {
    date: dateAndTime[0],
    time: dateAndTime[1],
    ...common,
  };
}

function parseCommonSections(sections: string[]) {
  const title = sections[1];
  const location = sections[2];
  const reminderMinutesBefore = Number(sections[3]);
  if (!title || !Number.isInteger(reminderMinutesBefore)) return null;

  return {
    title,
    reminderMinutesBefore,
    ...(location ? { location } : {}),
  };
}
