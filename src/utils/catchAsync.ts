import { Request, Response, NextFunction } from 'express';

type AsyncReqResNextFunc = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<any>;

/**
 * A wrapper function to make error handling easier for the middleware functions
 * @param fn the function it should wrap
 */
const catchAsyncReqResNext = (fn: AsyncReqResNextFunc) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

import { Socket } from 'socket.io';
import SocketError from './socketError';

/**
 * Wrapper for async socket handlers to catch errors automatically
 * Similar to catchAsync for Express routes
 *
 * Usage:
 * export const handleJoinChat = catchAsyncSocket(async (socket, data) => {
 *   // your code here
 * });
 *
 * For handlers with extra parameters (io, maps, etc):
 * export const handleSendMessage = catchAsyncSocket(async (socket, io, rateLimits, data) => {
 *   // your code here
 * });
 */
export const catchAsyncSocket = (fn: (...args: any[]) => Promise<void>) => {
  return async (...args: any[]) => {
    // First argument is always the socket
    const socket = args[0] as Socket;

    try {
      await fn(...args);
    } catch (error: any) {
      // Send generic internal error to client
      SocketError.emit(
        socket,
        error.message || 'An error occurred',
        'INTERNAL_ERROR',
        500,
      );
    }
  };
};

/**
 * Silent version for disconnect handlers - doesn't emit errors to socket
 * Use this for handlers that run when socket is already disconnecting
 */
export const catchAsyncSocketSilent = (
  fn: (...args: any[]) => Promise<void>,
) => {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch {
      // Silently ignore errors - socket is already disconnected
    }
  };
};

export default catchAsyncReqResNext;