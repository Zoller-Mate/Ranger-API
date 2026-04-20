import { Socket } from 'socket.io';
import { validateToken } from '../../utils/authService';
import SocketError from '../../utils/socketError';

// store userId to socket to do operations from API
export const userSocketCash = new Map<string, Socket>();

export const authenticateSocket = async (
  socket: Socket,
  next: (err?: Error) => void,
) => {
  try {
// 1) Get token from handshake auth, query, or headers
    const token =
      socket.handshake.auth.token || 
      socket.handshake.query.token ||
      socket.handshake.headers.authorization?.replace('Bearer ', ''); // not tested

    if (!token) {
      const error: any = new Error('No token provided');
      error.data = { code: 'NO_TOKEN', statusCode: 401 };
      return next(error);
    }

    // 2) Validate token using shared auth service
    const result = await validateToken(token as string);

    if (!result.success || !result.user) {
      const error: any = new Error(result.error?.message || 'Authentication failed');
      error.data = { 
        code: result.error?.code || 'AUTH_FAILED', 
        statusCode: 401 
      };
      return next(error);
    }

    // 3) Attach user data to socket
    socket.data.userId = result.user.id;
    socket.data.userName = result.user.name;
    //socket.data.userProfilePic = result.user.profilePic || ''; // IMPORTANT: if profilePic is null breaks the whole socket.io connection!!!!

    //4) Store userId and Socket in cash for the API operations
    userSocketCash.set(socket.data.userId, socket);

    next();
  } catch (error: any) {
    console.error('authenticateSocket error:', error);
    const err: any = new Error('Authentication failed');
    err.data = { code: 'AUTH_ERROR', statusCode: 500 };
    next(err);
  }
};
