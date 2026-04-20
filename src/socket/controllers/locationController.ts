import { Server as SocketIOServer, Socket } from 'socket.io';
import { db, location } from '../../db';
import * as locationModel from '../models/locationModel';
import * as campModel from '../../api/models/campModel';
import SocketError from '../../utils/socketError';
import { catchAsyncSocket } from '../../utils/catchAsync';
import { eq } from 'drizzle-orm';
import { getSocketServer } from '../manager';

/**
 * Location Controller
 * Handles real-time location updates via WebSocket
 */

/**
 * Update user location and broadcast to group members + staff
 * Privacy: Only group members and camp staff can see the location
 */
export const handleUpdateLocation = catchAsyncSocket(
  async (
    socket: Socket,
    io: SocketIOServer,
    {
      campId,
      groupId,
      latitude,
      longitude,
    }: {
      campId: string;
      groupId: string;
      latitude: number;
      longitude: number;
    },
  ): Promise<void> => {
    const userId = socket.data.userId;
    const userName = socket.data.userName;

    // Validate coordinates
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      SocketError.emit(socket, 'Invalid coordinates', 'VALIDATION_ERROR', 400);
      return;
    }

    const isStaff = await locationModel.isUserCampStaff(userId, campId);

    // Validate user is member of the group (non-staff)
    if (!isStaff) {
      const isMember = await locationModel.isUserGroupMember(userId, groupId);
      if (!isMember) {
        SocketError.emit(
          socket,
          'You are not a member of this group',
          'UNAUTHORIZED',
          403,
        );
        return;
      }
    }

    // Update location in database
    await locationModel.updateUserLocation(userId, campId, latitude, longitude);

    // Prepare broadcast data
    const locationData = {
      userId,
      campId,
      latitude,
      longitude,
      lastUpdated: new Date(),
    };

    if (isStaff) {
      // Staff/Owner location is visible to entire camp
      io.to(`camp:${campId}`).emit('locationUpdated', locationData);
      return;
    }

    // Broadcast to group members
    io.to(`group:${groupId}`).emit('locationUpdated', locationData);

    // Also broadcast to camp staff (they see all locations)
    if (groupId) {
      socket
        .to(`staff:${campId}`)
        .except(`group:${groupId}`)
        .emit('locationUpdated', locationData);
    } else {
      socket.to(`staff:${campId}`).emit('locationUpdated', locationData);
    }
  },
);

/**
 * API-triggered location update broadcast (background updates)
 * Emits to user's group and camp staff/owners who are online
 */
export const API_Socket_handleLocationUpdate = catchAsyncSocket(
  async (
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> => {
    const io = getSocketServer();
    if (!io) {
      return;
    }

    // Get user's current camp from stored location
    const [locationRow] = await db
      .select({ campId: location.campId })
      .from(location)
      .where(eq(location.userId, userId))
      .limit(1);

    const campId = locationRow?.campId ?? null;
    if (!campId) {
      return;
    }

    // Get user's group in this camp
    const memberData = await campModel.getMemberData(userId, campId);
    const groupId = memberData?.groupId ?? null;

    const locationData = {
      userId,
      campId,
      latitude,
      longitude,
      lastUpdated: new Date(),
    };

    const isStaff = await locationModel.isUserCampStaff(userId, campId);

    if (isStaff) {
      // Staff/Owner location is visible to entire camp
      io.to(`camp:${campId}`).emit('locationUpdated', locationData);
      return;
    }

    // Broadcast to group members (if user is in a group)
    if (groupId) {
      io.to(`group:${groupId}`).emit('locationUpdated', locationData);
    }

    // Broadcast to camp staff/owners
    if (groupId) {
      io.to(`staff:${campId}`)
        .except(`group:${groupId}`)
        .emit('locationUpdated', locationData);
    } else {
      io.to(`staff:${campId}`).emit('locationUpdated', locationData);
    }
  },
);
