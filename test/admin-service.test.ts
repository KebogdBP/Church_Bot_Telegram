import { describe, expect, it, vi } from 'vitest';
import type { AdminRepository } from '../src/admin/admin-repository.js';
import { AdminService } from '../src/admin/admin-service.js';

const repository = (): AdminRepository => ({
  isAdmin: vi.fn().mockResolvedValue(false), add: vi.fn().mockResolvedValue(true),
  remove: vi.fn().mockResolvedValue(true), list: vi.fn().mockResolvedValue(['99']),
  dashboard: vi.fn().mockResolvedValue({ events: 1, sermons: 2, draftPosts: 3, scheduledPosts: 4, admins: 1, contextConfigured: true }),
});

describe('AdminService', () => {
  it('combines bootstrap and group-scoped administrators', async () => {
    const repo = repository();
    vi.mocked(repo.isAdmin).mockResolvedValue(true);
    const service = new AdminService(repo, new Set(['42']), 'Europe/Moscow');
    await expect(service.isAdmin('chat', '42')).resolves.toBe(true);
    await expect(service.isAdmin('chat', '99')).resolves.toBe(true);
    await expect(service.list('chat')).resolves.toEqual(['42', '99']);
  });

  it('does not allow removing the bootstrap administrator', async () => {
    const repo = repository();
    const service = new AdminService(repo, new Set(['42']), 'Europe/Moscow');
    await expect(service.remove('chat', '42')).resolves.toBe(false);
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
