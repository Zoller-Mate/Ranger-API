import AppError from '../../utils/appError';
import catchAsync from '../../utils/catchAsync';
import { Request, Response, NextFunction } from 'express';
import { db, token } from '../../db';
import ApiResponse from '../../utils/ApiResponse';
import { and, eq } from 'drizzle-orm';

export const saveFCMToken= catchAsync(
  async (req: Request, res: Response, next: NextFunction)=> {
    if(req.user){
      if (req.body.token) {
        await db.insert(token).values({userId: req.user.id, token: req.body.token});
        new ApiResponse(201,"The token has been saved successfully!").send(res);
      } else throw new AppError('No token found in the request body.', 400);
    } else throw new AppError('You are not logged in!', 401);
  }
);

export const removeFCMToken = catchAsync(
  async (req: Request, res: Response, next: NextFunction)=> {
    if (req.user) {
      if(req.body.token){
        const deleted = await db.delete(token).where(and(eq(token.userId, req.user.id), eq(token.token, req.body.token))).returning({deletedToken: token.token});
        if(deleted.length === 0) throw new AppError('The token specified was not found in correlation with the user.', 400);
        new ApiResponse(204,"The token has been removed successfully!").send(res);
      } else throw new AppError('No token found in the request body.', 400);
    } else throw new AppError('You are not logged in!', 401);
  }
)
