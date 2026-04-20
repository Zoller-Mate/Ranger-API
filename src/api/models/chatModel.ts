import { db, user } from '../../db';
import { chat, chatMember, message, memberToCamp } from '../../db/schema';
import { eq, and, desc, isNull, inArray, or } from 'drizzle-orm';

export class Chat {
  // DEV: Get ALL chats in the system
  static async findAll() {
    const chatsData = await db
      .select()
      .from(chat)
      .orderBy(desc(chat.lastMessageAt));

    const chatsWithDetails = await Promise.all(
      chatsData.map(async (c) => {
        // Get last message
        const [lastMsg] = await db
          .select()
          .from(message)
          .where(and(eq(message.chatId, c.id), isNull(message.deletedAt)))
          .orderBy(desc(message.createdAt))
          .limit(1);

        // Get members with online status
        const members = await this.getMembers(c.id);

        return {
          ...c,
          lastMessage: lastMsg || null,
          members,
        };
      }),
    );

    return chatsWithDetails;
  }

  // Get all chats for a user with details
  static async findByUserId(userId: string) {
    const userChatsQuery = await db
      .select()
      .from(chatMember)
      .where(eq(chatMember.userId, userId));

    const chatIds = userChatsQuery.map((cm) => cm.chatId);

    if (chatIds.length === 0) {
      return [];
    }

    const chatsData = await db
      .select()
      .from(chat)
      .where(inArray(chat.id, chatIds))
      .orderBy(desc(chat.lastMessageAt));

    const chatsWithDetails = await Promise.all(
      chatsData.map(async (c) => {
        // Get last message
        const [lastMsg] = await db
          .select()
          .from(message)
          .where(and(eq(message.chatId, c.id), isNull(message.deletedAt)))
          .orderBy(desc(message.createdAt))
          .limit(1);

        // Get members with online status
        const members = await this.getMembers(c.id);

        return {
          ...c,
          lastMessage: lastMsg || null,
          members,
        };
      }),
    );

    return chatsWithDetails;
  }

  // Get chat by ID
  static async findById(chatId: string) {
    const [chatData] = await db
      .select()
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    return chatData;
  }

  // Create new chat
  static async create(userIds: string[]) {
    const [newChat] = await db.insert(chat).values({}).returning();

    if (!newChat) {
      throw new Error('Failed to create chat');
    }

    // Add members
    await db.insert(chatMember).values(
      userIds.map((userId) => ({
        chatId: newChat.id,
        userId,
      })),
    );

    return newChat;
  }

  // Get chat members with online status
  static async getMembers(chatId: string) {
    const members = await db
      .select({
        userId: chatMember.userId,
        lastViewed: chatMember.lastViewed,
        joinedAt: chatMember.joinedAt,
      })
      .from(chatMember)
      .where(eq(chatMember.chatId, chatId));

    const membersWithDetails = await Promise.all(
      members.map(async (member) => {
        const userData = await db.query.user.findFirst({
          where: eq(user.id, member.userId),
          columns: {
            id: true,
            name: true,
            profilePic: true,
          },
          with: {
            onlineStatus: true,
          },
        });

        return {
          ...member,
          name: userData?.name || 'Unknown',
          profilePic: userData?.profilePic || null,
          isOnline: userData?.onlineStatus?.isOnline || false,
          lastSeenAt: userData?.onlineStatus?.lastSeenAt || null,
        };
      }),
    );

    return membersWithDetails;
  }

  // Check if user is member
  static async isMember(userId: string, chatId: string): Promise<boolean> {
    const [member] = await db
      .select()
      .from(chatMember)
      .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
      .limit(1);

    return !!member;
  }

  // Add member to chat
  static async addMember(chatId: string, userId: string) {
    // Check if already member
    const isMember = await this.isMember(userId, chatId);
    if (isMember) {
      throw new Error('User is already a member of this chat');
    }

    await db.insert(chatMember).values({
      chatId,
      userId,
    });

    return true;
  }

  // Remove member from chat
  static async removeMember(chatId: string, userId: string) {
    await db
      .delete(chatMember)
      .where(and(eq(chatMember.chatId, chatId), eq(chatMember.userId, userId)));

    return true;
  }

  // Get messages for chat
  static async getMessages(
    chatId: string,
    limit: number = 50,
    offset: number = 0,
  ) {
    const messages = await db
      .select()
      .from(message)
      .where(and(eq(message.chatId, chatId), isNull(message.deletedAt)))
      .orderBy(desc(message.createdAt))
      .limit(limit)
      .offset(offset);

    // Get reply messages if any
    const replyToIds = messages
      .filter((m) => m.replyToMessageId)
      .map((m) => m.replyToMessageId!);

    let replyMessages: any[] = [];
    if (replyToIds.length > 0) {
      replyMessages = await db.query.message.findMany({
        where: (messages, { inArray }) => inArray(messages.id, replyToIds),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              profilePic: true,
            },
          },
        },
      });
    }

    // Get user info for all messages
    const messagesWithUserAndReply = await Promise.all(
      messages.map(async (msg) => {
        const userData = msg.userId
          ? await db.query.user.findFirst({
              where: eq(user.id, msg.userId),
              columns: {
                id: true,
                name: true,
                profilePic: true,
              },
            })
          : null;

        const replyContext = msg.replyToMessageId
          ? replyMessages.find((r) => r.id === msg.replyToMessageId)
          : null;

        return {
          ...msg,
          user: userData || {
            id: msg.userId,
            name: 'Unknown',
            profilePic: null,
          },
          replyToMessage: replyContext
            ? {
                id: replyContext.id,
                userId: replyContext.userId,
                userName: replyContext.user?.name || 'Unknown',
                body: replyContext.body,
                createdAt: replyContext.createdAt,
              }
            : null,
        };
      }),
    );

    const hasMore = messages.length === limit;

    return {
      messages: messagesWithUserAndReply.reverse(),
      hasMore,
    };
  }
}

/**
 * Gets chat members with their last viewed timestamp (simplified version).
 * @param chatId The chat's ID
 * @param includeArchived Whether to include archived members (default: false)
 * @returns Array of chat members with userId and lastSeen
 */
export const getChatMembers = async (
  chatId: string,
  includeArchived: boolean = false,
): Promise<Array<{ userId: string | null; lastSeen: Date | null }>> => {
  const conditions = includeArchived
    ? eq(chatMember.chatId, chatId)
    : and(eq(chatMember.chatId, chatId), isNull(chatMember.archivedAt));

  return await db
    .select({
      userId: chatMember.userId,
      lastSeen: chatMember.lastViewed,
    })
    .from(chatMember)
    .where(conditions);
};

/**
 * Gets chat details including lastMessageAt and user's lastViewed.
 * @param chatId The chat's ID
 * @param userId The user's ID
 * @returns Object with lastMessageAt and lastSeenAt
 */
export const getChatDetails = async (
  chatId: string,
  userId: string,
): Promise<{
  createdAt: Date | null;
  lastMessageAt: Date | null;
  lastSeenAt: Date | null;
}> => {
  const [chatData] = await db
    .select({ createdAt: chat.createdAt, lastMessageAt: chat.lastMessageAt })
    .from(chat)
    .where(eq(chat.id, chatId));

  const [userViewed] = await db
    .select({ lastViewed: chatMember.lastViewed })
    .from(chatMember)
    .where(and(eq(chatMember.chatId, chatId), eq(chatMember.userId, userId)));

  return {
    createdAt: chatData?.createdAt || null,
    lastMessageAt: chatData?.lastMessageAt || null,
    lastSeenAt: userViewed?.lastViewed || null,
  };
};

/**
 * Checks if a user is a member of a chat.
 * @param userId The user's ID
 * @param chatId The chat's ID
 * @returns True if user is a member, false otherwise
 */
export const isChatMember = async (
  userId: string,
  chatId: string,
): Promise<boolean> => {
  const [member] = await db
    .select()
    .from(chatMember)
    .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
    .limit(1);

  return !!member;
};

/**
 * Gets user's last viewed timestamp for a chat.
 * @param userId The user's ID
 * @param chatId The chat's ID
 * @returns Last viewed timestamp or null
 */
export const getUserChatViewed = async (
  userId: string,
  chatId: string,
): Promise<{ lastViewed: Date | null } | null> => {
  const [result] = await db
    .select({ lastViewed: chatMember.lastViewed })
    .from(chatMember)
    .where(and(eq(chatMember.chatId, chatId), eq(chatMember.userId, userId)))
    .limit(1);

  return result || null;
};

/**
 * Gets chat's last message timestamp.
 * @param chatId The chat's ID
 * @returns Last message timestamp or null
 */
export const getChatLastMessage = async (
  chatId: string,
): Promise<Date | null> => {
  const [result] = await db
    .select({ lastMessageAt: chat.lastMessageAt })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  return result?.lastMessageAt || null;
};

/**
 * Adds a user to a chat if not already a member.
 * @param userId The user's ID
 * @param chatId The chat's ID
 * @returns True if user was added, false if already a member
 */
export const addUserToChatIfNotMember = async (
  userId: string,
  chatId: string,
): Promise<boolean> => {
  const [existingMember] = await db
    .select({ chatId: chatMember.chatId })
    .from(chatMember)
    .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
    .limit(1);

  if (!existingMember) {
    await db.insert(chatMember).values({ chatId, userId });
    return true;
  }

  return false;
};

/**
 * Adds multiple users to a chat with deduplication (including staff/owners).
 * @param chatId The chat's ID
 * @param userIds Array of user IDs to add
 * @param staffAndOwners Optional array of staff/owner objects with userId property
 */
export const addUsersToChat = async (
  chatId: string,
  userIds: string[],
  staffAndOwners?: Array<{ userId: string | null }>,
): Promise<void> => {
  const uniqueChatMembers = new Map<
    string,
    { userId: string; chatId: string }
  >();

  const addChatMember = (userId?: string | null) => {
    if (!userId) return;
    if (!uniqueChatMembers.has(userId)) {
      uniqueChatMembers.set(userId, { userId, chatId });
    }
  };

  // Add provided user IDs
  userIds.forEach((userId) => addChatMember(userId));

  // Add staff and owners if provided
  if (staffAndOwners) {
    staffAndOwners.forEach((staff) => addChatMember(staff.userId));
  }

  const chatMembersToAdd = Array.from(uniqueChatMembers.values());

  if (chatMembersToAdd.length > 0) {
    await db
      .insert(chatMember)
      .values(chatMembersToAdd)
      .onConflictDoNothing({
        target: [chatMember.userId, chatMember.chatId],
      });
  }
};

/**
 * Archives a user's membership in a chat (sets archivedAt to now).
 * Used when a user leaves a room/group but should retain read-only access to old messages.
 * @param userId The user's ID
 * @param chatId The chat's ID
 */
export const archiveChatMember = async (
  userId: string,
  chatId: string,
): Promise<void> => {
  await db
    .update(chatMember)
    .set({ archivedAt: new Date() })
    .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)));
};

/**
 * Unarchives a user's membership in a chat (sets archivedAt to null).
 * Used when a user rejoins a room/group they previously left.
 * @param userId The user's ID
 * @param chatId The chat's ID
 */
export const unarchiveChatMember = async (
  userId: string,
  chatId: string,
): Promise<void> => {
  await db
    .update(chatMember)
    .set({ archivedAt: null })
    .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)));
};

/**
 * Checks if a user is archived in a chat.
 * @param userId The user's ID
 * @param chatId The chat's ID
 * @returns Object with isArchived boolean and archivedAt timestamp
 */
export const isUserArchivedInChat = async (
  userId: string,
  chatId: string,
): Promise<{ isArchived: boolean; archivedAt: Date | null }> => {
  const [member] = await db
    .select({ archivedAt: chatMember.archivedAt })
    .from(chatMember)
    .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
    .limit(1);

  return {
    isArchived: !!member?.archivedAt,
    archivedAt: member?.archivedAt || null,
  };
};

/**
 * Archives all staff and owner members in a chat.
 * Used when a room/group is deleted but the chat is preserved (has messages).
 * @param chatId The chat's ID
 * @param campId The camp's ID to identify staff/owners
 */
export const archiveAllStaffInChat = async (
  chatId: string,
  campId: string,
): Promise<void> => {
  // Get all staff and owner members of this camp
  const staffAndOwners = await db
    .select({ userId: memberToCamp.userId })
    .from(memberToCamp)
    .where(
      and(
        eq(memberToCamp.campId, campId),
        or(
          eq(memberToCamp.role, 'Staff'),
          eq(memberToCamp.role, 'Owner'),
        ),
      ),
    );

  const staffUserIds = staffAndOwners
    .map((s) => s.userId)
    .filter((id): id is string => id !== null);

  if (staffUserIds.length === 0) return;

  // Archive all staff/owner members in this chat
  await db
    .update(chatMember)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(chatMember.chatId, chatId),
        inArray(chatMember.userId, staffUserIds),
      ),
    );
};
