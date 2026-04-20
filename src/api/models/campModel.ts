import {
  db,
  camp,
  memberToCamp,
  payment,
  userPayment,
  room,
  group,
} from '../../db/index';
import { eq, and, or, sql } from 'drizzle-orm';
import validateCurrencyCode from 'validate-currency-code';
import { promisify } from 'util';
import { exists } from 'node:fs';
import { unlink } from 'fs/promises';
import { toFile } from 'qrcode';
import { join } from 'path';
import AppError from '../../utils/appError';

export const getCampIdFromJoinCode = async (
  joinCode: string,
): Promise<string> => {
  try {
    return (
      (
        await db
          .select({ id: camp.id })
          .from(camp)
          .where(eq(camp.joinCode, joinCode))
      )[0]?.id ?? ''
    );
  } catch (err) {
    throw new AppError("Couldn't find a camp for the join code", 400);
  }
};

export const validateJoinCode = async (joinCode: string): Promise<boolean> => {
  try {
    joinCode = joinCode.split('-').join('').toUpperCase();
    if (joinCode.length > 12 || joinCode.length < 6) return false;

    // Check if code exists in ANY camp globally
    const _camp = await db
      .select({ id: camp.id })
      .from(camp)
      .where(eq(camp.joinCode, joinCode));

    return _camp.length == 0;
  } catch (err) {
    throw new AppError("Couldn't validate join code", 400);
  }
};

export const createJoinCode = async (): Promise<string> => {
  let code: string;
  do {
    code = `${Math.floor(Math.random() * 1000000000000)}`;
  } while (!(await validateJoinCode(code)));
  return code;
};

export const validateCurrency = (currency: string): boolean => {
  return validateCurrencyCode(currency);
};

export const generateJoinQrCode = async (
  _joinCode: string,
  _campId?: string,
): Promise<boolean> => {
  try {
    const campId = _campId ?? (await getCampIdFromJoinCode(_joinCode));
    await deleteJoinQrCode(campId);
    await new Promise<void>((resolve, reject) => {
      toFile(
        join(__dirname, `../../images/qrCodes/${campId}.png`),
        `${process.env.URL}/joinCamp/${_joinCode}`,
        {
        width: 300,
          margin: 2,
          errorCorrectionLevel: 'L',
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  } catch (err) {
    throw new AppError("Couldn't generate the QR code", 500);
  }
  return true;
};

export const deleteJoinQrCode = async (id: string): Promise<void> => {
  try {
    if (
      await promisify(exists)(join(__dirname, `../../images/qrCodes/${id}.png`))
    )
      await unlink(join(__dirname, `../../images/qrCodes/${id}.png`));
  } catch (error) {
    throw new AppError("Couldn't delete the QR code", 500);
  }
};

/**
 * Gets member data for a user in a specific camp.
 * @param userId The user's ID
 * @param campId The camp's ID
 * @returns Member data including role, groupId, roomId, campId
 */
export const getMemberData = async (
  userId: string,
  campId: string,
): Promise<{
  role?: string | null;
  groupId?: string | null;
  roomId?: string | null;
  campId?: string | null;
} | null> => {
  try{
    const result = await db
      .select({
        role: memberToCamp.role,
        groupId: memberToCamp.groupId,
        roomId: memberToCamp.roomId,
        campId: memberToCamp.campId,
      })
      .from(memberToCamp)
      .where(
        and(eq(memberToCamp.userId, userId), eq(memberToCamp.campId, campId)),
      )
      .limit(1);

    return result[0] ?? null;
  } catch(error) {
    throw new AppError("No camp was found with this ID", 404)
  }
};

/**
 * Gets all payment IDs for a specific camp.
 * @param campId The camp's ID
 * @returns Array of payment IDs
 */
export const getCampPaymentIds = async (
  campId: string,
): Promise<Array<{ id: string }>> => {
  return await db
    .select({ id: payment.id })
    .from(payment)
    .where(eq(payment.campId, campId));
};

/**
 * Gets payment conditions for filtering user payments by camp.
 * @param campId The camp's ID
 * @returns Array of drizzle conditions for userPayment queries
 */
export const getCampPaymentConditions = async (campId: string) => {
  const payments = await getCampPaymentIds(campId);
  return payments.map((x) => eq(userPayment.paymentId, x.id));
};

/**
 * Gets all staff and owner members of a specific camp.
 * @param campId The camp's ID
 * @returns Array of user IDs
 */
export const getCampStaffAndOwners = async (
  campId: string,
): Promise<Array<{ userId: string | null }>> => {
  return await db
    .select({ userId: memberToCamp.userId })
    .from(memberToCamp)
    .where(
      and(
        eq(memberToCamp.campId, campId),
        or(eq(memberToCamp.role, 'Staff'), eq(memberToCamp.role, 'Owner')),
      ),
    );
};

/**
 * Removes a user from a camp and deletes their payment associations.
 * @param userId The user's ID
 * @param campId The camp's ID
 */
export const removeMemberFromCamp = async (
  userId: string,
  campId: string,
): Promise<void> => {
  const payments = await getCampPaymentConditions(campId);

  if (payments.length > 0) {
    await db
      .delete(userPayment)
      .where(and(eq(userPayment.userId, userId), or(...payments)));
  }

  await db
    .delete(memberToCamp)
    .where(
      and(eq(memberToCamp.userId, userId), eq(memberToCamp.campId, campId)),
    );
};

/**
 * Gets camp chat IDs (main chat and staff chat).
 * @param campId The camp's ID
 * @returns Object with chatId and staffChatId, or null if camp not found
 */
export const getCampChatIds = async (
  campId: string,
): Promise<{ chatId: string | null; staffChatId: string | null } | null> => {
  const [result] = await db
    .select({ staffChatId: camp.staffChatId, chatId: camp.chatId })
    .from(camp)
    .where(eq(camp.id, campId))
    .limit(1);

  return result || null;
};

/**
 * Updates a member's room or group assignment in a camp.
 * @param userId The user's ID
 * @param campId The camp's ID
 * @param assignment Object with roomId or groupId to update
 */
export const updateMemberAssignment = async (
  userId: string,
  campId: string,
  assignment: { roomId?: string | null; groupId?: string | null },
): Promise<void> => {
  await db
    .update(memberToCamp)
    .set(assignment)
    .where(
      and(eq(memberToCamp.userId, userId), eq(memberToCamp.campId, campId)),
    );
};

/**
 * Assigns all camp payments to a user (when changing to Camper role).
 * @param userId The user's ID
 * @param campId The camp's ID
 */
export const assignCamperPayments = async (
  userId: string,
  campId: string,
): Promise<void> => {
  const paymentIds = await getCampPaymentIds(campId);

  if (paymentIds.length > 0) {
    const values = paymentIds.map((x) => ({
      paymentId: x.id,
      userId,
    }));
    await db.insert(userPayment).values(values);
  }
};

/**
 * Gets all camper user IDs for a specific camp.
 * @param campId The camp's ID
 * @returns Array of user IDs with Camper role
 */
export const getCampCamperIds = async (
  campId: string,
): Promise<Array<{ id: string | null }>> => {
  return await db
    .select({ id: memberToCamp.userId })
    .from(memberToCamp)
    .where(
      and(eq(memberToCamp.campId, campId), eq(memberToCamp.role, 'Camper')),
    );
};

/**
 * Gets all room chat IDs and room IDs for a specific camp.
 * @param campId The camp's ID
 * @returns Array of objects with chatId and roomId
 */
export const getCampRoomChatIds = async (
  campId: string,
): Promise<Array<{ chatId: string | null; roomId: string }>> => {
  return await db
    .select({ chatId: room.chatId, roomId: room.id })
    .from(room)
    .where(and(eq(room.campId, campId), sql`${room.chatId} IS NOT NULL`));
};

/**
 * Gets all group chat IDs and group IDs for a specific camp.
 * @param campId The camp's ID
 * @returns Array of objects with chatId and groupId
 */
export const getCampGroupChatIds = async (
  campId: string,
): Promise<Array<{ chatId: string | null; groupId: string }>> => {
  return await db
    .select({ chatId: group.chatId, groupId: group.id })
    .from(group)
    .where(and(eq(group.campId, campId), sql`${group.chatId} IS NOT NULL`));
};
