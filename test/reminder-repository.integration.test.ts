import { PrismaClient, ReminderDeliveryStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaReminderRepository } from '../src/reminders/prisma-reminder-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaReminderRepository integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaClient();
    await prisma.reminderDelivery.deleteMany();
    await prisma.event.deleteMany();
    await prisma.churchGroup.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('plans, claims, and completes one durable delivery', async () => {
    const group = await prisma.churchGroup.create({
      data: { maxChatId: 'integration-chat', timezone: 'Europe/Moscow' },
    });
    const event = await prisma.event.create({
      data: {
        churchGroupId: group.id,
        title: 'Интеграционное событие',
        startsAt: new Date('2099-09-20T07:00:00.000Z'),
        timezone: 'Europe/Moscow',
        reminderMinutesBefore: 60,
        createdByMaxUserId: 'integration-admin',
      },
    });
    const repository = new PrismaReminderRepository(prisma);
    const reminder = {
      occurrenceAt: event.startsAt,
      scheduledFor: new Date('2099-09-20T06:00:00.000Z'),
    };

    expect(await repository.plan(event.id, reminder)).toBe(true);
    expect(await repository.plan(event.id, reminder)).toBe(false);

    const claimed = await repository.claimDue(new Date('2099-09-20T06:00:01.000Z'), 10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.event.chatId).toBe('integration-chat');

    await repository.markSent(claimed[0]!.deliveryId, new Date('2099-09-20T06:00:02.000Z'));
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({
      where: { id: claimed[0]!.deliveryId },
    });
    expect(delivery.status).toBe(ReminderDeliveryStatus.SENT);
    expect(delivery.attempts).toBe(1);
  });
});
