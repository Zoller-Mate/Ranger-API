import { Socket } from 'socket.io';
import * as chatMemberModel from '../models/chatMemberModel';
import SocketError from '../../utils/socketError';
import { catchAsyncSocket } from '../../utils/catchAsync';
import { userSocketCash } from './authSocketController';

/**
 * Chat Room Controller
 * Handles chat room operations (join, leave, view) and typing indicators
 */

export const API_Socket_handleJoinChat = catchAsyncSocket(
  async (userId: string, chatId: string): Promise<void> => {
    const socket = userSocketCash.get(userId);
    if (socket) handleJoinChat(socket, { chatId }); // if user connected to socket
  },
);

export const API_Socket_handleLeaveChat = catchAsyncSocket(
  async (userId: string, chatId: string): Promise<void> => {
    const socket = userSocketCash.get(userId);
    if (socket) handleLeaveChat(socket, { chatId }); // if user connected to socket
  },
);

// Join chat room (First chat room is created when group/room/camp is created with api call. Only after that user can join the chat.)
export const handleJoinChat = catchAsyncSocket(
  async (socket: Socket, { chatId }: { chatId: string }): Promise<void> => {
    const userId = socket.data.userId;

    // Verify user is member of chat
    const isMember = await chatMemberModel.isUserChatMember(userId, chatId);
    if (!isMember) {
      SocketError.emit(
        socket,
        'You are not a member of this chat',
        'UNAUTHORIZED',
        403,
      );
      return;
    }

    // Check if user is archived (cannot join socket room for archived chats)
    const { isUserArchivedInChat } = await import('../../api/models/chatModel.js');
    const { isArchived } = await isUserArchivedInChat(userId, chatId);
    if (isArchived) {
      SocketError.emit(
        socket,
        'Cannot join archived chat room',
        'FORBIDDEN',
        403,
      );
      return;
    }

    socket.join(`chat:${chatId}`);
  },
);

// Leave chat room
export const handleLeaveChat = catchAsyncSocket(
  async (socket: Socket, { chatId }: { chatId: string }): Promise<void> => {
    socket.leave(`chat:${chatId}`);
  },
);

// User views chat (update lastViewed timestamp)
export const handleViewChat = catchAsyncSocket(
  async (socket: Socket, { chatId }: { chatId: string }): Promise<void> => {
    const userId = socket.data.userId;

    await chatMemberModel.updateLastViewed(chatId, userId);

    // Broadcast to chat members that user viewed chat
    socket.to(`chat:${chatId}`).emit('chatViewed', {
      chatId,
      userId,
      viewedAt: new Date(),
    });
  },
);

// Typing indicator
export function handleTyping(
  socket: Socket,
  typingUsers: Map<string, Set<string>>,
  { chatId, isTyping }: { chatId: string; isTyping: boolean },
): void {
  const userId = socket.data.userId;
  const userName = socket.data.userName;

  if (!typingUsers.has(chatId)) {
    typingUsers.set(chatId, new Set());
  }

  const chatTyping = typingUsers.get(chatId)!;

  if (isTyping) {
    chatTyping.add(userId);
  } else {
    chatTyping.delete(userId);
  }

  // Broadcast to others in chat (not to sender)
  socket.to(`chat:${chatId}`).emit('userTyping', {
    chatId,
    userId,
    name: userName,
    isTyping,
  });
}
