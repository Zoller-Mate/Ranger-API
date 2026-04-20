import { db } from '../../db';
import { chatMember, memberToCamp } from '../../db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';

// Get chat member user IDs
export async function getChatMemberIds(chatId: string) {
  const members = await db
    .select({
      userId: chatMember.userId,
    })
    .from(chatMember)
    .where(eq(chatMember.chatId, chatId));

  return members.map((m) => m.userId);
}

/**
 * Get all camp IDs where user is a member
 * Used for broadcasting presence updates to all camp members
 */
export async function getUserCampIds(userId: string): Promise<string[]> {
  const result = await db
    .select({ campId: memberToCamp.campId })
    .from(memberToCamp)
    .where(eq(memberToCamp.userId, userId));

  return result.map((r) => r.campId).filter((id): id is string => id !== null);
}

/**
 * Get camp IDs where user is Staff or Owner
 */
export async function getUserStaffCampIds(userId: string): Promise<string[]> {
  const result = await db
    .select({ campId: memberToCamp.campId })
    .from(memberToCamp)
    .where(
      and(
        eq(memberToCamp.userId, userId),
        sql`${memberToCamp.role} IN ('Owner', 'Staff')`,
      ),
    );

  return result.map((r) => r.campId).filter((id): id is string => id !== null);
}

// Get user's chat IDs (for broadcasting)
export async function getUserChatIds(
  userId: string,
  includeArchived: boolean = false,
): Promise<string[]> {
  const conditions = includeArchived
    ? eq(chatMember.userId, userId)
    : and(eq(chatMember.userId, userId), isNull(chatMember.archivedAt));

  const result = await db
    .select({ chatId: chatMember.chatId })
    .from(chatMember)
    .where(conditions);

  return result.map((r) => r.chatId).filter((id): id is string => id !== null);
}

// Check if user is member of chat
export async function isUserChatMember(
  userId: string,
  chatId: string,
): Promise<boolean> {
  const [member] = await db
    .select()
    .from(chatMember)
    .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
    .limit(1);

  return !!member;
}

// TODO: Add function to check if user has ACTIVE membership (not just chat member)
// This function should check if:
// 1. For room chats: user has non-null roomId in memberToCamp for this room
// 2. For group chats: user has non-null groupId in memberToCamp for this group
// 3. For camp chats: user is still a member of the camp
// Example: isUserActiveChatMember(userId: string, chatId: string): Promise<boolean>

// Update lastViewed timestamp when user views chat
export async function updateLastViewed(chatId: string, userId: string) {
  await db
    .update(chatMember)
    .set({
      lastViewed: new Date(),
    })
    .where(and(eq(chatMember.chatId, chatId), eq(chatMember.userId, userId)));
}
