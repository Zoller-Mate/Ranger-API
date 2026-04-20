import { db } from '../../db';
import { chat, message } from '../../db/schema';
import { eq, and, desc, isNull, inArray, lte } from 'drizzle-orm';

// Get messages with reply context
export async function getChatMessages(
  chatId: string,
  limit: number = 50,
  offset: number = 0,
  archivedAt: Date | null = null,
) {
  // Build where conditions
  const conditions = [
    eq(message.chatId, chatId),
    isNull(message.deletedAt),
  ];

  // If user is archived, only show messages before archiveAt timestamp
  if (archivedAt) {
    conditions.push(lte(message.createdAt, archivedAt));
  }

  const messages = await db
    .select()
    .from(message)
    .where(and(...conditions))
    .orderBy(desc(message.createdAt))
    .limit(limit)
    .offset(offset);

  // Get reply messages if any
  const replyToIds = messages
    .filter((m) => m.replyToMessageId)
    .map((m) => m.replyToMessageId!);

  let replyMessages: any[] = [];
  if (replyToIds.length > 0) {
    replyMessages = await db
      .select({
        id: message.id,
        userId: message.userId,
        body: message.body,
        createdAt: message.createdAt,
      })
      .from(message)
      .where(inArray(message.id, replyToIds));
  }

  // Add reply context to messages
  const messagesWithReply = messages.map((msg) => {
    const replyContext = msg.replyToMessageId
      ? replyMessages.find((r) => r.id === msg.replyToMessageId)
      : null;

    return {
      ...msg,
      replyToMessage: replyContext
        ? {
            id: replyContext.id,
            userId: replyContext.userId,
            body: replyContext.body,
            createdAt: replyContext.createdAt,
          }
        : null,
    };
  });

  const hasMore = messages.length === limit;

  return {
    messages: messagesWithReply.reverse(), // Reverse to get chronological order
    hasMore,
  };
}

// Send a message
export async function sendMessageToChat(
  chatId: string,
  userId: string,
  body: any,
  replyToMessageId?: string,
) {
  // Validate reply message if provided
  if (replyToMessageId) {
    const [replyMsg] = await db
      .select()
      .from(message)
      .where(and(eq(message.id, replyToMessageId), eq(message.chatId, chatId)))
      .limit(1);

    if (!replyMsg) {
      throw new Error('Reply message not found or not in the same chat');
    }
  }

  // Insert message
  const [newMessage] = await db
    .insert(message)
    .values({
      chatId,
      userId,
      body,
      replyToMessageId: replyToMessageId || null,
    })
    .returning();

  // Update chat's lastMessageAt
  await db
    .update(chat)
    .set({ lastMessageAt: newMessage!.createdAt })
    .where(eq(chat.id, chatId));

  return newMessage;
}
