import type { Request, Response, NextFunction } from 'express';
import {
  db,
  camp,
  memberToCamp,
  group,
  room,
  chat,
  chatMember,
} from '../../db';
import catchAsync from '../../utils/catchAsync';
import * as campModel from '../models/campModel';
import * as roomModel from '../models/roomModel';
import * as groupModel from '../models/groupModel';
import * as chatModel from '../models/chatModel';
import ApiResponse from '../../utils/ApiResponse';
import { eq, sql, and, or } from 'drizzle-orm';
import AppError from '../../utils/appError';

/**
 * Endpoint to get all chats for a user in a specific camp
 * Returns: camp chat, staff chat (if applicable), room chat, group chat, and archived chats
 */
export const getMyCampChats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const campId = req.params.id;
    const userId = req.user?.id;

    if (!userId || !campId) {
      throw new AppError('Missing required camp or user information', 400);
    }

    // Get camp data
    const [campData] = await db
      .select({
        campChatId: camp.chatId,
        staffChatId: camp.staffChatId,
        campName: camp.name,
      })
      .from(camp)
      .where(eq(camp.id, campId));

    if (!campData) {
      throw new AppError('Camp not found', 404);
    }

    // Get user membership
    const memberData = await campModel.getMemberData(userId, campId);

    if (!memberData || !memberData.role) {
      throw new AppError('You are not a member of this camp', 404);
    }

    // Get all chat IDs for user to fetch lastViewed and archivedAt
    const userChatMembers = await db
      .select({
        chatId: chatMember.chatId,
        lastViewed: chatMember.lastViewed,
        archivedAt: chatMember.archivedAt,
      })
      .from(chatMember)
      .where(eq(chatMember.userId, userId));

    const chatViewMap = new Map(
      userChatMembers.map((cm) => [cm.chatId, cm.lastViewed]),
    );

    const chatArchiveMap = new Map(
      userChatMembers.map((cm) => [cm.chatId, cm.archivedAt]),
    );

    // Get all chats data (camp, staff, room, group) with lastMessageAt
    const chatIds = [
      campData.campChatId,
      campData.staffChatId,
      memberData.roomId,
      memberData.groupId,
    ].filter(Boolean);

    const chatsData = await db
      .select({
        chatId: chat.id,
        createdAt: chat.createdAt,
        lastMessageAt: chat.lastMessageAt,
      })
      .from(chat)
      .where(
        or(
          ...userChatMembers
            .filter((cm) => cm.chatId !== null)
            .map((cm) => eq(chat.id, cm.chatId!)),
        ),
      );

    const chatDataMap = new Map(
      chatsData.map((c) => [
        c.chatId,
        {
          createdAt: c.createdAt,
          lastMessageAt: c.lastMessageAt,
        },
      ]),
    );

    const chats: any[] = [];

    // 1. Camp main chat
    if (campData.campChatId) {
      chats.push({
        chatId: campData.campChatId,
        name: campData.campName,
        color: null,
        createdAt: chatDataMap.get(campData.campChatId)?.createdAt || null,
        lastMessageAt:
          chatDataMap.get(campData.campChatId)?.lastMessageAt || null,
        lastSeenAt: chatViewMap.get(campData.campChatId) || null,
        groupId: null,
        roomId: null,
        joinCode: null,
        type: 'Camp',
      });
    }

    // 2. Staff chat (if user is Staff or Owner)
    if (
      campData.staffChatId &&
      (memberData.role === 'Staff' || memberData.role === 'Owner')
    ) {
      chats.push({
        chatId: campData.staffChatId,
        name: `${campData.campName} - Staff`,
        color: null,
        createdAt: chatDataMap.get(campData.staffChatId)?.createdAt || null,
        lastMessageAt:
          chatDataMap.get(campData.staffChatId)?.lastMessageAt || null,
        lastSeenAt: chatViewMap.get(campData.staffChatId) || null,
        groupId: null,
        roomId: null,
        joinCode: null,
        type: 'Staff',
      });
    }

    // 3. Get current room data if user is in a room
    if (memberData.roomId) {
      const [roomData] = await db
        .select({
          chatId: room.chatId,
          name: room.name,
          color: room.color,
          joinCode: room.joinCode,
        })
        .from(room)
        .where(eq(room.id, memberData.roomId));

      if (roomData?.chatId) {
        chats.push({
          chatId: roomData.chatId,
          name: roomData.name,
          color: roomData.color,
          createdAt: chatDataMap.get(roomData.chatId)?.createdAt || null,
          lastMessageAt: chatDataMap.get(roomData.chatId)?.lastMessageAt || null,
          lastSeenAt: chatViewMap.get(roomData.chatId) || null,
          groupId: null,
          roomId: memberData.roomId,
          joinCode: roomData.joinCode,
          type: 'Room',
        });
      }
    }

    // 4. Get current group data if user is in a group
    if (memberData.groupId) {
      const [groupData] = await db
        .select({
          chatId: group.chatId,
          name: group.name,
          color: group.color,
          joinCode: group.joinCode,
        })
        .from(group)
        .where(eq(group.id, memberData.groupId));

      if (groupData?.chatId) {
        chats.push({
          chatId: groupData.chatId,
          name: groupData.name,
          color: groupData.color,
          createdAt: chatDataMap.get(groupData.chatId)?.createdAt || null,
          lastMessageAt:
            chatDataMap.get(groupData.chatId)?.lastMessageAt || null,
          lastSeenAt: chatViewMap.get(groupData.chatId) || null,
          groupId: memberData.groupId,
          roomId: null,
          joinCode: groupData.joinCode,
          type: 'Group',
        });
      }
    }

    // 5. Get old rooms/groups user left but is still in chatMember
    const oldRooms = await db
      .select({
        chatId: room.chatId,
        name: room.name,
        color: room.color,
        joinCode: room.joinCode,
        roomId: room.id,
      })
      .from(room)
      .innerJoin(chatMember, eq(room.chatId, chatMember.chatId))
      .where(
        and(
          eq(room.campId, campId),
          eq(chatMember.userId, userId),
          memberData.roomId
            ? sql`${room.id} != ${memberData.roomId}`
            : sql`1=1`,
        ),
      );

    for (const oldRoom of oldRooms) {
      if (oldRoom.chatId) {
        const isArchived = !!chatArchiveMap.get(oldRoom.chatId);
        chats.push({
          chatId: oldRoom.chatId,
          name: oldRoom.name,
          color: oldRoom.color,
          createdAt: chatDataMap.get(oldRoom.chatId)?.createdAt || null,
          lastMessageAt: chatDataMap.get(oldRoom.chatId)?.lastMessageAt || null,
          lastSeenAt: chatViewMap.get(oldRoom.chatId) || null,
          groupId: null,
          roomId: oldRoom.roomId,
          joinCode: oldRoom.joinCode,
          type: isArchived ? 'ArchivedRoom' : 'Room',
        });
      }
    }

    const oldGroups = await db
      .select({
        chatId: group.chatId,
        name: group.name,
        color: group.color,
        joinCode: group.joinCode,
        groupId: group.id,
      })
      .from(group)
      .innerJoin(chatMember, eq(group.chatId, chatMember.chatId))
      .where(
        and(
          eq(group.campId, campId),
          eq(chatMember.userId, userId),
          memberData.groupId
            ? sql`${group.id} != ${memberData.groupId}`
            : sql`1=1`,
        ),
      );

    for (const oldGroup of oldGroups) {
      if (oldGroup.chatId) {
        const isArchived = !!chatArchiveMap.get(oldGroup.chatId);
        chats.push({
          chatId: oldGroup.chatId,
          name: oldGroup.name,
          color: oldGroup.color,
          createdAt: chatDataMap.get(oldGroup.chatId)?.createdAt || null,
          lastMessageAt: chatDataMap.get(oldGroup.chatId)?.lastMessageAt || null,
          lastSeenAt: chatViewMap.get(oldGroup.chatId) || null,
          groupId: oldGroup.groupId,
          roomId: null,
          joinCode: oldGroup.joinCode,
          type: isArchived ? 'ArchivedGroup' : 'Group',
        });
      }
    }

    // Get all chatMembers for each chat
    for (const chat of chats) {
      const members = await chatModel.getChatMembers(chat.chatId);

      chat.chatMembers = members.map((m) => ({
        userId: m.userId,
        lastSeen: m.lastSeen,
      }));
    }

    new ApiResponse(200, chats).send(res);
  },
);

/**
 * Endpoint to get a specific chat for a user in a specific camp
 * Returns chat data: camp chat, staff chat, room chat, or group chat
 */
export const getChat = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const campId = req.params.id;
    const chatId = req.params.chatId;
    const userId = req.user?.id;

    if (!userId || !campId || !chatId) {
      throw new AppError('Missing required parameters', 400);
    }

    // Verify user is a member of the camp
    const [campData] = await db
      .select({
        campChatId: camp.chatId,
        staffChatId: camp.staffChatId,
        campName: camp.name,
        role: memberToCamp.role,
        roomId: memberToCamp.roomId,
        groupId: memberToCamp.groupId,
      })
      .from(camp)
      .leftJoin(
        memberToCamp,
        and(eq(memberToCamp.campId, camp.id), eq(memberToCamp.userId, userId)),
      )
      .where(eq(camp.id, campId));

    if (!campData || !campData.role) {
      throw new AppError('You are not a member of this camp', 404);
    }

    // Verify user is a member of the chat and get chat details
    const isMember = await chatModel.isChatMember(userId, chatId);

    if (!isMember) {
      throw new AppError('You are not a member of this chat', 404);
    }

    const chatDetails = await chatModel.getChatDetails(chatId, userId);

    // Check if user is archived in this chat
    const { isArchived } = await chatModel.isUserArchivedInChat(userId, chatId);

    let chatResponse: any = null;

    // Check if it's the camp main chat
    if (campData.campChatId === chatId) {
      chatResponse = {
        chatId: chatId,
        name: campData.campName,
        color: null,
        createdAt: chatDetails.createdAt,
        lastMessageAt: chatDetails.lastMessageAt,
        lastSeenAt: chatDetails.lastSeenAt,
        groupId: null,
        roomId: null,
        joinCode: null,
        type: 'Camp',
      };
    }
    // Check if it's the staff chat
    else if (campData.staffChatId === chatId) {
      if (campData.role !== 'Staff' && campData.role !== 'Owner') {
        throw new AppError('You do not have access to the staff chat', 403);
      }
      chatResponse = {
        chatId: chatId,
        name: `${campData.campName} - Staff`,
        color: null,
        createdAt: chatDetails.createdAt,
        lastMessageAt: chatDetails.lastMessageAt,
        lastSeenAt: chatDetails.lastSeenAt,
        groupId: null,
        roomId: null,
        joinCode: null,
        type: 'Staff',
      };
    }
    // Check if it's a room chat
    else {
      const roomData = await roomModel.getRoomByChatId(chatId, campId);

      if (roomData) {
        chatResponse = {
          chatId: chatId,
          name: roomData.name,
          color: roomData.color,
          createdAt: chatDetails.createdAt,
          lastMessageAt: chatDetails.lastMessageAt,
          lastSeenAt: chatDetails.lastSeenAt,
          groupId: null,
          roomId: roomData.roomId,
          joinCode: roomData.joinCode,
          type: isArchived ? 'ArchivedRoom' : 'Room',
        };
      } else {
        // Check if it's a group chat
        const groupData = await groupModel.getGroupByChatId(chatId, campId);

        if (groupData) {
          chatResponse = {
            chatId: chatId,
            name: groupData.name,
            color: groupData.color,
            createdAt: chatDetails.createdAt,
            lastMessageAt: chatDetails.lastMessageAt,
            lastSeenAt: chatDetails.lastSeenAt,
            groupId: groupData.groupId,
            roomId: null,
            joinCode: groupData.joinCode,
            type: isArchived ? 'ArchivedGroup' : 'Group',
          };
        }
      }
    }

    if (!chatResponse) {
      throw new AppError('Chat not found in this camp', 404);
    }

    // Get all chat members with their lastSeen
    const chatMembers = await chatModel.getChatMembers(chatId);

    chatResponse.chatMembers = chatMembers.map((m) => ({
      userId: m.userId,
      lastSeen: m.lastSeen,
    }));

    new ApiResponse(200, chatResponse).send(res);
  },
);
