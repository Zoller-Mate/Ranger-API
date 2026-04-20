import catchAsync from '../../utils/catchAsync';
import type { NextFunction, Request, Response } from 'express';
import {
  chat,
  chatMember,
  db,
  room,
  memberToCamp,
  camp,
  payment,
  userPayment,
  group,
  message,
  user,
} from '../../db';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import AppError from '../../utils/appError';
import {
  API_Socket_handleJoinChat,
  API_Socket_handleLeaveChat,
} from '../../socket/controllers/chatRoomController';
import ApiResponse from '../../utils/ApiResponse';
import validateColor from '../../utils/validateColor';
import * as roomModel from '../models/roomModel';
import * as campModel from '../models/campModel';
import * as chatModel from '../models/chatModel';
import * as groupModel from '../models/groupModel';
import { getMoreFactory, getOneFactory } from '../../utils/factory';

/**
 * Adds the logged in user to the given room and it's chat.
 * His current room will be left. But the chat corresponding to the previous room won't.
 */
export const joinRoom = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const roomData = await roomModel.getRoomByJoinCode(
      req.params.code ?? '',
      req.params.id ?? '',
    );

    if (!roomData) {
      throw new AppError(
        'No room found in the camp with the given joinCode',
        404,
      );
    } else {
      const memberData = await campModel.getMemberData(
        req.user?.id ?? '',
        req.params.id ?? '',
      );

      if (memberData?.roomId === roomData.id) {
        throw new AppError('You are already in this room!', 400);
      } else {
        // Get user's current room before updating
        const previousRoomId = memberData?.roomId;

        // Update user's room
        await campModel.updateMemberAssignment(
          req.user?.id ?? '',
          req.params.id ?? '',
          { roomId: roomData.id },
        );

        // Check if previous room is now empty and delete it
        if (previousRoomId) {
          const remainingMembers =
            await roomModel.getRemainingRoomMembers(previousRoomId);

          if (remainingMembers.length === 0) {
            await db.delete(room).where(eq(room.id, previousRoomId));
          }
        }

        // Add user to room chat if not already a member
        const wasAdded = await chatModel.addUserToChatIfNotMember(
          req.user?.id ?? '',
          roomData.chatId ?? '',
        );

        // If user was already a member (possibly archived), unarchive them
        if (!wasAdded) {
          await chatModel.unarchiveChatMember(
            req.user?.id ?? '',
            roomData.chatId ?? '',
          );
        }

        // Get chat last message timestamp
        const lastMessageAt = await chatModel.getChatLastMessage(
          roomData.chatId ?? '',
        );

        // Get all chat members with their lastSeen
        const chatMembers = await chatModel.getChatMembers(
          roomData.chatId ?? '',
        );

        API_Socket_handleJoinChat(req.user?.id, roomData.chatId);

        new ApiResponse(201, {
          chatId: roomData.chatId,
          name: roomData.name,
          color: roomData.color,
          lastMessageAt: lastMessageAt,
          roomId: roomData.id,
          joinCode: roomData.joinCode,
          type: 'Room',
          chatMembers: chatMembers.map((m) => ({
            userId: m.userId,
            lastSeen: m.lastSeen,
          })),
        }).send(res);
      }
    }
  },
);

/**
 * Endpoint to create a room in a certain camp
 */
export const createRoom = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, color, joinCode } = req.body;
    if (!name || !color)
      throw new AppError('Please provide all room data', 400);
    if (!validateColor(color))
      throw new AppError('The color you provided was not valid', 400);
    const chatId = (await db.insert(chat).values({}).returning())[0]?.id;

    if (!chatId) {
      throw new AppError('Failed to create chat for room', 500);
    }

    // Validate or generate join code
    let validatedJoinCode: string;
    if (joinCode) {
      const validated = await roomModel.validateJoinCode(
        joinCode,
        req.params.id ?? '',
      );
      if (!validated) {
        throw new AppError('The join code is invalid or already in use', 400);
      }
      validatedJoinCode = validated;
    } else {
      validatedJoinCode = await roomModel.createJoinCode(req.params.id ?? '');
    }

    const _appData = {
      name,
      campId: req.params.id,
      color,
      chatId,
      joinCode: validatedJoinCode,
    };

    const roomData = await db.insert(room).values(_appData).returning();

    // Get user's current room before updating
    const memberData = await campModel.getMemberData(
      req.user?.id ?? '',
      req.params.id ?? '',
    );
    const previousRoomId = memberData?.roomId;

    // Update user's room to the new one
    await campModel.updateMemberAssignment(
      req.user?.id ?? '',
      req.params.id ?? '',
      { roomId: roomData[0]?.id ?? null },
    );

    // Check if previous room is now empty and delete it
    if (previousRoomId) {
      const remainingMembers =
        await roomModel.getRemainingRoomMembers(previousRoomId);

      if (remainingMembers.length === 0) {
        await db.delete(room).where(eq(room.id, previousRoomId));
      }
    }

    // Get all staff and owner members of this camp to add to room chat
    const staffAndOwners = await campModel.getCampStaffAndOwners(
      req.params.id ?? '',
    );

    // Add current user and all staff/owners to room chat (deduped)
    await chatModel.addUsersToChat(
      chatId,
      [req.user?.id ?? ''],
      staffAndOwners,
    );

    // Get all chat members with their lastSeen
    const chatMembers = await chatModel.getChatMembers(chatId);

    const data = {
      chatId: roomData[0]?.chatId,
      name: roomData[0]?.name,
      color: roomData[0]?.color,
      roomId: roomData[0]?.id,
      joinCode: roomData[0]?.joinCode,
      type: 'Room',
      chatMembers: chatMembers.map((m) => ({
        userId: m.userId,
        lastSeen: m.lastSeen,
      })),
    };

    API_Socket_handleJoinChat(req.user?.id, roomData[0]?.chatId);

    new ApiResponse(201, data).send(res);
  },
);

/**
 * Endpoint to update a room in a certain camp
 */
export const updateRoom = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, color, joinCode } = req.body;

    // Validate color if provided
    if (color && !validateColor(color)) {
      throw new AppError('The color you provided was not valid', 400);
    }

    // Prepare update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (color) updateData.color = color;
    if (joinCode) {
      const validatedJoinCode = await roomModel.validateJoinCode(
        joinCode,
        req.params.id ?? '',
      );
      if (!validatedJoinCode) {
        throw new AppError('The join code is invalid or already in use', 400);
      }
      updateData.joinCode = validatedJoinCode;
    }

    // Update room
    const updatedRoom = await db
      .update(room)
      .set(updateData)
      .where(
        and(
          eq(room.id, req.params.roomId ?? ''),
          eq(room.campId, req.params.id ?? ''),
        ),
      )
      .returning();

    if (updatedRoom.length === 0) {
      throw new AppError('Room not found in this camp', 404);
    }

    const chatId = updatedRoom[0]?.chatId;
    if (!chatId) {
      throw new AppError('Room has no associated chat', 500);
    }

    // Get chat details
    const chatDetails = await chatModel.getChatDetails(
      chatId,
      req.user?.id ?? '',
    );

    // Get all chat members with their lastSeen
    const chatMembers = await chatModel.getChatMembers(chatId);

    new ApiResponse(200, {
      chatId: updatedRoom[0]?.chatId,
      name: updatedRoom[0]?.name,
      color: updatedRoom[0]?.color,
      lastMessageAt: chatDetails.lastMessageAt,
      lastSeenAt: chatDetails.lastSeenAt,
      roomId: updatedRoom[0]?.id,
      joinCode: updatedRoom[0]?.joinCode,
      type: 'Room',
      chatMembers: chatMembers.map((m) => ({
        userId: m.userId,
        lastSeen: m.lastSeen,
      })),
    }).send(res);
  },
);

/**
 * Endpoint to leave a room in a certain camp
 * User will be removed from the room but will remain in the chat (read-only)
 */
export const leaveRoom = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Check if user is a member of the camp and has a room
    const memberData = await campModel.getMemberData(
      req.user?.id ?? '',
      req.params.id ?? '',
    );

    if (!memberData) {
      throw new AppError('You are not a member of this camp', 404);
    }

    if (!memberData.roomId) {
      throw new AppError('You are not in any room', 400);
    }

    const roomId = memberData.roomId;

    // Get room data to get chatId
    const [roomData] = await db
      .select({ chatId: room.chatId })
      .from(room)
      .where(eq(room.id, roomId));

    if (!roomData || !roomData.chatId) {
      throw new AppError('Room not found', 404);
    }

    // Remove user from room (set roomId to null)
    await campModel.updateMemberAssignment(
      req.user?.id ?? '',
      req.params.id ?? '',
      { roomId: null },
    );

    // Archive user's chat membership (they can still view old messages)
    await chatModel.archiveChatMember(req.user?.id ?? '', roomData.chatId ?? '');

    // Check if anyone else is still in the room and delete if empty
    const chatDeleted = await roomModel.deleteRoomIfEmpty(
      roomId,
      roomData.chatId ?? '',
      req.params.id ?? '', // campId
    );

    // Note: We do NOT remove the user from chatMember when others are in the room
    // They can still view old messages but cannot send new ones or receive new messages

    API_Socket_handleLeaveChat(req.user?.id, roomData.chatId);

    new ApiResponse(200, { chatDeleted }).send(res);
  },
);

/**
 * Endpoint to get all rooms inside a camp the logged in person owns.
 */
export const getCampRooms = getMoreFactory(
  camp,
  {
    campId: camp.id,
    roomName: room.name,
    roomId: room.id,
    roomChat: room.chatId,
    roomJoinCode: room.joinCode,
    roomColor: room.color,
  },
  [
    {
      table: room,
      on: eq(camp.id, room.campId),
      joinType: 'right',
    },
  ],
  [{ field: camp.id, param: 'id' }],
);

/**
 * Endpoint to get a room inside a camp the logged in person is in.
 */
export const getCampRoom = getOneFactory(
  room,
  {
    campId: room.campId,
    roomName: room.name,
    roomId: room.id,
    roomChat: room.chatId,
    roomJoinCode: room.joinCode,
    roomColor: room.color,
    participants: sql`
      COALESCE(
        json_agg(
          json_build_object(
            'id', ${user.id},
            'name', ${user.name},
            'profilePic', ${user.profilePic},
            'phoneNumber', ${user.phoneNumber},
            'emergencyContact', ${user.emergencyContact}
          )
        ) FILTER (WHERE ${user.id} IS NOT NULL AND ${memberToCamp.userId} = ${user.id}),
        '[]'
      )`.as('participants'),
  },
  [
    {
      table: memberToCamp,
      on: eq(room.id, memberToCamp.roomId),
      joinType: 'right',
    },
    {
      table: user,
      on: eq(memberToCamp.userId, user.id),
      joinType: 'left',
    },
  ],
  [
    { field: room.campId, param: 'campId' },
    { field: room.id, param: 'roomId' },
  ],
);
