import {catchAsyncSocket} from '../../utils/catchAsync';
import { userSocketCash } from './authSocketController';

/**
 * API helpers for camp/staff socket rooms
 */
export const API_Socket_handleJoinCampRoom = catchAsyncSocket(
  async (userId: string, campId: string): Promise<void> => {
    const socket = userSocketCash.get(userId);
    if (socket) socket.join(`camp:${campId}`);
  },
);

export const API_Socket_handleLeaveCampRoom = catchAsyncSocket(
  async (userId: string, campId: string): Promise<void> => {
    const socket = userSocketCash.get(userId);
    if (socket) socket.leave(`camp:${campId}`);
  },
);

export const API_Socket_handleJoinStaffRoom = catchAsyncSocket(
  async (userId: string, campId: string): Promise<void> => {
    const socket = userSocketCash.get(userId);
    if (socket) socket.join(`staff:${campId}`);
  },
);

export const API_Socket_handleLeaveStaffRoom = catchAsyncSocket(
  async (userId: string, campId: string): Promise<void> => {
    const socket = userSocketCash.get(userId);
    if (socket) socket.leave(`staff:${campId}`);
  },
);
