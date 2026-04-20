import { Socket } from 'socket.io';
import * as chatMemberModel from '../models/chatMemberModel';
import * as onlineStatusModel from '../models/onlineStatusModel';
import * as locationModel from '../models/locationModel';
import SocketError from '../../utils/socketError';
import {
  catchAsyncSocket,
  catchAsyncSocketSilent,
} from '../../utils/catchAsync';

/**
 * Socket Connection Controller
 * Handles socket connection and disconnection events
 * Handles online/offline status and presence-related events
 */
export const handleConnection = catchAsyncSocket(
  async (socket: Socket): Promise<void> => {
    const userId = socket.data.userId;

    if (!userId) {
      throw new Error('User ID not found in socket data');
    }

    // Get user's camp IDs
    const userCampIds = await chatMemberModel.getUserCampIds(userId);

    // Join all camp rooms for broadcasting
    userCampIds.forEach((campId) => {
      socket.join(`camp:${campId}`);
    });

    // Join staff rooms (Staff/Owner only)
    const staffCampIds = await chatMemberModel.getUserStaffCampIds(userId);
    staffCampIds.forEach((campId) => {
      socket.join(`staff:${campId}`);
    });
    // Update user online status
    const onlineStatus = await onlineStatusModel.updateOnlineStatus(
      userId,
      true,
    );

    // Broadcast to ALL camp members that user is online
    userCampIds.forEach((campId) => {
      socket.to(`camp:${campId}`).emit('userConnected', onlineStatus);
    });

    // Also get chat IDs for chat-specific features
    const userChatIds = await chatMemberModel.getUserChatIds(userId);
    userChatIds.forEach((chatId) => {
      socket.join(`chat:${chatId}`);
    });

    // Get user's group IDs and join group rooms for location sharing
    const userGroupIds = await locationModel.getUserGroupIds(userId);
    userGroupIds.forEach((groupId) => {
      socket.join(`group:${groupId}`);
    });

    // Join user-specific room for direct messages (e.g., staff broadcasts)
    socket.join(`user:${userId}`);

    // Get online users for each camp and send to the connecting user
    const campOnlineUsers = await Promise.all(
      userCampIds.map(async (campId) => ({
        campId,
        users: await onlineStatusModel.getCampMembersOnlineStatus(campId),
      })),
    );

    // Get locations for each camp based on user role
    const campLocations = await Promise.all(
      userCampIds.map(async (campId) => {
        const isStaff = staffCampIds.includes(campId);
        const locations = isStaff
          ? await locationModel.getAllCampLocations(campId)
          : await locationModel.getVisibleLocationsForRegularUser(
              userId,
              campId,
            );

        return {
          campId,
          users: locations,
        };
      }),
    );

    // Send authenticated confirmation with online users and locations
    socket.emit('authenticated', {
      userId,
      onlineUsers: campOnlineUsers,
      locations: campLocations,
    });
  },
);

/**
 * Disconnection Handler
 * Handles socket disconnection and cleanup
 */
export const handleDisconnect = catchAsyncSocketSilent(
  async (
    socket: Socket,
    messageRateLimits: Map<string, { count: number; resetTime: number }>,
    typingUsers: Map<string, Set<string>>,
  ): Promise<void> => {
    const userId = socket.data.userId;

    // Get user's camp IDs
    const userCampIds = await chatMemberModel.getUserCampIds(userId);

    // Update online status to offline
    const onlineStatus = await onlineStatusModel.updateOnlineStatus(
      userId,
      false,
    );

    // Broadcast offline status to ALL camp members
    userCampIds.forEach((campId) => {
      socket.to(`camp:${campId}`).emit('userDisconnected', onlineStatus);
    });

    // Get user's chat IDs for typing cleanup
    const userChatIds = await chatMemberModel.getUserChatIds(userId);
    userChatIds.forEach((chatId) => {
      // Remove from typing indicators
      const chatTyping = typingUsers.get(chatId);
      if (chatTyping) {
        chatTyping.delete(userId);
      }
    });

    // Clean up rate limits
    messageRateLimits.delete(userId);
  },
);
