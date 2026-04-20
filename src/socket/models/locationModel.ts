import { db } from '../../db';
import { location, memberToCamp, group } from '../../db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

/**
 * Get user's group IDs for all camps they're in
 * Used for joining group rooms on connection
 */
export async function getUserGroupIds(userId: string): Promise<string[]> {
  const result = await db
    .select({ groupId: memberToCamp.groupId })
    .from(memberToCamp)
    .where(eq(memberToCamp.userId, userId));

  return result.map((r) => r.groupId).filter((id): id is string => id !== null);
}

/**
 * Check if user is staff (Owner or Staff role) in a camp
 * Staff can see all locations in the camp
 */
export async function isUserCampStaff(
  userId: string,
  campId: string,
): Promise<boolean> {
  const [result] = await db
    .select({ role: memberToCamp.role })
    .from(memberToCamp)
    .where(
      and(eq(memberToCamp.userId, userId), eq(memberToCamp.campId, campId)),
    )
    .limit(1);

  return result?.role === 'Owner' || result?.role === 'Staff';
}

/**
 * Get all staff user IDs for a camp
 * Used for broadcasting location updates to staff
 */
export async function getCampStaffIds(campId: string): Promise<string[]> {
  const result = await db
    .select({ userId: memberToCamp.userId })
    .from(memberToCamp)
    .where(
      and(
        eq(memberToCamp.campId, campId),
        sql`${memberToCamp.role} IN ('Owner', 'Staff')`,
      ),
    );

  return result.map((r) => r.userId).filter((id): id is string => id !== null);
}

/**
 * Update user location with latitude/longitude
 */
export async function updateUserLocation(
  userId: string,
  campId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await db
    .insert(location)
    .values({
      userId,
      campId,
      latitude,
      longitude,
      lastUpdated: new Date(),
    })
    .onConflictDoUpdate({
      target: location.userId,
      set: {
        campId,
        latitude,
        longitude,
        lastUpdated: new Date(),
      },
    });
}

/**
 * Check if user is member of a group
 * Used for validating group room join/leave
 */
export async function isUserGroupMember(
  userId: string,
  groupId: string,
): Promise<boolean> {
  const [result] = await db
    .select()
    .from(memberToCamp)
    .where(
      and(eq(memberToCamp.userId, userId), eq(memberToCamp.groupId, groupId)),
    )
    .limit(1);

  return !!result;
}
/**
 * Get all group members before deleting group
 * Used for notifying all members that group was ended
 */
export async function getGroupMembers(
  groupId: string,
): Promise<{ userId: string; userName: string }[]> {
  const result = await db
    .select({ userId: memberToCamp.userId })
    .from(memberToCamp)
    .where(eq(memberToCamp.groupId, groupId));

  return result
    .filter((r): r is { userId: string } => r.userId !== null)
    .map((r) => ({
      userId: r.userId,
      userName: '', // Will be populated from socket.data if available
    }));
}

/**
 * End group - update all members and delete group
 * Used when group is ended via socket
 */
export async function endGroup(groupId: string): Promise<void> {
  // Remove ALL users from this group (set groupId to null for all members)
  await db
    .update(memberToCamp)
    .set({ groupId: null })
    .where(eq(memberToCamp.groupId, groupId));

  // Delete the group entity
  // Note: We do NOT remove users from chatMember
  // All members can still view old messages but cannot send/receive new ones
  await db.delete(group).where(eq(group.id, groupId));
}

/**
 * Get all camp member locations
 * Used for staff/owner to see all locations
 */
export async function getAllCampLocations(
  campId: string,
): Promise<
  { userId: string; latitude: number; longitude: number; lastUpdated: Date }[]
> {
  const result = await db
    .select({
      userId: location.userId,
      latitude: location.latitude,
      longitude: location.longitude,
      lastUpdated: location.lastUpdated,
    })
    .from(location)
    .where(eq(location.campId, campId));

  return result.filter(
    (
      r,
    ): r is {
      userId: string;
      latitude: number;
      longitude: number;
      lastUpdated: Date;
    } =>
      r.userId !== null &&
      r.latitude !== null &&
      r.longitude !== null &&
      r.lastUpdated !== null,
  );
}

/**
 * Get visible locations for regular user (non-staff)
 * Returns staff locations + group members' locations
 */
export async function getVisibleLocationsForRegularUser(
  userId: string,
  campId: string,
): Promise<
  { userId: string; latitude: number; longitude: number; lastUpdated: Date }[]
> {
  // Get user's groupId
  const [userMember] = await db
    .select({ groupId: memberToCamp.groupId })
    .from(memberToCamp)
    .where(
      and(eq(memberToCamp.userId, userId), eq(memberToCamp.campId, campId)),
    )
    .limit(1);

  const groupId = userMember?.groupId;

  // Get staff user IDs
  const staffIds = await getCampStaffIds(campId);

  // Build list of user IDs to get locations for
  let visibleUserIds = [...staffIds];

  // If user is in a group, add group members
  if (groupId) {
    const groupMembers = await db
      .select({ userId: memberToCamp.userId })
      .from(memberToCamp)
      .where(eq(memberToCamp.groupId, groupId));

    const groupUserIds = groupMembers
      .map((m) => m.userId)
      .filter((id): id is string => id !== null);

    visibleUserIds = [...visibleUserIds, ...groupUserIds];
  }

  // Remove duplicates
  visibleUserIds = [...new Set(visibleUserIds)];

  // If no visible users, return empty array
  if (visibleUserIds.length === 0) {
    return [];
  }

  // Get locations for visible users
  const result = await db
    .select({
      userId: location.userId,
      latitude: location.latitude,
      longitude: location.longitude,
      lastUpdated: location.lastUpdated,
    })
    .from(location)
    .where(
      and(
        eq(location.campId, campId),
        inArray(location.userId, visibleUserIds),
      ),
    );

  return result.filter(
    (
      r,
    ): r is {
      userId: string;
      latitude: number;
      longitude: number;
      lastUpdated: Date;
    } =>
      r.userId !== null &&
      r.latitude !== null &&
      r.longitude !== null &&
      r.lastUpdated !== null,
  );
}
