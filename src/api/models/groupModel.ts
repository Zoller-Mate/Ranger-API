import {
  db,
  group,
  memberToCamp,
  chat,
  chatMember,
  message,
} from '../../db/index';
import { eq, and, isNull, sql } from 'drizzle-orm';
import AppError from '../../utils/appError';
import { archiveAllStaffInChat } from './chatModel';

export const validateJoinCode = async (
  joinCode: string,
  campId: string,
): Promise<string | null> => {
  joinCode = joinCode.split('-').join('').toUpperCase();
  if (joinCode.length > 12 || joinCode.length < 6) return null;

  // Check if code exists in ANY group globally (all camps)
  const existingGroup = await db
    .select({ code: group.joinCode })
    .from(group)
    .where(eq(group.joinCode, joinCode));

  return existingGroup.length === 0 ? joinCode : null;
};

export const createJoinCode = async (campId: string): Promise<string> => {
  let code: string;
  do {
    code = `${Math.floor(Math.random() * 1000000000000)}`;
  } while (typeof (await validateJoinCode(code, campId)) != 'string');
  return code;
};

/**
 * Gets remaining members in a group.
 * @param groupId The group's ID
 * @returns Array of user IDs
 */
export const getRemainingGroupMembers = async (
  groupId: string,
): Promise<Array<{ userId: string | null }>> => {
  return await db
    .select({ userId: memberToCamp.userId })
    .from(memberToCamp)
    .where(eq(memberToCamp.groupId, groupId));
};

/**
 * Checks if a group is empty and deletes it with its chat if no messages exist.
 * @param groupId The group's ID
 * @param chatId The chat's ID
 * @param campId The camp's ID (needed for archiving staff)
 * @returns True if chat was deleted, false otherwise
 */
export const deleteGroupIfEmpty = async (
  groupId: string,
  chatId: string,
  campId: string,
): Promise<boolean> => {
  const remainingMembers = await getRemainingGroupMembers(groupId);

  if (remainingMembers.length === 0) {
    // Check if there are any non-deleted messages in the group's chat
    const messageCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(message)
      .where(and(eq(message.chatId, chatId), isNull(message.deletedAt)));

    const messageCount = messageCountResult[0]?.count ?? 0;

    // If no messages, delete both the group and the chat
    if (Number(messageCount) === 0) {
      // Delete group first (owns the FK), then chat members and chat
      await db.delete(group).where(eq(group.id, groupId));
      await db.delete(chatMember).where(eq(chatMember.chatId, chatId));
      await db.delete(chat).where(eq(chat.id, chatId));
      return true;
    } else {
      // If there are messages, just delete the group (keep chat archived)
      await db.delete(group).where(eq(group.id, groupId));

      // Archive all staff/owner members since the group is now deleted

      await archiveAllStaffInChat(chatId, campId);

      return false;
    }
  }

  return false;
};

/**
 * Gets group data by chatId and campId.
 * @param chatId The chat's ID
 * @param campId The camp's ID
 * @returns Group data or null
 */
export const getGroupByChatId = async (
  chatId: string,
  campId: string,
): Promise<{
  name: string | null;
  color: string | null;
  joinCode: string | null;
  groupId: string;
} | null> => {
  const [groupData] = await db
    .select({
      name: group.name,
      color: group.color,
      joinCode: group.joinCode,
      groupId: group.id,
    })
    .from(group)
    .where(and(eq(group.chatId, chatId), eq(group.campId, campId)));

  return groupData || null;
};

/**
 * Gets group data by join code and camp ID.
 * @param joinCode The group's join code
 * @param campId The camp's ID
 * @returns Group data or null
 */
export const getGroupByJoinCode = async (
  joinCode: string,
  campId: string,
): Promise<{
  id: string;
  chatId: string | null;
  name: string | null;
  color: string | null;
  campId: string | null;
  joinCode: string | null;
} | null> => {
  const [groupData] = await db
    .select({
      id: group.id,
      chatId: group.chatId,
      name: group.name,
      color: group.color,
      campId: group.campId,
      joinCode: group.joinCode,
    })
    .from(group)
    .where(and(eq(group.joinCode, joinCode), eq(group.campId, campId)));

  return groupData || null;
};
