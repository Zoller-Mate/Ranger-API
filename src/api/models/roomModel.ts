import {
  db,
  room,
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

  // Check if code exists in ANY room globally (all camps)
  const existingRoom = await db
    .select({ code: room.joinCode })
    .from(room)
    .where(eq(room.joinCode, joinCode));

  return existingRoom.length === 0 ? joinCode : null;
};

export const createJoinCode = async (campId: string): Promise<string> => {
  let code: string;
  do {
    code = `${Math.floor(Math.random() * 1000000000000)}`;
  } while (typeof (await validateJoinCode(code, campId)) != 'string');
  return code;
};

/**
 * Gets remaining members in a room.
 * @param roomId The room's ID
 * @returns Array of user IDs
 */
export const getRemainingRoomMembers = async (
  roomId: string,
): Promise<Array<{ userId: string | null }>> => {
  return await db
    .select({ userId: memberToCamp.userId })
    .from(memberToCamp)
    .where(eq(memberToCamp.roomId, roomId));
};

/**
 * Checks if a room is empty and deletes it with its chat if no messages exist.
 * @param roomId The room's ID
 * @param chatId The chat's ID
 * @param campId The camp's ID (needed for archiving staff)
 * @returns True if chat was deleted, false otherwise
 */
export const deleteRoomIfEmpty = async (
  roomId: string,
  chatId: string,
  campId: string,
): Promise<boolean> => {
  const remainingMembers = await getRemainingRoomMembers(roomId);

  if (remainingMembers.length === 0) {
    // Check if there are any non-deleted messages in the room's chat
    const messageCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(message)
      .where(and(eq(message.chatId, chatId), isNull(message.deletedAt)));

    const messageCount = messageCountResult[0]?.count ?? 0;

    // If no messages, delete both the room and the chat
    if (Number(messageCount) === 0) {
      // Delete room first (owns the FK), then chat members and chat
      await db.delete(room).where(eq(room.id, roomId));
      await db.delete(chatMember).where(eq(chatMember.chatId, chatId));
      await db.delete(chat).where(eq(chat.id, chatId));
      return true;
    } else {
      // If there are messages, just delete the room (keep chat archived)
      await db.delete(room).where(eq(room.id, roomId));

      // Archive all staff/owner members since the room is now deleted
      await archiveAllStaffInChat(chatId, campId);

      return false;
    }
  }

  return false;
};

/**
 * Gets room data by chatId and campId.
 * @param chatId The chat's ID
 * @param campId The camp's ID
 * @returns Room data or null
 */
export const getRoomByChatId = async (
  chatId: string,
  campId: string,
): Promise<{
  name: string | null;
  color: string | null;
  joinCode: string | null;
  roomId: string;
} | null> => {
  const [roomData] = await db
    .select({
      name: room.name,
      color: room.color,
      joinCode: room.joinCode,
      roomId: room.id,
    })
    .from(room)
    .where(and(eq(room.chatId, chatId), eq(room.campId, campId)));

  return roomData || null;
};

/**
 * Gets room data by join code and camp ID.
 * @param joinCode The room's join code
 * @param campId The camp's ID
 * @returns Room data or null
 */
export const getRoomByJoinCode = async (
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
  const [roomData] = await db
    .select({
      id: room.id,
      chatId: room.chatId,
      name: room.name,
      color: room.color,
      campId: room.campId,
      joinCode: room.joinCode,
    })
    .from(room)
    .where(and(eq(room.joinCode, joinCode), eq(room.campId, campId)));

  return roomData || null;
};
