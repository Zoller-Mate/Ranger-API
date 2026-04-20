import type { Request, Response, NextFunction } from 'express';
import { db, memberToCamp, userPayment, payment } from '../../db';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/ApiResponse';
import { eq, and, or } from 'drizzle-orm';
import AppError from '../../utils/appError';
import { removeMemberFromCampFlow } from './campController';

/**
 * Endpoint that sets a payment of a user for a certain payment regarding a camp owned by the logged-in user either paid or unpaid.
 */
export const setPayment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      switch (req.body.state) {
        case 'paid':
          await db
            .update(userPayment)
            .set({ isPaid: true })
            .where(
              and(
                eq(userPayment.paymentId, req.params.paymentId ?? ''),
                eq(userPayment.userId, req.params.userId ?? ''),
              ),
            );
          break;
        case 'unpaid':
          await db
            .update(userPayment)
            .set({ isPaid: false })
            .where(
              and(
                eq(userPayment.paymentId, req.params.paymentId ?? ''),
                eq(userPayment.userId, req.params.userId ?? ''),
              ),
            );
          break;
        default:
          throw new AppError(
            'Give a valid state for the payment ("paid"/"unpaid")',
            400,
          );
          break;
      }
    } catch (err) {
      throw err;
    }
    new ApiResponse(202, 'Payment updated successfuly.').send(res);
  },
);

/**
 * Endpoint to remove a user from a camp owned by the logged-in user
 */
export const removeUserFromCamp = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const actorId = req.user?.id ?? '';
    const targetUserId = req.params.userId ?? '';
    const campId = req.params.campId ?? '';

    if (!actorId || !targetUserId || !campId) {
      throw new AppError('Missing required user or camp information', 400);
    }

    if (actorId === targetUserId) {
      throw new AppError('Owner cannot remove themselves from the camp', 403);
    }

    const { roomChatDeleted, groupChatDeleted } =
      await removeMemberFromCampFlow(targetUserId, campId);

    new ApiResponse(200, {
      message: 'Participant removed successfully.',
      roomChatDeleted,
      groupChatDeleted,
    }).send(res);
  },
);
