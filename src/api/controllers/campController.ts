import type { Request, Response, NextFunction } from 'express';
import {
  db,
  user,
  camp,
  memberToCamp,
  group,
  room,
  chat,
  userPayment,
  payment,
  location,
  chatMember,
  message,
} from '../../db';
import catchAsync from '../../utils/catchAsync';
import * as campModel from '../models/campModel';
import * as roomModel from '../models/roomModel';
import * as groupModel from '../models/groupModel';
import * as chatModel from '../models/chatModel';
import { Chat } from '../models/chatModel';

import {
  getMoreFactory,
  getOneFactory,
  updateFactory,
} from '../../utils/factory';
import ApiResponse from '../../utils/ApiResponse';
import { eq, sql, and, or, isNull, inArray } from 'drizzle-orm';
import AppError from '../../utils/appError';
import FieldError from '../../utils/FieldError';

import {
  API_Socket_handleJoinChat,
  API_Socket_handleLeaveChat,
} from '../../socket/controllers/chatRoomController';
import { API_Socket_handleLocationUpdate } from '../../socket/controllers/locationController';
import {
  API_Socket_handleJoinCampRoom,
  API_Socket_handleLeaveCampRoom,
  API_Socket_handleJoinStaffRoom,
  API_Socket_handleLeaveStaffRoom,
} from '../../socket/controllers/campRoomController';
import { API_Socket_handleLeaveGroup } from '../../socket/controllers/groupRoomController';

/**
 * Deletes a camp with all it's regarding resources.
 * @param campId the id of the camp that should be deleted
 */
export const deleteCampMethod = async (campId: string) => {
  try {
    const [_groups, _rooms, _payments, _camp] = await Promise.all([
      db
        .select({ id: group.id, chatId: group.chatId })
        .from(group)
        .where(eq(group.campId, campId)),
      db
        .select({ id: room.id, chatId: room.chatId })
        .from(room)
        .where(eq(room.campId, campId)),
      db
        .select({ id: payment.id })
        .from(payment)
        .where(eq(payment.campId, campId)),
      db
        .select({
          id: camp.id,
          chatId: camp.chatId,
          staffChatId: camp.staffChatId,
        })
        .from(camp)
        .where(eq(camp.id, campId)),
    ]);
    if (_camp.length != 1)
      throw new AppError("Couldn't find the camp you're trying to delete", 400);

    const _chats = [
      _camp[0]?.chatId,
      _camp[0]?.staffChatId,
      ..._rooms.map((x) => x.chatId),
      ..._groups.map((x) => x.chatId),
    ].filter((id): id is string => id !== null && id !== undefined);

    // Step 1: Delete messages, chatMembers, userPayments, and QR code
    await Promise.all([
      campModel.deleteJoinQrCode(campId),
      _chats.length > 0
        ? db
            .delete(message)
            .where(or(..._chats.map((x) => eq(message.chatId, x))))
        : Promise.resolve(),
      _payments.length > 0
        ? db
            .delete(userPayment)
            .where(or(..._payments.map((x) => eq(userPayment.paymentId, x.id))))
        : Promise.resolve(),
      _chats.length > 0
        ? db
            .delete(chatMember)
            .where(or(..._chats.map((x) => eq(chatMember.chatId, x))))
        : Promise.resolve(),
    ]);

    // Step 2: Delete location and memberToCamp (must happen before deleting groups/rooms)
    await Promise.all([
      db.delete(location).where(eq(location.campId, campId)),
      db.delete(memberToCamp).where(eq(memberToCamp.campId, campId)),
    ]);

    // Step 3: Delete payments, rooms, and groups
    await Promise.all([
      _payments.length > 0
        ? db
            .delete(payment)
            .where(or(..._payments.map((x) => eq(payment.id, x.id))))
        : Promise.resolve(),
      _rooms.length > 0
        ? db.delete(room).where(or(..._rooms.map((x) => eq(room.id, x.id))))
        : Promise.resolve(),
      _groups.length > 0
        ? db.delete(group).where(or(..._groups.map((x) => eq(group.id, x.id))))
        : Promise.resolve(),
    ]);

    // Step 4: Delete camp
    await db.delete(camp).where(eq(camp.id, campId));

    // Step 5: Delete chats
    if (_chats.length > 0) {
      await db.delete(chat).where(or(..._chats.map((x) => eq(chat.id, x))));
    }
  } catch (err) {
    throw err;
  }
};

/**
 * Fully removes a user from a camp with all related DB and socket cleanup.
 * No read-only access remains after this operation.
 */
export const removeMemberFromCampFlow = async (
  userId: string,
  campId: string,
): Promise<{ roomChatDeleted: boolean; groupChatDeleted: boolean }> => {
  if (!userId || !campId) {
    throw new AppError('Missing user or camp information', 400);
  }

  // Snapshot membership and camp chat ids before any deletion.
  const memberData = await campModel.getMemberData(userId, campId);
  if (!memberData) {
    throw new AppError('You are not a member of this camp', 404);
  }

  const { role, roomId, groupId } = memberData;

  const campChatIds = await campModel.getCampChatIds(campId);
  if (!campChatIds) {
    throw new AppError('Camp not found', 404);
  }

  let roomChatId: string | null = null;
  let groupChatId: string | null = null;

  if (roomId) {
    const [roomData] = await db
      .select({ chatId: room.chatId })
      .from(room)
      .where(eq(room.id, roomId));
    roomChatId = roomData?.chatId ?? null;
  }

  if (groupId) {
    const [groupData] = await db
      .select({ chatId: group.chatId })
      .from(group)
      .where(eq(group.id, groupId));
    groupChatId = groupData?.chatId ?? null;
  }

  // Remove chat membership from EVERY chat in this camp.
  const campRoomChats = await campModel.getCampRoomChatIds(campId);
  const campGroupChats = await campModel.getCampGroupChatIds(campId);

  const allCampChatIds = new Set<string>();
  if (campChatIds.chatId) allCampChatIds.add(campChatIds.chatId);
  if (campChatIds.staffChatId) allCampChatIds.add(campChatIds.staffChatId);
  campRoomChats.forEach((r) => {
    if (r.chatId) allCampChatIds.add(r.chatId);
  });
  campGroupChats.forEach((g) => {
    if (g.chatId) allCampChatIds.add(g.chatId);
  });

  const allCampChatIdsArray = Array.from(allCampChatIds);

  // DB cleanup
  await Promise.all([
    db
      .delete(location)
      .where(and(eq(location.userId, userId), eq(location.campId, campId))),

    allCampChatIdsArray.length > 0
      ? db
          .delete(chatMember)
          .where(
            and(
              eq(chatMember.userId, userId),
              inArray(chatMember.chatId, allCampChatIdsArray),
            ),
          )
      : Promise.resolve(),

    campModel.removeMemberFromCamp(userId, campId),
  ]);

  let roomChatDeleted = false;
  let groupChatDeleted = false;

  if (roomId && roomChatId) {
    roomChatDeleted = await roomModel.deleteRoomIfEmpty(
      roomId,
      roomChatId,
      campId,
    );
  }

  if (groupId && groupChatId) {
    groupChatDeleted = await groupModel.deleteGroupIfEmpty(
      groupId,
      groupChatId,
      campId,
    );
  }

  // Socket cleanup after DB changes
  await Promise.all([
    API_Socket_handleLeaveCampRoom(userId, campId),

    role === 'Staff' || role === 'Owner'
      ? API_Socket_handleLeaveStaffRoom(userId, campId)
      : Promise.resolve(),

    ...allCampChatIdsArray.map((chatId) =>
      API_Socket_handleLeaveChat(userId, chatId),
    ),

    groupId ? API_Socket_handleLeaveGroup(userId, groupId) : Promise.resolve(),
  ]);

  return { roomChatDeleted, groupChatDeleted };
};

/**
 * Endpoint that returns all the camps the logged-in user is a member of
 */
export const getMyCamps = getMoreFactory(
  memberToCamp,
  {
    role: memberToCamp.role,
    campId: camp.id,
    campName: camp.name,
    startDate: camp.startDate,
    endDate: camp.endDate,
    campChatId: camp.chatId,
    staffChatId: camp.staffChatId,
    joinCode: camp.joinCode,
  },
  [
    {
      table: camp,
      on: eq(memberToCamp.campId, camp.id),
      joinType: 'left',
    },
    {
      table: user,
      on: eq(memberToCamp.userId, user.id),
      joinType: 'left',
    },
  ],
  [],
  true,
  memberToCamp.userId,
);

/**
 * Gets all the camps corresponding to the logged-in user.
 * Implements all the utilities of getMoreFactory.
 */
export const getMyCamp = getOneFactory(
  memberToCamp,
  {
    role: memberToCamp.role,
    campId: camp.id,
    campName: camp.name,
    startDate: camp.startDate,
    endDate: camp.endDate,
    minGroupSize: camp.minGroupSize,
    campChatId: camp.chatId,
    staffChatId: camp.staffChatId,
    joinCode: camp.joinCode,
  },
  [
    {
      table: camp,
      on: eq(memberToCamp.campId, camp.id),
      joinType: 'left',
    },
  ],
  [{ field: camp.id, param: 'id' }],
  true,
  memberToCamp.userId,
);

/**
 * Endpoint ot get the data about the owner of the camp.
 */
export const getCampOwner = getOneFactory(
  memberToCamp,
  {
    name: user.name,
    email: user.email,
    phone: user.phoneNumber,
    profilePic: user.profilePic,
  },
  [
    {
      table: user,
      on: eq(memberToCamp.userId, user.id),
      joinType: 'left',
    },
  ],
  [
    { field: memberToCamp.campId, param: 'id' },
    { field: memberToCamp.role, value: 'Owner' },
  ],
);

/**
 * Endpoint to update user's location while app is in background
 */
export const updateLocation = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const campId = req.params.id ?? '';
    const userId = req.user?.id ?? '';
    const { latitude, longitude } = req.body ?? {};

    if (!userId) {
      throw new AppError('Missing user information', 401);
    }

    if (!campId) {
      throw new AppError('Missing camp information', 400);
    }

    // Validate coordinates (same rules as socket)
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new AppError('Invalid coordinates', 400);
    }

    // Ensure user is member of the camp
    const membership = await campModel.getMemberData(userId, campId);

    if (!membership) {
      throw new AppError('You are not a member of this camp', 403);
    }

    await db
      .insert(location)
      .values({
        userId,
        campId,
        latitude,
        longitude,
        lastUpdated: new Date(),
      })
      .onConflictDoUpdate({
        target: location.userId,
        set: {
          campId,
          latitude,
          longitude,
          lastUpdated: new Date(),
        },
      });

    await API_Socket_handleLocationUpdate(userId, latitude, longitude);

    new ApiResponse(200, 'Location updated').send(res);
  },
);

/**
 * Endpoint to get all the users and their roles from a camp the user is a part of
 */
export const getCampUsers = getMoreFactory(
  memberToCamp,
  {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    emergencyContact: user.emergencyContact,
    dateOfBirth: user.dateOfBirth,
    profilePicture: user.profilePic,
    role: memberToCamp.role,
    roomId: memberToCamp.roomId,
    groupId: memberToCamp.groupId,
    payments: sql`
      COALESCE(
        json_agg(
          json_build_object(
            'id', ${payment.id},
            'name', ${payment.name},
            'dueDate', ${payment.dueDate},
            'amount', ${payment.amount},
            'currency', ${payment.currency},
            'isPaid', ${userPayment.isPaid}
          )
        ) FILTER (WHERE ${payment.id} IS NOT NULL AND ${userPayment.userId} = ${user.id} ),
        '[]'
      )`.as('payments'),
  },
  [
    {
      table: user,
      on: eq(memberToCamp.userId, user.id),
      joinType: 'left',
    },
    {
      table: payment,
      on: eq(memberToCamp.campId, payment.campId),
      joinType: 'left',
    },
    {
      table: userPayment,
      on: eq(payment.id, userPayment.paymentId),
      joinType: 'left',
    },
  ],
  [{ field: memberToCamp.campId, param: 'id' }],
);

/**
 * Endpoint to get a certain user and their data regarding a camp the logged-in user owns
 */
export const getCampUser = getOneFactory(
  memberToCamp,
  {
    userId: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    emergencyContact: user.emergencyContact,
    dateOfBirth: user.dateOfBirth,
    profilePicture: user.profilePic,
    role: memberToCamp.role,
    roomId: memberToCamp.roomId,
    groupId: memberToCamp.groupId,
    payments: sql`
      COALESCE(
        json_agg(
          json_build_object(
            'id', ${payment.id},
            'name', ${payment.name},
            'dueDate', ${payment.dueDate},
            'amount', ${payment.amount},
            'currency', ${payment.currency},
            'isPaid', ${userPayment.isPaid}
          )
        ) FILTER (WHERE ${payment.id} IS NOT NULL AND ${userPayment.userId} = ${user.id} ),
        '[]'
      )`.as('payments'),
  },
  [
    {
      table: user,
      on: eq(memberToCamp.userId, user.id),
      joinType: 'left',
    },
    {
      table: payment,
      on: eq(memberToCamp.campId, payment.campId),
      joinType: 'left',
    },
    {
      table: userPayment,
      on: eq(payment.id, userPayment.paymentId),
      joinType: 'left',
    },
  ],
  [
    { field: memberToCamp.campId, param: 'campId' },
    { field: memberToCamp.userId, param: 'userId' },
  ],
);

/**
 * Endpoint to change a user's role to either staff or camper.
 */
export const changeUserRole = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { role } = req.body;
    if (!role) throw new AppError('Please provide a role', 400);

    const campChatIds = await campModel.getCampChatIds(req.params.campId ?? '');

    if (!campChatIds || !campChatIds.staffChatId || !campChatIds.chatId) {
      throw new AppError('The camp id was not valid', 400);
    }

    const { staffChatId, chatId } = campChatIds;

    const memberData = await campModel.getMemberData(
      req.params.userId ?? '',
      req.params.campId ?? '',
    );
    const previousRole = memberData?.role || null;

    if (previousRole == 'Pending')
      await chatModel.addUserToChatIfNotMember(req.params.userId ?? '', chatId);

    // Promote to Staff (from Camper or Pending)
    if (role == 'Staff' && previousRole != 'Staff') {
      await chatModel.addUserToChatIfNotMember(
        req.params.userId ?? '',
        staffChatId,
      );
      await db
        .delete(userPayment)
        .where(eq(userPayment.userId, req.params.userId ?? ''));

      // Get all room and group chat IDs in this camp
      const allRooms = await campModel.getCampRoomChatIds(
        req.params.campId ?? '',
      );
      const allGroups = await campModel.getCampGroupChatIds(
        req.params.campId ?? '',
      );

      const allChatIds = [
        ...allRooms.map((r) => r.chatId).filter(Boolean),
        ...allGroups.map((g) => g.chatId).filter(Boolean),
      ];

      // Add user to all room and group chats (with deduplication)
      if (allChatIds.length > 0) {
        await db
          .insert(chatMember)
          .values(
            allChatIds.map((chatId) => ({
              chatId: chatId!,
              userId: req.params.userId ?? '',
            })),
          )
          .onConflictDoNothing({
            target: [chatMember.userId, chatMember.chatId],
          });

        // Socket join for all room and group chats
        for (const chatId of allChatIds) {
          API_Socket_handleJoinChat(req.params.userId ?? '', chatId!);
        }
      }

      API_Socket_handleJoinChat(req.params.userId ?? '', chatId);
      API_Socket_handleJoinChat(req.params.userId ?? '', staffChatId);
      API_Socket_handleJoinStaffRoom(
        req.params.userId ?? '',
        req.params.campId ?? '',
      );
    }
    // Demote to Camper (from Staff)
    else if (role == 'Camper' && previousRole == 'Staff') {
      // Remove from staff chat
      await Chat.removeMember(staffChatId, req.params.userId ?? '');

      // Get all room and group chat IDs in this camp
      const allRooms = await campModel.getCampRoomChatIds(
        req.params.campId ?? '',
      );
      const allGroups = await campModel.getCampGroupChatIds(
        req.params.campId ?? '',
      );

      // Remove from all room chats EXCEPT the room they are currently in
      for (const roomData of allRooms) {
        if (roomData.chatId && roomData.roomId !== memberData?.roomId) {
          await Chat.removeMember(roomData.chatId, req.params.userId ?? '');
          API_Socket_handleLeaveChat(req.params.userId ?? '', roomData.chatId);
        }
      }

      // Remove from all group chats EXCEPT the group they are currently in
      for (const groupData of allGroups) {
        if (groupData.chatId && groupData.groupId !== memberData?.groupId) {
          await Chat.removeMember(groupData.chatId, req.params.userId ?? '');
          API_Socket_handleLeaveChat(req.params.userId ?? '', groupData.chatId);
        }
      }

      API_Socket_handleLeaveChat(req.params.userId ?? '', staffChatId);
      API_Socket_handleLeaveStaffRoom(
        req.params.userId ?? '',
        req.params.campId ?? '',
      );

      await campModel.assignCamperPayments(
        req.params.userId ?? '',
        req.params.campId ?? '',
      );
    }
    // Approve Pending to Camper
    else if (role == 'Camper' && previousRole == 'Pending') {
      API_Socket_handleJoinChat(req.params.userId ?? '', chatId);

      await campModel.assignCamperPayments(
        req.params.userId ?? '',
        req.params.campId ?? '',
      );
    } else {
      throw new AppError('Please provide a valid role for update', 400);
    }

    await db
      .update(memberToCamp)
      .set({ role })
      .where(
        and(
          eq(memberToCamp.campId, req.params.campId ?? ''),
          eq(memberToCamp.userId, req.params.userId ?? ''),
        ),
      );

    new ApiResponse(202, 'The user has been updated').send(res);
  },
);

/**
 * Endpoint to create a camp owned by the logged-in user.
 */
export const createCamp = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, startDate, endDate, minGroupSize } = req.body;
    if (!name || !startDate || !endDate)
      throw new AppError('Please provide all data', 400);
    const chatId = (await db.insert(chat).values({}).returning())[0]?.id;
    const staffChatId = (await db.insert(chat).values({}).returning())[0]?.id;

    let joinCode: string;
    if (req.body.joinCode) {
      const isValid = await campModel.validateJoinCode(req.body.joinCode);
      if (!isValid) {
        throw new FieldError(
          'The join code is invalid or already in use',
          400,
          [
            {
              field: 'joinCode',
              message:
                'The join code must be a 6-12 long string that is not in use.',
            },
          ],
        );
      }
      joinCode = req.body.joinCode;
    } else {
      joinCode = await campModel.createJoinCode();
    }

    if ((minGroupSize ?? 1) <= 0) {
      throw new FieldError('Minimum group size is invalid', 400, [
        { field: 'minGroupSize', message: 'Please choose a natural number.' },
      ]);
    }

    const _appData = {
      name,
      startDate,
      endDate,
      minGroupSize: minGroupSize ?? 1,
      chatId,
      staffChatId,
      joinCode,
    };
    const data = await db.insert(camp).values(_appData).returning();
    try {
      await campModel.generateJoinQrCode(_appData.joinCode, data[0]?.id);
    } catch (err) {
      throw new AppError('The QRCode generation went wrong', 500);
    }
    await db
      .insert(memberToCamp)
      .values({ userId: req.user?.id, campId: data[0]?.id, role: 'Owner' });
    await db.insert(chatMember).values([
      { userId: req.user?.id ?? '', chatId: chatId ?? '' },
      { userId: req.user?.id ?? '', chatId: staffChatId ?? '' },
    ]);

    API_Socket_handleJoinChat(req.user?.id, chatId);
    API_Socket_handleJoinCampRoom(req.user?.id ?? '', data[0]?.id ?? '');
    API_Socket_handleJoinStaffRoom(req.user?.id ?? '', data[0]?.id ?? '');
    new ApiResponse(201, data).send(res);
  },
);

/**
 * Endpoint to update data from a camp that is owned by the-logged in user
 */
export const updateCamp = updateFactory(
  camp,
  ['name', 'startDate', 'endDate', 'minGroupSize', 'joinCode'],
  { joinCode: campModel.validateJoinCode },
  [{ field: camp.id, param: 'id' }],
  true,
);

/**
 * If the camp's join code was updated this endpoint will generate a new QRcode for the camp with the new joinCode.
 */
export const updateJoinQRCode = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    await campModel.generateJoinQrCode(
      req.createdData.joinCode ?? '',
      req.createdData.id ?? '',
    );
    new ApiResponse(202, req.createdData).send(res);
  },
);

/**
 * Endpoint to delete the camp owned by the user
 */
export const deleteCamp = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    console.log(req.params.id, 'c1ac13e9-4e1e-47a0-b065-f3b228631be6');
    await deleteCampMethod(req.params.id ?? '');
    new ApiResponse(204, 'The camp has been deletes successfully').send(res);
  },
);

/**
 * Leaves a camp the user is currently a part of
 */
export const leaveCamp = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id ?? '';
    const campId = req.params.id ?? '';

    const { roomChatDeleted, groupChatDeleted } =
      await removeMemberFromCampFlow(userId, campId);

    new ApiResponse(200, {
      message: 'Left camp successfully',
      roomChatDeleted,
      groupChatDeleted,
    }).send(res);
  },
);

/**
 * Endpoint to add a paymnet to a camp the user owns
 */
export const addPaymentToCamp = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, amount, dueDate, currency } = req.body;
    if (!name || !amount || !dueDate || !currency)
      throw new AppError('Please provide all needed information', 400);
    if (!campModel.validateCurrency(currency))
      throw new AppError('Please provide a valid currency code', 400);
    const paymentId =
      (
        await db
          .insert(payment)
          .values({
            campId: req.params.id ?? '',
            name,
            amount,
            dueDate,
            currency,
          })
          .returning()
      )[0]?.id ?? '';
    if (paymentId == '')
      throw new AppError(
        'Something went wrong during the creation of the payment',
        500,
      );
    const _users = await campModel.getCampCamperIds(req.params.id ?? '');
    if (_users.length > 0)
      await db.insert(userPayment).values([
        ..._users.map((x) => {
          return { userId: x?.id ?? '', paymentId };
        }),
      ]);
    new ApiResponse(201, 'Payment added').send(res);
  },
);

/**
 * Endpoint that returns all the payments regarding the camp the logged-in user owns.
 */
export const getCampPayments = getMoreFactory(
  payment,
  {
    id: payment.id,
    name: payment.name,
    dueDate: payment.dueDate,
    amount: payment.amount,
    currency: payment.currency,
  },
  [],
  [{ field: payment.campId, param: 'id' }],
);

/**
 * Endpoint that updates a payment regarding the camp the logged-in user owns.
 */
export const updatePayment = updateFactory(
  payment,
  ['name', 'dueDate', 'amount', 'currency'],
  { currency: campModel.validateCurrency },
  [
    { field: payment.campId, param: 'campId' },
    { field: payment.id, param: 'paymentId' },
  ],
);

/**
 * Endpoint that deletes a payment regarding the camp the logged-in user owns.
 */
export const deletePayment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    await db
      .delete(userPayment)
      .where(eq(userPayment.paymentId, req.params.paymentId ?? ''));
    await db.delete(payment).where(eq(payment.id, req.params.paymentId ?? ''));
    new ApiResponse(204, 'Payment successfully deleted').send(res);
  },
);

/**
 * Returns the URL of the QR code to join a certain camp.
 */
export const getJoinQRCode = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    new ApiResponse(
      200,
      `${process.env.URL}/qrCodes/${req.params.id}.png`,
    ).send(res);
  },
);

/**
 * Endpoint to end a group in a certain camp
 * Any member of the group can end it - all members will be removed from the group
 * All members remain in the chat (read-only mode)
 *
export const endGroup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Check if user is a member of the camp and has a group
    const memberData = await db
      .select({ groupId: memberToCamp.groupId })
      .from(memberToCamp)
      .where(
        and(
          eq(memberToCamp.userId, req.user?.id ?? ''),
          eq(memberToCamp.campId, req.params.id ?? ''),
        ),
      );

    if (memberData.length === 0) {
      throw new AppError('You are not a member of this camp', 404);
    }

    if (!memberData[0]?.groupId) {
      throw new AppError('You are not in any group', 400);
    }

    const groupId = memberData[0].groupId;

    // Remove ALL users from this group (set groupId to null for all members)
    await db
      .update(memberToCamp)
      .set({ groupId: null })
      .where(eq(memberToCamp.groupId, groupId));

    // Delete the group entity
    await db.delete(group).where(eq(group.id, groupId));

    // Note: We do NOT remove users from chatMember
    // All members can still view old messages but cannot send/receive new ones

    new ApiResponse(200, 'Group has been ended successfully').send(res);
  },
); */

/**
 * Endpoint to leave a chat permanently
 * User will be removed from chatMember and cannot view messages anymore
 * If the chat has no remaining members and no messages, it will be deleted
 * This is used when user wants to completely leave a chat (after leaving room/group)
 * Cannot leave: current camp chat, current staff chat, current room chat, or current group chat
 */
export const leaveChat = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const chatId = req.params.chatId;
    const campId = req.params.id;
    const userId = req.user?.id;

    if (!userId || !chatId || !campId) {
      throw new AppError('Missing chat data.', 400);
    }

    // Get camp data
    const campChatIds = await campModel.getCampChatIds(campId);

    if (!campChatIds) {
      throw new AppError('Camp not found', 404);
    }

    // Get user's current memberships
    const memberData = await campModel.getMemberData(userId, campId);

    if (!memberData || !memberData.role) {
      throw new AppError('You are not a member of this camp', 404);
    }

    // Prevent leaving current camp main chat
    if (chatId === campChatIds.chatId) {
      throw new AppError('You cannot leave the main camp chat', 400);
    }

    // Prevent leaving current staff chat (if staff/owner)
    if (
      chatId === campChatIds.staffChatId &&
      (memberData.role === 'Staff' || memberData.role === 'Owner')
    ) {
      throw new AppError(
        'You cannot leave the staff chat while you are staff/owner',
        400,
      );
    }

    // Check if chat belongs to current room
    if (memberData.roomId) {
      const [currentRoom] = await db
        .select({ chatId: room.chatId })
        .from(room)
        .where(eq(room.id, memberData.roomId));

      if (currentRoom?.chatId === chatId) {
        throw new AppError(
          'You cannot leave your current room chat. Leave the room first.',
          400,
        );
      }
    }

    // Check if chat belongs to current group
    if (memberData.groupId) {
      const [currentGroup] = await db
        .select({ chatId: group.chatId })
        .from(group)
        .where(eq(group.id, memberData.groupId));

      if (currentGroup?.chatId === chatId) {
        throw new AppError(
          'You cannot leave your current group chat. Leave the group first.',
          400,
        );
      }
    }

    // Remove user from chatMember (they can no longer view messages)
    const deleted = await db
      .delete(chatMember)
      .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
      .returning();

    // If no rows were deleted, user was not a member
    if (deleted.length === 0) {
      throw new AppError('You are not a member of this chat', 404);
    }

    let chatDeleted = false;

    // Check if there are any remaining chat members
    const remainingMembersResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatMember)
      .where(eq(chatMember.chatId, chatId));

    const remainingMembersCount = remainingMembersResult[0]?.count ?? 0;

    // If no members left, check if chat has messages
    if (remainingMembersCount === 0) {
      // Check if there are any non-deleted messages in the chat
      const messageCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(message)
        .where(and(eq(message.chatId, chatId), isNull(message.deletedAt)));

      const messageCount = messageCountResult[0]?.count ?? 0;

      // If no messages, delete the chat as well
      if (Number(messageCount) === 0) {
        await db.delete(chat).where(eq(chat.id, chatId));
        chatDeleted = true;
      }
    }

    new ApiResponse(200, { chatDeleted }).send(res);
  },
);
