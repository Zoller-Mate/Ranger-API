import { Request, Response, NextFunction } from 'express';
import { db, passwordReset } from '../../db';
import { user } from '../../db';
import { eq } from 'drizzle-orm';
import * as campModel from '../models/campModel';
import catchAsync from '../../utils/catchAsync';
import AppError from '../../utils/appError';
import signToken from '../../utils/signToken';
import { validateToken } from '../../utils/authService';
import * as userModel from '../models/userModel';
import ApiResponse from '../../utils/ApiResponse';
import { readFile } from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import pug from 'pug';
import { sendEmail } from '../../utils/SendEmail';

/**
 * Endpoint for a password reset email and token.
 */
export const forgotPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await userModel.isEmailUsed(req.body.email ?? ''))) {
        throw new AppError(
          'No account was found with the given email address.',
          400,
        );
      }

      if (await userModel.hasPasswordResetToken(req))
        await userModel.deletePasswordResetToken(req);

      const token = await userModel.createPasswordResetToken(req);
      console.log(join(__dirname, '../_views/emails/forgotPassword.pug'));
      await sendEmail(
        req.body.email,
        'Ranger password Reset token',
        'password reset',
        pug.render(
          (
            await promisify(readFile)(
              join(__dirname, '../_views/emails/forgotPassword.pug'),
            )
          ).toString(),
          {
            resetUrl: `${process.env.URL}/passwordReset/${token}`,
          },
        ),
      );

      new ApiResponse(201, `Password Token has been issued ${token}`).send(res);
    } catch (err) {
      throw err;
    }
  },
);

/**
 * Endpoint to update the password with the issued reset token.
 */
export const updatePassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    //password confirmation still should be done on the frontend side
    try {
      const _userId = await userModel.checkPasswordResetToken(req);
      if(!_userId) throw new AppError('The provided password token is either invalid or expired. Please request a new one and try again!',400);
      if (!(await userModel.validatePassword(req)))
        throw new AppError(
          'The password is invalid (Contains forbidden characters).',
          400,
        );
      req = await userModel.passwordEncrypt(req);
      await userModel.resetPassword(_userId, req.body.password);
      await db.delete(passwordReset).where(eq(passwordReset.userId, _userId));
      new ApiResponse(202, 'Password successfully updated').send(res);
    } catch (err) {
      throw err;
    }
  },
);

/**
 * Checks if the user is currently logged-in in order to proceed forward in the req res cycle.
 */
export const protect = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1) Get token from headers
    let token: string | undefined;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      if (req.baseUrl.startsWith('/api')) {
        return next(
          new AppError(
            'You are not logged in. Please log in to get access.',
            401,
          ),
        );
      } else {
        res.redirect('/');
        return;
      }
    }

    // 2) Validate token using shared auth service
    const result = await validateToken(token);

    if (!result.success || !result.user) {
      if (req.baseUrl.startsWith('/api')) {
        return next(
          new AppError(result.error?.message || 'Authentication failed', 401),
        );
      } else {
        res.redirect('/');
        return;
      }
    }

    // Grant access to protected route
    req.user = result.user;
    next();
  },
);

/**
 * Middleware to protect development routes using a static API key
 * Checks the 'x-dev-password' header against DEV_API_KEY env variable
 */
export const protectDevRoutes = (req: Request, res: Response, next: NextFunction) => {
  const devPassword = req.headers['x-dev-password'];

  if (!devPassword || devPassword !== process.env.DEV_API_KEY) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized access to development routes.',
    });
  }

  next();
};

/**
 * Restricts the remaining req res cycle to only some users with some role.
 * @param allowedRoles The roles that should be able to go forward in the reqres cycle
 */
export const restrictToCampRole = (
  ...allowedRoles: Array<'Owner' | 'Staff' | 'Camper' | 'Pending'>
) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const campId = req.params.campId || req.params.id;

    if (!userId)
      return next(
        new AppError('You must be logged in to access this resource', 401),
      );

    if (!campId) return next(new AppError('Camp ID is required', 400));

    const membership = await campModel.getMemberData(userId, campId);

    if (!membership)
      return next(new AppError('You are not a member of this camp', 403));

    if(req.user) req.user.campRole = membership.role as string;
    if (!allowedRoles.includes(membership.role as any)) {
      return next(
        new AppError(
          'You do not have permission to perform this action in this camp',
          403,
        ),
      );
    }

    next();
  });
};

/**
 * Enables different middleware functions to be run on the same route for different privileged users
 * @param routes a array of objects with the role string for the role and the func for the middleware function to be run.
 * @param error What the program should send back to the user who cannot access the route. It will need a message and a status code in a objet. Has a default code with 401 and a fitting message.
 */
export const roleSwitcher = (routes: Array<{ role: string; func: any }>, error: {message: string, code: number} = {message: "You don't hae perission to access this route", code: 401}, redirectToMain: boolean = false) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const campId = req.params.campId || req.params.id;

    if (!userId)
      return next(
        new AppError('You must be logged in to access this resource', 401),
      );

    if (!campId) return next(new AppError('Camp ID is required', 400));

    let membership;

    try{
      membership = await campModel.getMemberData(userId, campId);
    } catch(error) {
      if (redirectToMain) {
        res.redirect('/');
      } else {
        return next(error);
      }
    }


    if (!membership)
      return next(new AppError('You are not a member of this camp', 403));
    if(req.user) req.user.campRole = membership.role as string;

    if (routes.map((x) => x.role).includes(membership.role ?? '')) {
      routes.filter((x) => x.role === membership.role)[0]?.func(req, res, next);
      return;
    }
    if(!redirectToMain){
      return next(
        new AppError(error.message, error.code),
      );
    } else {
      res.redirect('/');
    }
  });
};

/**
 * Endpoint to handle the login of a user
 */
export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;
    if (!email || !password)
      throw new AppError('No email or password was provided', 400);
    const result = await db
      .select({ pwd: user.password, id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (!result[0] || !result[0].pwd || !result[0].id) {
      throw new AppError('This user does not exist', 400);
    }

    const { pwd, id } = result[0];
    if (!(await userModel.checkPassword(pwd, password)))
      throw new AppError('The email or password was incorrect', 401);
    else {
      if(!(await userModel.isValidated(id))){
        throw new AppError('This user\'s email has not been verified yet. Please do so before logging in', 403);
      } else {
        const _token = signToken(id);
        new ApiResponse(200, {
          message: 'Logged in successfully!',
          token: _token,
          userId: id,
        }).cookieSend(res, 'jwt', _token, {
          maxAge:
            parseInt(process.env.JWT_EXPIRES_IN as string) * 1000 * 60 * 60 * 24,
          httpOnly: true,
          sameSite: 'strict',
        });
      }
    }
  },
);

/**
 * Endpoint that implements registration of a user
 */
export const register = catchAsync(async (req: Request, res: Response) => {
  //INFO: The password = passwordConfirm validation should be done on the CS;

  try {
    if (!(await userModel.validatePassword(req)))
      throw new AppError(
        'The password is invalid (Contains forbidden characters).',
        400,
      );
    req = await userModel.passwordEncrypt(req);
    if (!(await userModel.validateEmail(req.body.email ?? '')))
      throw new AppError('The email address is invalid.', 400);
    if (req.body.phoneNumber)
      if (!(await userModel.validatePhoneNumber(req.body.phoneNumber)))
        throw new AppError(
          'The phone number was not a valid hungarian phone number.',
          400,
        );
    if (await userModel.isEmailUsed(req.body.email ?? ''))
      throw new AppError('This email is already in use by an other user.', 400);
  } catch (err) {
    throw err;
  }

  const id = (
    await db
      .insert(user)
      .values({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        dateOfBirth: req.body.dateOfBirth,
        phoneNumber: req.body.phoneNumber ?? null,
        emergencyContact: req.body.emergencyContact ?? null,
      })
      .returning()
  )[0]?.id;

  if (!process.env.USE_EMAIL_CONFIRM) {
    await db.update(user).set({validated: true}).where(eq(user.id, id??''));
    const _token = signToken(id ?? '');
    new ApiResponse(200, {
      message: 'Registered successfully!',
      token: _token,
      userId: id,
    }).cookieSend(res, 'jwt', _token, {
      expiresIn:
        parseInt(process.env.JWT_EXPIRES_IN as string) * 1000 * 60 * 60 * 24,
      httpOnly: true,
      sameSite: 'strict',
    });
  } else {
    const token = await userModel.createRegistrationToken(req.body.email);
    try{
      await sendEmail(
        req.body.email,
        'Ranger Email confirmation',
        'Please confirm your email address with the following mail.',
        pug.render(
          (
            await promisify(readFile)(
              join(__dirname, '../_views/emails/confirmRegistration.pug'),
            )
          ).toString(),
          {
            confirmURL: `${process.env.URL}/confirmRegistration/${token}`,
          },
        ),
      );
    } catch(error) {
      await userModel.deleteUnvalidatedUser(id??'');
      throw error;
    }


  new ApiResponse(202, {
    message: 'Registered successfully, please validate your email before logging in!',
  }).send(res);

  setTimeout(async ()=>{await userModel.deleteUnvalidatedUser(id??'')}, 1000 * 60 * 15);
  }
  /* -- Email validation needed before logging in.
  const _token = signToken(id ?? '');
  new ApiResponse(200, {
    message: 'Registered successfully!',
    token: _token,
    userId: id,
  }).cookieSend(res, 'jwt', _token, {
    expiresIn:
      parseInt(process.env.JWT_EXPIRES_IN as string) * 1000 * 60 * 60 * 24,
    httpOnly: true,
    sameSite: 'strict',
  });*/
});

export const logout = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    res
      .clearCookie('jwt', {
        httpOnly: true,
        sameSite: 'strict',
      })
      .send();
  },
);

/**
 * verifies a JWT weather if it's valid.
 */
export const verifyToken = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let token: string | undefined;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    const valid: boolean = !token
      ? false
      : (await validateToken(token)).success;
    new ApiResponse(200, valid).send(res);
  },
);

/**
 * Endpoint to check weather if a email is used by a user
 */
export const userExists = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      new ApiResponse(
        200,
        (await userModel.isEmailUsed(req.body.email))
          ? {
              msg: 'There is a user with the given email address.',
              hasUser: true,
            }
          : {
              msg: `There is no user for the email address: ${req.body.email}`,
              hasUser: false,
            },
      ).send(res);
    } catch (err) {
      throw err;
    }
  },
);

export const verifyEmail = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  try{
    if(await userModel.validateRegistration(req.params.token??'')){
      new ApiResponse(202, 'The email was successfully confirmed! Your registration is done.').send(res);
    }
  } catch (err) {
    throw new AppError("Could not verify email address. The token is either expired or not not valid.", 400);
  }
});