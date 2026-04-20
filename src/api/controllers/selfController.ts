import type { Request, Response, NextFunction } from 'express';
import {
  db,
  passwordReset,
  token,
  user,
  location,
  camp,
  chat,
  memberToCamp,
  chatMember,
  userPayment,
  payment,
} from '../../db';
import { deleteCampMethod } from './campController';
import catchAsync from '../../utils/catchAsync';
import * as userModel from '../models/userModel';
import * as campModel from '../models/campModel';

import { API_Socket_handleJoinCampRoom } from '../../socket/controllers/campRoomController';
import {
  getMoreFactory,
  getOneFactory,
  updateFactory,
} from '../../utils/factory';
import ApiResponse from '../../utils/ApiResponse';
import AppError from '../../utils/appError';
import { eq, and } from 'drizzle-orm';
import signToken from '../../utils/signToken';

/**
 * Endpoint that returns the details of the logged-in user.
 */
export const getMyAccount = getOneFactory(
  user,
  {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    profilePic: user.profilePic,
    dateOfBirth: user.dateOfBirth,
    emergencyContact: user.emergencyContact,
  },
  [],
  [],
  true,
  user.id,
);

/**
 * Gets all chats the logged in user currently a member of.
 * Implements all the utilities of getMoreFactory.
 */
export const getMyChats = getMoreFactory(
  chatMember,
  {
    chatId: chatMember.chatId,
    lastViewed: chatMember.lastViewed,
    lastMessageAT: chat.lastMessageAt,
  },
  [
    {
      table: chat,
      on: eq(chatMember.chatId, chat.id),
      joinType: 'inner',
    },
  ],
  [],
  true,
  chatMember.userId,
);

/**
 * Gets the payments issued to the logged in user.
 * Implements all the utilities of getMoreFactory.
 */
export const getMyPayments = getMoreFactory(
  userPayment,
  {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    dueDate: payment.dueDate,
    paymentName: payment.name,
    camp: camp.name,
    isPaid: userPayment.isPaid,
  },
  [
    {
      table: payment,
      on: eq(userPayment.paymentId, payment.id),
      joinType: 'inner',
    },
    {
      table: camp,
      on: eq(payment.campId, camp.id),
      joinType: 'left',
    },
  ],
  [],
  true,
  userPayment.userId,
);

/**
 * Gets the payments issued to the logged in user associated with a certain camp.
 * Implements all the utilities of getMoreFactory.
 */
export const getMyCampPayments = getMoreFactory(
  userPayment,
  {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    dueDate: payment.dueDate,
    paymentName: payment.name,
    isPaid: userPayment.isPaid,
  },
  [
    {
      table: payment,
      on: eq(userPayment.paymentId, payment.id),
      joinType: 'inner',
    },
    {
      table: camp,
      on: eq(payment.campId, camp.id),
      joinType: 'left',
    },
  ],
  [{ field: camp.id, param: 'id' }],
  true,
  userPayment.userId,
);

/**
 * Ask for join to a certain camp the user is not currently a member of.
 * The user will only be 'pending'. The owner will have to accept their join.
 */
export const joinCamp = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const _data = await db
      .select({
        id: camp.id,
        chatId: camp.chatId,
        name: camp.name,
        startDate: camp.startDate,
        endDate: camp.endDate,
        minGroupSize: camp.minGroupSize,
        staffChatId: camp.staffChatId,
        joinCode: camp.joinCode,
      })
      .from(camp)
      .where(eq(camp.joinCode, req.params.code ?? ''));
    if (_data.length != 1) {
      throw new AppError('No camp found with the given joinCode', 404);
    } else {
      if (
        await campModel.getMemberData(req.user?.id ?? '', _data[0]?.id ?? '')
      ) {
        throw new AppError('You have already joined this camp!', 400);
      } else {
        await db
          .insert(memberToCamp)
          .values({ userId: req.user?.id, campId: _data[0]?.id });

        API_Socket_handleJoinCampRoom(req.user?.id ?? '', _data[0]?.id ?? '');

        new ApiResponse(201, {
          campId: _data[0]?.id,
          campName: _data[0]?.name,
          startDate: _data[0]?.startDate,
          endDate: _data[0]?.endDate,
          minGroupSize: _data[0]?.minGroupSize,
          chatId: _data[0]?.chatId,
          staffChatId: _data[0]?.staffChatId,
          joinCode: _data[0]?.joinCode,
          type: 'Camp',
          message:
            'Successfully joined camp. Wait for the admin to let you in!',
        }).send(res);
      }
    }
  },
);

/**
 * Updates the account of the logged in user.
 * Implements all utilities given by upfateFactory.
 */
export const updateMyAccount = updateFactory(
  user,
  [
    'name',
    'profilePic',
    'dateOfBirth',
    'emergencyContact',
    'email',
    'phoneNumber',
  ],
  {
    email: async (email: string): Promise<Boolean> => {
      return (
        (await userModel.validateEmail(email)) &&
        (await userModel.isEmailUsed(email))
      );
    },
    phoneNumber: userModel.validatePhoneNumber,
  },
  [],
  false,
  true,
  user.id,
);

/**
 * Deletes the logged in users account.
 * First it deletes all the camps he created and then all data regarding the user.
 * !!!MESSAGES WILL BE KEPT ALSO IN THE CHAT AND THE DATABASE!!!
 */
export const deleteMyAccount = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(
      (
        await db
          .select({ campId: memberToCamp.campId })
          .from(memberToCamp)
          .where(
            and(
              eq(memberToCamp.userId, req.user?.id ?? ''),
              eq(memberToCamp.role, 'Owner'),
            ),
          )
      ).map((x) => deleteCampMethod(x.campId ?? '')),
    );

    await db
      .delete(chatMember)
      .where(eq(chatMember.userId, req.user?.id ?? ''));
    await db
      .delete(memberToCamp)
      .where(eq(memberToCamp.campId, req.user?.id ?? ''));
    await db
      .delete(passwordReset)
      .where(eq(passwordReset.userId, req.user?.id ?? ''));
    await db
      .delete(userPayment)
      .where(eq(userPayment.userId, req.user?.id ?? ''));
    await db.delete(token).where(eq(token.userId, req.user?.id ?? ''));
    await db.delete(user).where(eq(user.id, req.user?.id ?? ''));

    res
      .clearCookie('jwt', {
        httpOnly: true,
        sameSite: 'strict',
      })
      .sendStatus(204);
  },
);

/**
 * Endpoint to change the password of a logged in user. Using the old password for verification. And setting a new Password, also issuing a new JWT for the user.
 */
export const changePassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { oldPassword } = req.body;
    if (!oldPassword)
      throw new AppError('You dont have the required fields specified', 400);

    try {
      if (await userModel.validatePassword(req)) {
        await userModel.passwordEncrypt(req);
      } else {
        throw new AppError("Your new password didn't meet the criteria", 401);
      }
    } catch (err) {
      throw err;
    }

    const originalPassword =
      (
        await db
          .select({ password: user.password })
          .from(user)
          .where(eq(user.id, req.user?.id ?? ''))
      )[0]?.password ?? '';
    if (!originalPassword)
      throw new AppError(
        'Something went wrong with you login. Please try again.',
        401,
      );
    if (await userModel.checkPassword(originalPassword, oldPassword)) {
      await db
        .update(user)
        .set({ password: req.body.password, passwordResetAt: new Date() });
    } else {
      throw new AppError('Your old password is wrong', 401);
    }

    const _token = signToken(req.user?.id ?? '');
    new ApiResponse(202, {
      message: 'Password changed successfully!',
    }).cookieSend(res, 'jwt', _token, {
      expiresIn:
        parseInt(process.env.JWT_EXPIRES_IN as string) * 1000 * 60 * 60 * 24,
      httpOnly: true,
      sameSite: 'strict',
    });
  },
);
