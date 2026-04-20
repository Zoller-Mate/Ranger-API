import { Server as SocketIOServer, Socket } from 'socket.io';
import { authenticateSocket } from './controllers/authSocketController';
import * as socketConnectionController from './controllers/socketConnectionController';
import * as chatRoomController from './controllers/chatRoomController';
import * as messageController from './controllers/messageController';
import * as locationController from './controllers/locationController';
import * as groupRoomController from './controllers/groupRoomController';

/**
 * SOCKET ROOM NAMING CONVENTION:
 * - Camp rooms: `camp:{campId}` - for camp-wide broadcasts (presence, announcements)
 * - Staff rooms: `staff:{campId}` - for staff/owner-only broadcasts
 * - Chat rooms: `chat:{chatId}` - for chat-specific messages
 * - Group rooms: `group:{groupId}` - for group-specific location sharing
 * - User rooms: `user:{userId}` - for user-specific direct messages (e.g., staff location broadcasts)
 */

// Rate limiting map for messages
const messageRateLimits = new Map<
  string,
  { count: number; resetTime: number }
>();

// Typing indicators cache
const typingUsers = new Map<string, Set<string>>(); // chatId -> Set of userIds

// Socket.IO instance
let ioInstance: SocketIOServer | null = null;

export function setSocketServer(io: SocketIOServer): void {
  ioInstance = io;
}

export function getSocketServer(): SocketIOServer | null {
  return ioInstance;
}

export function initializeSocketIO(io: SocketIOServer) {
  // Initialize for emits launched from API
  setSocketServer(io);

  // Apply authentication middleware
  io.use(authenticateSocket);

  io.on('connection', async (socket: Socket) => {
    // Handle initial connection
    await socketConnectionController.handleConnection(socket);

    // Chat room events (socket joins/leaves chat rooms)
    socket.on('joinChat', (data) =>
      chatRoomController.handleJoinChat(socket, data),
    );
    socket.on('leaveChat', (data) =>
      chatRoomController.handleLeaveChat(socket, data),
    );
    socket.on('viewChat', (data) =>
      chatRoomController.handleViewChat(socket, data),
    );
    socket.on('sendMessage', (data) =>
      messageController.handleSendMessage(socket, io, messageRateLimits, data),
    );
    socket.on('getMessages', (data) =>
      messageController.handleGetMessages(socket, data),
    );

    // Typing indicator
    socket.on('typing', (data) =>
      chatRoomController.handleTyping(socket, typingUsers, data),
    );

    // Group room events (socket joins/leaves group rooms) for location sharing
    socket.on('joinGroup', (data) =>
      groupRoomController.handleJoinGroup(socket, data),
    );
    socket.on('leaveGroup', (data) =>
      groupRoomController.handleLeaveGroup(socket, data),
    );
    socket.on('endGroup', (data) =>
      groupRoomController.handleEndGroup(socket, data),
    );

    // Location events (real-time location updates)
    socket.on('updateLocation', (data) =>
      locationController.handleUpdateLocation(socket, io, data),
    );

    // Disconnect handler
    socket.on('disconnect', () =>
      socketConnectionController.handleDisconnect(
        socket,
        messageRateLimits,
        typingUsers,
      ),
    );
  });

  console.log('Socket.IO initialized successfully');
}
