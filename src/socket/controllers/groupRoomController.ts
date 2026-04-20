import { Socket } from 'socket.io';
import * as locationModel from '../models/locationModel';
import SocketError from '../../utils/socketError';
import { db } from '../../db';
import { group, chat, chatMember, message } from '../../db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { catchAsyncSocket } from '../../utils/catchAsync';
import { userSocketCash } from './authSocketController';

/**
 * Group Room Controller
 * Handles group socket room operations (join, leave)
 * Note: DB operations are handled by REST API, this only manages socket rooms
 */

/**
 * API helper for leaving group socket room
 * Called from REST API when user leaves group or camp
 */
export const API_Socket_handleLeaveGroup = catchAsyncSocket(
  async (userId: string, groupId: string): Promise<void> => {
    const socket = userSocketCash.get(userId);
    if (socket) {
      handleLeaveGroup(socket, { groupId });
    }
  },
);

/**
 * Join group socket room
 * Called after user joins a group via REST API
 */
export const handleJoinGroup = catchAsyncSocket(
  async (socket: Socket, { groupId }: { groupId: string }): Promise<void> => {
    const userId = socket.data.userId;

    // Verify user is member of this group
    const isMember = await locationModel.isUserGroupMember(userId, groupId);
    if (!isMember) {
      SocketError.emit(
        socket,
        'You are not a member of this group',
        'UNAUTHORIZED',
        403,
      );
      return;
    }

    // Join the group room
    socket.join(`group:${groupId}`);

    // Broadcast to group that user joined
    socket.to(`group:${groupId}`).emit('userJoinedGroup', {
      userId,
      userName: socket.data.userName,
      groupId,
    });
  },
);

/**
 * Leave group socket room
 * Called after user leaves a group via REST API
 */
export function handleLeaveGroup(
  socket: Socket,
  { groupId }: { groupId: string },
): void {
  const userId = socket.data.userId;
  const userName = socket.data.userName;

  // Leave the group room
  socket.leave(`group:${groupId}`);

  // Broadcast to group that user left
  socket.to(`group:${groupId}`).emit('userLeftGroup', {
    userId,
    userName,
    groupId,
  });
}

/**
 * End group
 * Called when a group member ends the group via socket
 * Removes all members from group, deletes group, and broadcasts to all members
 */
export const handleEndGroup = catchAsyncSocket(
  async (
    socket: Socket,
    { groupId, campId }: { groupId: string; campId: string },
  ): Promise<void> => {
    const userId = socket.data.userId;
    const userName = socket.data.userName;

    // Verify user is member of this group
    const isMember = await locationModel.isUserGroupMember(userId, groupId);
    if (!isMember) {
      SocketError.emit(
        socket,
        'You are not a member of this group',
        'UNAUTHORIZED',
        403,
      );
      return;
    }

    // Get group data to get chatId
    const [groupData] = await db
      .select({ chatId: group.chatId })
      .from(group)
      .where(eq(group.id, groupId));

    if (!groupData?.chatId) {
      SocketError.emit(socket, 'Group not found', 'NOT_FOUND', 404);
      return;
    }

    const chatId = groupData.chatId;

    // Get all group members before deleting
    const groupMembers = await locationModel.getGroupMembers(groupId);

    // End the group (update DB and delete group)
    await locationModel.endGroup(groupId);

    // Check if chat should be deleted (no messages)
    let chatDeleted = false;
    const messageCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(message)
      .where(and(eq(message.chatId, chatId), isNull(message.deletedAt)));

    const messageCount = messageCountResult[0]?.count ?? 0;

    // If no messages, delete the chat
    if (Number(messageCount) === 0) {
      await db.delete(chatMember).where(eq(chatMember.chatId, chatId));
      await db.delete(chat).where(eq(chat.id, chatId));
      chatDeleted = true;
    } else {
      // If there are messages, keep chat but archive ALL members (including staff/owners)
      // Everyone in the chat becomes archived when group ends
      await db
        .update(chatMember)
        .set({ archivedAt: new Date() })
        .where(eq(chatMember.chatId, chatId));
    }

    const payload = {
      groupId,
      chatDeleted,
      endedBy: {
        userId,
        userName,
      },
      timestamp: new Date(),
    };

    // Broadcast to all group members (including the user who ended it)
    socket.in(`group:${groupId}`).emit('groupEnded', payload);

    // Leave the group room
    socket.leave(`group:${groupId}`);
  },
);
