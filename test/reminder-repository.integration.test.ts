import { PrismaClient, ReminderDeliveryStatus, TranscriptionStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaReminderRepository } from '../src/reminders/prisma-reminder-repository.js';
import { PrismaEventRepository } from '../src/events/prisma-event-repository.js';
import { PrismaSermonRepository } from '../src/sermons/prisma-sermon-repository.js';
import { PrismaTranscriptionRepository } from '../src/sermons/prisma-transcription-repository.js';
import { PrismaSermonNotificationRepository } from '../src/sermons/prisma-sermon-notification-repository.js';
import { PrismaSermonPostRepository } from '../src/sermons/prisma-sermon-post-repository.js';
import { GuidedEventService } from '../src/admin/guided-event-service.js';
import { EventService } from '../src/events/event-service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaReminderRepository integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaClient();
    await prisma.sermon.deleteMany();
    await prisma.reminderDelivery.deleteMany();
    await prisma.event.deleteMany();
    await prisma.churchGroup.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('plans, claims, and completes one durable delivery', async () => {
    const group = await prisma.churchGroup.create({
      data: { telegramChatId: 'integration-chat', timezone: 'Europe/Moscow' },
    });
    const event = await prisma.event.create({
      data: {
        churchGroupId: group.id,
        title: 'Интеграционное событие',
        startsAt: new Date('2099-09-20T07:00:00.000Z'),
        timezone: 'Europe/Moscow',
        reminderMinutesBefore: 60,
        createdByTelegramUserId: 'integration-admin',
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

    await repository.plan(event.id, {
      occurrenceAt: new Date('2099-09-27T07:00:00.000Z'),
      scheduledFor: new Date('2099-09-27T06:00:00.000Z'),
    });
    const eventRepository = new PrismaEventRepository(prisma);
    await eventRepository.update('integration-chat', event.id, {
      title: 'Обновлённое событие',
      startsAt: new Date('2099-09-20T08:00:00.000Z'),
      reminderMinutesBefore: 120,
    });

    expect(await prisma.reminderDelivery.count({ where: { eventId: event.id } })).toBe(1);
    expect(await prisma.reminderDelivery.count({
      where: { eventId: event.id, status: ReminderDeliveryStatus.SENT },
    })).toBe(1);
  });

  it('stores sermon metadata idempotently', async () => {
    const repository = new PrismaSermonRepository(prisma);
    const input = {
      chatId: 'sermon-integration-chat',
      sourceMessageId: '100',
      submittedByUserId: '42',
      kind: 'audio' as const,
      telegramFileId: 'file-id',
      telegramFileUniqueId: 'unique-id',
      fileName: 'sermon.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 4_096,
      durationSeconds: 1_800,
      title: 'О надежде',
    };

    const first = await repository.createIfNew(input, 'Europe/Moscow');
    const duplicate = await repository.createIfNew(input, 'Europe/Moscow');

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.sermon.id).toBe(first.sermon.id);
    expect(duplicate.sermon.fileSize).toBe(4_096);
  });

  it('claims stored audio and persists its transcript', async () => {
    const sermons = new PrismaSermonRepository(prisma);
    const transcription = new PrismaTranscriptionRepository(prisma);
    const created = await sermons.createIfNew({
      chatId: 'transcription-integration-chat',
      sourceMessageId: '200',
      kind: 'audio',
      telegramFileId: 'transcription-file-id',
      telegramFileUniqueId: 'transcription-unique-id',
      fileName: 'sunday.mp3',
      mimeType: 'audio/mpeg',
    }, 'Europe/Moscow');
    await sermons.markStored(created.sermon.id, 'audio/sunday.mp3', '/data/sunday.mp3');

    const claimed = await transcription.claimNext(new Date('2100-01-01T00:00:00Z'));
    expect(claimed).toMatchObject({ id: created.sermon.id, storedPath: '/data/sunday.mp3', attempts: 1 });

    const completedAt = new Date('2026-09-13T12:00:00Z');
    await transcription.markCompleted(created.sermon.id, 'Текст проповеди', 'test-model', completedAt);
    const stored = await prisma.sermon.findUniqueOrThrow({ where: { id: created.sermon.id } });
    expect(stored.transcriptionStatus).toBe(TranscriptionStatus.COMPLETED);
    expect(stored.transcript).toBe('Текст проповеди');
    expect(stored.transcriptionModel).toBe('test-model');
    expect(stored.transcribedAt).toEqual(completedAt);
  });

  it('persists and completes a guided event flow', async () => {
    const events = new EventService(new PrismaEventRepository(prisma), () => new Date('2026-09-14T08:00:00Z'));
    const flow = new GuidedEventService(prisma, events, 'Europe/Moscow', () => new Date('2026-09-14T08:00:00Z'));
    await flow.start('guided-chat', '42');
    expect((await flow.consume('guided-chat', '42', '2099-10-01'))?.text).toContain('время');
    expect((await flow.consume('guided-chat', '42', '10:00'))?.text).toContain('название');
    expect((await flow.consume('guided-chat', '42', 'Воскресное служение'))?.text).toContain('место');
    expect((await flow.consume('guided-chat', '42', 'Главный зал'))?.text).toContain('минут');
    const confirmation = await flow.consume('guided-chat', '42', '1020');
    expect(confirmation?.keyboard?.[0]?.[0]?.callbackData).toBe('flow:confirm');
    await expect(flow.confirm('guided-chat', '42')).resolves.toMatchObject({ text: expect.stringContaining('создано') });
    expect(await prisma.event.count({ where: { churchGroup: { telegramChatId: 'guided-chat' } } })).toBe(1);
    expect(await prisma.adminFlow.count({ where: { telegramUserId: '42' } })).toBe(0);
  });
});

describeWithDatabase('PrismaSermonNotificationRepository integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaClient();
    await prisma.sermonNotification.deleteMany();
    await prisma.sermon.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('plans each completed milestone once and claims it for delivery', async () => {
    const group = await prisma.churchGroup.create({ data: { telegramChatId: `notification-${Date.now()}` } });
    const sermon = await prisma.sermon.create({
      data: {
        churchGroupId: group.id,
        sourceMessageId: '991',
        telegramFileId: 'file-notification',
        telegramFileUniqueId: 'unique-notification',
        audioKind: 'AUDIO',
        submittedByUserId: 'admin-77',
        status: 'STORED',
        transcriptionStatus: 'COMPLETED',
        contentStatus: 'COMPLETED',
      },
    });
    const repository = new PrismaSermonNotificationRepository(prisma);
    const now = new Date('2026-09-14T12:00:00Z');

    expect(await repository.planMilestones(now)).toBe(3);
    expect(await repository.planMilestones(now)).toBe(0);
    const claimed = await repository.claimDue(now, 10);

    expect(claimed).toHaveLength(3);
    expect(claimed.every((item) => item.targetChatId === 'admin-77')).toBe(true);
    await Promise.all(claimed.map((item) => repository.markSent(item.id, now)));
    expect(await prisma.sermonNotification.count({ where: { sermonId: sermon.id, status: 'SENT' } })).toBe(3);

    await prisma.churchGroup.delete({ where: { id: group.id } });
  });

  it('audits draft moderation and regenerates only unpublished series', async () => {
    const chatId = `moderation-${Date.now()}`;
    const group = await prisma.churchGroup.create({ data: { telegramChatId: chatId } });
    const sermon = await prisma.sermon.create({
      data: {
        churchGroupId: group.id, sourceMessageId: 'moderation-1', status: 'STORED',
        transcriptionStatus: 'COMPLETED', transcript: 'Текст', contentStatus: 'COMPLETED',
        posts: { create: [{ sequence: 0, content: 'Первый', churchGroupId: group.id }, { sequence: 1, content: 'Второй', churchGroupId: group.id }] },
      },
      include: { posts: { orderBy: { sequence: 'asc' } } },
    });
    const repository = new PrismaSermonPostRepository(prisma);
    const now = new Date('2026-09-14T15:00:00Z');

    expect(await repository.editDraft(chatId, sermon.posts[0]!.id, 'Исправленный', 'admin-1', now)).toBe(true);
    expect(await repository.rejectDraft(chatId, sermon.posts[1]!.id, 'admin-2', now)).toBe(true);
    const edited = await prisma.sermonPost.findUniqueOrThrow({ where: { id: sermon.posts[0]!.id } });
    expect(edited).toMatchObject({ content: 'Исправленный', editedByUserId: 'admin-1', editedAt: now });

    expect(await repository.regenerate(chatId, sermon.id, 'admin-3', now)).toBe(true);
    expect(await prisma.sermonPost.count({ where: { sermonId: sermon.id } })).toBe(0);
    expect(await prisma.sermon.findUniqueOrThrow({ where: { id: sermon.id } })).toMatchObject({
      contentStatus: 'PENDING', contentAttempts: 0, regeneratedByUserId: 'admin-3', regeneratedAt: now,
    });

    await prisma.churchGroup.delete({ where: { id: group.id } });
  });
});
