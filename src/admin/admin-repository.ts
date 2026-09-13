export interface AdminRepository {
  isAdmin(chatId: string, userId: string): Promise<boolean>;
  add(chatId: string, userId: string, addedByUserId: string, timezone: string): Promise<boolean>;
  remove(chatId: string, userId: string): Promise<boolean>;
  list(chatId: string): Promise<string[]>;
  dashboard(chatId: string): Promise<{ events: number; sermons: number; draftPosts: number; scheduledPosts: number; admins: number; contextConfigured: boolean }>;
}
