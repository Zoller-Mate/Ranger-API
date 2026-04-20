import { Request } from 'express';
import { randomBytes, createHash } from 'crypto';
import { hash, compare } from 'bcrypt';
import { PhoneNumberUtil } from 'google-libphonenumber';
import { db, user, passwordReset, registerToken } from '../../db';
import { eq, gt, and, sql } from 'drizzle-orm';

const phoneUtil = PhoneNumberUtil.getInstance();

export const validatePassword = async (req: Request): Promise<boolean> => {
  if (!req.body.password) {
    throw new Error('No password was found in the req');
  } else {
    return /^[A-Za-z0-9öüóőúéáűí!?@.$]+$/.test(req.body.password);
  }
};

/**
 * Encrypts the password field in the req.body.
 * @param req the request object it will modify
 * @returns the new req object with the password field encrypted in the req.body
 */
export const passwordEncrypt = async (req: Request): Promise<Request> => {
  if (!req.body.password) {
    throw new Error('No password field is found in the body');
  } else {
    req.body.password = await hash(req.body.password, 12);
    return req;
  }
};

export const validateEmail = async (email: string): Promise<boolean> => {
  return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
};

export const isEmailUsed = async (email: string): Promise<boolean> => {
  if (
    (
      await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1)
    ).length > 0
  )
    return true;
  return false;
};

export const validatePhoneNumber = async (
  phoneNumber: string,
): Promise<boolean> => {
  try {
    const number = phoneUtil.parseAndKeepRawInput(phoneNumber);
    return phoneUtil.isValidNumber(number);
  } catch (e) {
    return false; // parsing failed
  }
};

export const checkPasswordResetToken = async (
  req: Request,
): Promise<string> => {
  if (!req.params.auth) {
    throw new Error(
      'No reset token was given, please give one in order to reset password!',
    );
  } else {
    try {
      return (
        (
          await db
            .select({ id: user.id })
            .from(user)
            .leftJoin(passwordReset, eq(user.id, passwordReset.userId))
            .where(
              and(
                eq(
                  passwordReset.token,
                  await createHash('sha256')
                    .update(req.params.auth)
                    .digest('hex'),
                ),
                gt(passwordReset.expiresAt, sql`now()`),
              ),
            )
            .limit(1)
        )[0]?.id ?? ''
      );
    } catch (err) {
      throw err;
    }
  }
};

export const hasPasswordResetToken = async (req: Request): Promise<boolean> => {
  if (!req.body.email) {
    throw new Error('No email field is found in the body');
  } else {
    if (
      (
        await db
          .select({ id: user.id })
          .from(user)
          .leftJoin(passwordReset, eq(user.id, passwordReset.userId))
          .where(eq(user.email, req.body.email))
          .limit(1)
      ).length > 0
    )
      return true;
    return false;
  }
};

export const deletePasswordResetToken = async (req: Request): Promise<void> => {
  if (!req.body.email) {
    throw new Error('No email field is found in the body');
  } else {
    await db
      .delete(passwordReset)
      .where(
        eq(
          passwordReset.userId,
          (
            await db
              .select({ id: user.id })
              .from(user)
              .where(eq(user.email, req.body.email))
          )[0]?.id ?? '',
        ),
      );
  }
};

export const createPasswordResetToken = async (
  req: Request,
): Promise<string> => {
  if (!req.body.email) {
    throw new Error('No email field is found in the body');
  } else {
    const resetToken = randomBytes(32).toString('hex');

    await db.insert(passwordReset).values({
      userId: (
        await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, req.body.email))
      )[0]?.id,
      token: createHash('sha256').update(resetToken).digest('hex'),
    });

    return resetToken;
  }
};

export const resetPassword = async (
  _userId: string,
  pwd: string,
): Promise<void> => {
  await db
    .update(user)
    .set({ password: pwd, passwordResetAt: sql`now()` })
    .where(eq(user.id, _userId));
};

export const checkPassword = async (
  originalPwd: string,
  candidatePwd: string,
): Promise<boolean> => {
  return await compare(candidatePwd, originalPwd);
};

export const createRegistrationToken = async (userEmail: string)=> {
  const regToken = randomBytes(32).toString('hex');

  const _userId = (await db.select({ id: user.id }).from(user).where(eq(user.email, userEmail)))[0]?.id;

  if(!_userId){
    throw new Error(`User was not found`);
  }

  await db.insert(registerToken).values({
    userId: _userId,
    token: createHash('sha256').update(regToken).digest('hex'),
  });

  return regToken;
}

export const validateRegistration = async (candidateToken: string): Promise<true> => {
  try {
    const _userId = (
      await db
        .select({ id: user.id })
        .from(user)
        .leftJoin(registerToken, eq(user.id, registerToken.userId))
        .where(
          and(
            eq(
              registerToken.token,
              await createHash('sha256').update(candidateToken).digest('hex'),
            ),
            gt(registerToken.expiresAt, sql`now()`),
          ),
        )
        .limit(1)
    )[0]?.id ?? ''

    if( _userId !== ''){
      await db.update(user).set({validated: true}).where(eq(user.id, _userId));
      await deleteValidationToken(_userId);
      return true;
    } else {
      throw new Error(`The token is either invalid or expired`);
    }
  } catch (err) {
    throw err;
  }
}

export const deleteValidationToken = async (userId: string) => {
  await db.delete(registerToken).where(eq(registerToken.userId, userId));
}

export const deleteUnvalidatedUser = async (userId: string) => {
  if (!(await isValidated(userId))) {
    await deleteValidationToken(userId);
    await db.delete(user).where(eq(user.id, userId));
  }
};

export const isValidated = async (userId: string): Promise<boolean> => {
  return (
    (
      await db
        .select({ validated: user.validated })
        .from(user)
        .where(eq(user.id, userId))
    )[0]?.validated ?? false
  );
};