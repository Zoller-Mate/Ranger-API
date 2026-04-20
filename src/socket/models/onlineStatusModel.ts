import { db } from '../../db';
import { userOnlineStatus, memberToCamp } from '../../db/schema';
import { eq } from 'drizzle-orm';

// Update online status (UPSERT: insert if not exists, update if exists)
export async function updateOnlineStatus(
  userId: string,
  isOnline: boolean,
) {
  const [result] = await db
    .insert(userOnlineStatus)
    .values({
      userId,
      isOnline,
      lastSeenAt: isOnline ? null : new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userOnlineStatus.userId,
      set: {
        isOnline,
        lastSeenAt: isOnline ? null : new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  return result;
}

// Get online status for all members in a camp
export async function getCampMembersOnlineStatus(campId: string) {
  const statuses = await db
    .select({
      userId: memberToCamp.userId,
      isOnline: userOnlineStatus.isOnline,
      lastSeenAt: userOnlineStatus.lastSeenAt,
    })
    .from(memberToCamp)
    .leftJoin(
      userOnlineStatus,
      eq(memberToCamp.userId, userOnlineStatus.userId),
    )
    .where(eq(memberToCamp.campId, campId));

  // Map null values to defaults (user never connected)
  return statuses.map((s) => ({
    userId: s.userId,
    isOnline: s.isOnline ?? false,
    lastSeenAt: s.lastSeenAt,
  }));
}
