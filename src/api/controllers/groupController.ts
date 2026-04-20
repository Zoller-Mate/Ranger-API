import {
  chatMember,
  db,
  memberToCamp,
  group,
  chat,
  user,
  camp,
  message,
} from '../../db';
import catchAsync from '../../utils/catchAsync';
import type { NextFunction, Request, Response } from 'express';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import {
  API_Socket_handleJoinChat,
  API_Socket_handleLeaveChat,
} from '../../socket/controllers/chatRoomController';
import AppError from '../../utils/appError';
import ApiResponse from '../../utils/ApiResponse';
import validateColor from '../../utils/validateColor';
import * as groupModel from '../models/groupModel';
import * as campModel from '../models/campModel';
import * as chatModel from '../models/chatModel';
import { getMoreFactory, getOneFactory } from '../../utils/factory';

/**
 * Adds the logged in user to the given group and it's chat.
 * His current group will be left. But the chat corresponding to the previous group won't.
 */
export const joinGroup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const groupData = await groupModel.getGroupByJoinCode(
      req.params.code ?? '',
      req.params.id ?? '',
    );

    if (!groupData) {
      throw new AppError(
        'No group found in the camp with the given joinCode',
        404,
      );
    } else {
      const memberData = await campModel.getMemberData(
        req.user?.id ?? '',
        req.params.id ?? '',
      );

      if (memberData?.groupId === groupData.id) {
        throw new AppError('You are already in this group!', 400);
      } else {
        // Get user's current group before updating
        const previousGroupId = memberData?.groupId;

        // Update user's group
        await campModel.updateMemberAssignment(
          req.user?.id ?? '',
          req.params.id ?? '',
          { groupId: groupData.id },
        );

        // Check if previous group is now empty and delete it
        if (previousGroupId) {
          const remainingMembers =
            await groupModel.getRemainingGroupMembers(previousGroupId);

          if (remainingMembers.length === 0) {
            await db.delete(group).where(eq(group.id, previousGroupId));
          }
        }

        // Add user to group chat if not already a member
        const wasAdded = await chatModel.addUserToChatIfNotMember(
          req.user?.id ?? '',
          groupData.chatId ?? '',
        );

        // If user was already a member (possibly archived), unarchive them
        if (!wasAdded) {
          await chatModel.unarchiveChatMember(
            req.user?.id ?? '',
            groupData.chatId ?? '',
          );
        }

        // Get chat last message timestamp
        const lastMessageAt = await chatModel.getChatLastMessage(
          groupData.chatId ?? '',
        );

        // Get all chat members with their lastSeen
        const chatMembers = await chatModel.getChatMembers(
          groupData.chatId ?? '',
        );

        API_Socket_handleJoinChat(req.user?.id, groupData.chatId);

        new ApiResponse(
          201,
          {
            chatId: groupData.chatId,
            name: groupData.name,
            color: groupData.color,
            lastMessageAt: lastMessageAt,
            groupId: groupData.id,
            joinCode: groupData.joinCode,
            type: 'Group',
            chatMembers: chatMembers.map((m) => ({
              userId: m.userId,
              lastSeen: m.lastSeen,
            })),
          },
          'You are successfully joined to the group.',
        ).send(res);
      }
    }
  },
);

/**
 * Endpoint to create a group in a certain camp
 */
export const createGroup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, color, joinCode } = req.body;
    if (!name || !color) throw new AppError('Please provide all data', 400);
    if (!validateColor(color))
      throw new AppError('The color you provided was not valid', 400);
    const chatId = (await db.insert(chat).values({}).returning())[0]?.id;

    if (!chatId) {
      throw new AppError('Failed to create chat for group', 500);
    }

    // Validate or generate join code
    let validatedJoinCode: string;
    if (joinCode) {
      const validated = await groupModel.validateJoinCode(
        joinCode,
        req.params.id ?? '',
      );
      if (!validated) {
        throw new AppError('The join code is invalid or already in use', 400);
      }
      validatedJoinCode = validated;
    } else {
      validatedJoinCode = await groupModel.createJoinCode(req.params.id ?? '');
    }

    const _appData = {
      name,
      campId: req.params.id,
      color,
      chatId,
      joinCode: validatedJoinCode,
    };

    const groupData = await db.insert(group).values(_appData).returning();

    // Get user's current group before updating
    const memberData = await campModel.getMemberData(
      req.user?.id ?? '',
      req.params.id ?? '',
    );
    const previousGroupId = memberData?.groupId;

    // Update user's group to the new one
    await campModel.updateMemberAssignment(
      req.user?.id ?? '',
      req.params.id ?? '',
      { groupId: groupData[0]?.id ?? null },
    );

    // Check if previous group is now empty and delete it if yes
    if (previousGroupId) {
      const remainingMembers =
        await groupModel.getRemainingGroupMembers(previousGroupId);

      if (remainingMembers.length === 0) {
        await db.delete(group).where(eq(group.id, previousGroupId));
      }
    }

    // Get all staff and owner members of this camp to add to group chat
    const staffAndOwners = await campModel.getCampStaffAndOwners(
      req.params.id ?? '',
    );

    // Add current user and all staff/owners to group chat (deduped)
    await chatModel.addUsersToChat(
      chatId,
      [req.user?.id ?? ''],
      staffAndOwners,
    );

    // Get all chat members with their lastSeen
    const chatMembers = await chatModel.getChatMembers(chatId);

    const data = {
      chatId: groupData[0]?.chatId,
      name: groupData[0]?.name,
      color: groupData[0]?.color,
      groupId: groupData[0]?.id,
      joinCode: groupData[0]?.joinCode,
      type: 'Group',
      chatMembers: chatMembers.map((m) => ({
        userId: m.userId,
        lastSeen: m.lastSeen,
      })),
    };

    API_Socket_handleJoinChat(req.user?.id, groupData[0]?.chatId);

    new ApiResponse(201, data).send(res);
  },
);

/**
 * Endpoint to update a group in a certain camp
 */
export const updateGroup = catchAsync(
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
      const validatedJoinCode = await groupModel.validateJoinCode(
        joinCode,
        req.params.id ?? '',
      );
      if (!validatedJoinCode) {
        throw new AppError('The join code is invalid or already in use', 400);
      }
      updateData.joinCode = validatedJoinCode;
    }

    // Update group
    const updatedGroup = await db
      .update(group)
      .set(updateData)
      .where(
        and(
          eq(group.id, req.params.groupId ?? ''),
          eq(group.campId, req.params.id ?? ''),
        ),
      )
      .returning();

    if (updatedGroup.length === 0) {
      throw new AppError('Group not found in this camp', 404);
    }

    const chatId = updatedGroup[0]?.chatId;
    if (!chatId) {
      throw new AppError('Group has no associated chat', 500);
    }

    // Get chat details
    const chatDetails = await chatModel.getChatDetails(
      chatId,
      req.user?.id ?? '',
    );

    // Get all chat members with their lastSeen
    const chatMembers = await chatModel.getChatMembers(chatId);

    new ApiResponse(200, {
      chatId: updatedGroup[0]?.chatId,
      name: updatedGroup[0]?.name,
      color: updatedGroup[0]?.color,
      lastMessageAt: chatDetails.lastMessageAt,
      lastSeenAt: chatDetails.lastSeenAt,
      groupId: updatedGroup[0]?.id,
      joinCode: updatedGroup[0]?.joinCode,
      type: 'Group',
      chatMembers: chatMembers.map((m) => ({
        userId: m.userId,
        lastSeen: m.lastSeen,
      })),
    }).send(res);
  },
);

/**
 * Endpoint to leave a group in a certain camp
 * User will be removed from the group but will remain in the chat (read-only)
 * If the group is empty and has no messages, the chat will be deleted
 */
export const leaveGroup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Check if user is a member of the camp and has a group
    const memberData = await campModel.getMemberData(
      req.user?.id ?? '',
      req.params.id ?? '',
    );

    if (!memberData) {
      throw new AppError('You are not a member of this camp', 404);
    }

    if (!memberData.groupId) {
      throw new AppError('You are not in any group', 400);
    }

    const groupId = memberData.groupId;

    // Get group data to get chatId
    const [groupData] = await db
      .select({ chatId: group.chatId })
      .from(group)
      .where(eq(group.id, groupId));

    if (!groupData || !groupData.chatId) {
      throw new AppError('Group not found', 404);
    }

    // Remove user from group (set groupId to null)
    await campModel.updateMemberAssignment(
      req.user?.id ?? '',
      req.params.id ?? '',
      { groupId: null },
    );

    // Archive user's chat membership (they can still view old messages)
    await chatModel.archiveChatMember(req.user?.id ?? '', groupData.chatId ?? '');

    // Check if anyone else is still in the group and delete if empty
    const chatDeleted = await groupModel.deleteGroupIfEmpty(
      groupId,
      groupData.chatId ?? '',
      req.params.id ?? '', // campId
    );

    // Note: We do NOT remove the user from chatMember when others are in the group
    // They can still view old messages but cannot send new ones or receive new messages

    API_Socket_handleLeaveChat(req.user?.id, groupData.chatId);

    new ApiResponse(200, { chatDeleted }).send(res);
  },
);

/**
 * Endpoint to get all groups inside a camp the logged in person owns.
 */
export const getCampGroups = getMoreFactory(
  camp,
  {
    campId: camp.id,
    groupName: group.name,
    groupId: group.id,
    groupColor: group.color,
    groupJoinCode: group.joinCode,
    groupChat: group.chatId,
  },
  [
    {
      table: group,
      on: eq(camp.id, group.campId),
      joinType: 'left',
    },
  ],
  [{ field: camp.id, param: 'id' }],
);

/**
 * Endpoint to get a group inside a camp the logged in person is in.
 */
export const getCampGroup = getOneFactory(
  group,
  {
    groupName: group.name,
    groupId: group.id,
    groupColor: group.color,
    groupJoinCode: group.joinCode,
    groupChat: group.chatId,
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
      on: eq(group.id, memberToCamp.groupId),
      joinType: 'right',
    },
    {
      table: user,
      on: eq(memberToCamp.userId, user.id),
      joinType: 'left',
    },
  ],
  [
    { field: group.campId, param: 'campId' },
    { field: group.id, param: 'groupId' },
  ],
);
