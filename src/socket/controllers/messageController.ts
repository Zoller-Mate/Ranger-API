import { Server as SocketIOServer, Socket } from 'socket.io';
import * as chatMemberModel from '../models/chatMemberModel';
import * as messageModel from '../models/messageModel';
import SocketError from '../../utils/socketError';
import { catchAsyncSocket } from '../../utils/catchAsync';
import { isUserArchivedInChat } from '../../api/models/chatModel';
import sendNotification from '../../utils/sendNotification';

/**
 * Message Controller
 * Handles sending and managing messages
 */

export const handleSendMessage = catchAsyncSocket(
  async (
    socket: Socket,
    io: SocketIOServer,
    messageRateLimits: Map<string, { count: number; resetTime: number }>,
    {
      chatId,
      body,
      replyToMessageId,
      tempId,
    }: {
      chatId: string;
      body: any;
      replyToMessageId?: string;
      tempId: string;
    },
  ): Promise<void> => {
    const userId = socket.data.userId;
    const userName = socket.data.userName;

    const RATE_LIMIT_MESSAGES = parseInt(
      process.env.MESSAGE_RATE_LIMIT || '30',
      10,
    );
    const RATE_LIMIT_WINDOW =
      parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '1', 10) * 60 * 1000;

    // Rate limiting check
    const now = Date.now();
    const userLimit = messageRateLimits.get(userId);

    if (userLimit) {
      if (now < userLimit.resetTime) {
        if (userLimit.count >= RATE_LIMIT_MESSAGES) {
          SocketError.emit(
            socket,
            'Too many messages. Please slow down.',
            'RATE_LIMIT_EXCEEDED',
            429,
          );
          return;
        }
        userLimit.count++;
      } else {
        messageRateLimits.set(userId, {
          count: 1,
          resetTime: now + RATE_LIMIT_WINDOW,
        });
      }
    } else {
      messageRateLimits.set(userId, {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW,
      });
    }

    // Validate input
    if (!body || typeof body !== 'object') {
      SocketError.emit(
        socket,
        'Message body is required',
        'INVALID_INPUT',
        400,
      );
      return;
    }

    // Text length validation
    if (body.text && body.text.length > 5000) {
      SocketError.emit(
        socket,
        'Message text cannot exceed 5000 characters',
        'TEXT_TOO_LONG',
        400,
      );
      return;
    }

    // Verify user is member
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

    // Check if user is archived in this chat (cannot send messages)
    const { isArchived } = await isUserArchivedInChat(userId, chatId);
    if (isArchived) {
      SocketError.emit(
        socket,
        'You cannot send messages to an archived chat',
        'FORBIDDEN',
        403,
      );
      return;
    }

    // Send message to database
    const newMessage = await messageModel.sendMessageToChat(
      chatId,
      userId,
      body,
      replyToMessageId,
    );

    // Get reply context if exists
    let replyContext = null;
    if (replyToMessageId) {
      const messagesResult = await messageModel.getChatMessages(chatId, 100, 0);
      const replyMsg = messagesResult.messages.find(
        (m: any) => m.id === replyToMessageId,
      );
      if (replyMsg) {
        replyContext = {
          id: replyMsg.id,
          userId: replyMsg.userId,
          body: replyMsg.body,
          createdAt: replyMsg.createdAt,
        };
      }
    }

    // Broadcast to all users in chat (including sender for optimistic update confirmation)
    // TODO: Filter out users who don't have active membership (left room/group but still in chatMember)
    // Only users with active roomId/groupId should receive new messages
    // Read-only users (those who left room/group) should NOT receive this broadcast
    io.to(`chat:${chatId}`).emit('newMessage', {
      ...newMessage,
      tempId, // Include tempId for client-side optimistic update matching
      replyToMessage: replyContext,
      userId,
    });

    // Send push notifications to all chat members except the sender
    // Note: Notification failures are caught and logged separately
    // They should NOT break the message sending flow
    try {
      const chatMemberIds = await chatMemberModel.getChatMemberIds(chatId);
      const recipientIds = chatMemberIds.filter((id) => id !== userId);
      
      if (recipientIds.length > 0) {
        // Prepare notification message (truncate if too long)
        const messageText = body.text || '[Non-text message]';
        const notificationMessage = messageText.length > 100 
          ? messageText.substring(0, 97) + '...'
          : messageText;

        // Send notification to each recipient in parallel
        const notificationPromises = recipientIds.map((recipientId) =>
          sendNotification(recipientId, userName, notificationMessage).catch(
            (err: any) => {
              console.error(
                `[NOTIFICATION_ERROR] Failed to send to ${recipientId}: ${err?.message || err}`,
              );
            },
          ),
        );

        await Promise.all(notificationPromises);
      }
    } catch (err: any) {
      // Log but don't throw - notification failure shouldn't break message sending
      console.error(
        `[NOTIFICATION_BATCH_ERROR] ${err?.message || 'Unknown error'}`,
      );
    }
  },
);

// Get messages with archive filtering
export const handleGetMessages = catchAsyncSocket(
  async (
    socket: Socket,
    {
      chatId,
      limit = 50,
      offset = 0,
    }: {
      chatId: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<void> => {
    const userId = socket.data.userId;

    // Verify user is member
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

    // Check if user is archived and get archive timestamp
    const { isArchived, archivedAt } = await isUserArchivedInChat(
      userId,
      chatId,
    );

    // Get messages with pagination
    const result = await messageModel.getChatMessages(
      chatId,
      limit,
      offset,
      archivedAt,
    );

    // Send messages to requesting user only
    socket.emit('messagesHistory', {
      chatId,
      messages: result.messages,
      hasMore: result.hasMore,
      offset,
      isArchived, // Let client know if this is an archived view
    });
  },
);
