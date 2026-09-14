import { PrayerRequestStatus, PrayerVisibility, PrismaClient } from '@prisma/client';

export class PrayerRequestService {
  public constructor(private readonly prisma: PrismaClient, private readonly now = () => new Date()) {}
  public async submit(groupChatId: string, userId: string, text: string, share: boolean) {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: groupChatId } });
    if (!group) return null;
    return this.prisma.prayerRequest.create({ data: { churchGroupId: group.id, submitterUserId: userId, text, visibility: share ? PrayerVisibility.ANONYMOUS_SHARE : PrayerVisibility.LEADERS_ONLY }, select: { id: true, visibility: true } });
  }
  public async list(groupChatId: string) { return this.prisma.prayerRequest.findMany({ where: { churchGroup: { telegramChatId: groupChatId }, status: { in: [PrayerRequestStatus.SUBMITTED, PrayerRequestStatus.ACKNOWLEDGED] } }, orderBy: { createdAt: 'asc' }, take: 20, select: { id: true, text: true, visibility: true, status: true, createdAt: true } }); }
  public async groupFor(id: string): Promise<string | null> { return (await this.prisma.prayerRequest.findUnique({ where: { id }, select: { churchGroup: { select: { telegramChatId: true } } } }))?.churchGroup.telegramChatId ?? null; }
  public async acknowledge(id: string, userId: string): Promise<boolean> { return (await this.prisma.prayerRequest.updateMany({ where: { id, status: PrayerRequestStatus.SUBMITTED }, data: { status: PrayerRequestStatus.ACKNOWLEDGED, acknowledgedByUserId: userId, acknowledgedAt: this.now() } })).count === 1; }
  public async archive(id: string, userId: string): Promise<boolean> { return (await this.prisma.prayerRequest.updateMany({ where: { id, status: { in: [PrayerRequestStatus.SUBMITTED, PrayerRequestStatus.ACKNOWLEDGED] } }, data: { status: PrayerRequestStatus.ARCHIVED, archivedByUserId: userId, archivedAt: this.now() } })).count === 1; }
  public async approveAnonymous(id: string, userId: string, publicText: string): Promise<boolean> { return (await this.prisma.prayerRequest.updateMany({ where: { id, visibility: PrayerVisibility.ANONYMOUS_SHARE, status: { in: [PrayerRequestStatus.SUBMITTED, PrayerRequestStatus.ACKNOWLEDGED] } }, data: { status: PrayerRequestStatus.PUBLIC_SCHEDULED, anonymousPublicDraft: publicText, approvedByUserId: userId, approvedAt: this.now(), availableAt: this.now() } })).count === 1; }
}
