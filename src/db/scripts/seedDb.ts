import './../../loadEnv';
import { db } from '../index';
import { user, userOnlineStatus } from '../schema/user';
import { camp, memberToCamp } from '../schema/camp';
import { chat, chatMember, message } from '../schema/chat';
import { room } from '../schema/room';
import { group } from '../schema/group';
import { payment, userPayment } from '../schema/payment';
import { hash } from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as campModel from '../../api/models/campModel';
// Mock data generators
const firstNames = [
  'Alice',
  'Bob',
  'Charlie',
  'Diana',
  'Edward',
  'Fiona',
  'George',
  'Hannah',
  'Isaac',
  'Julia',
  'Kevin',
  'Laura',
  'Michael',
  'Nina',
  'Oscar',
  'Patricia',
  'Quentin',
  'Rachel',
  'Steven',
  'Tina',
];

const lastNames = [
  'Adams',
  'Baker',
  'Chen',
  'Davis',
  'Evans',
  'Fisher',
  'Garcia',
  'Harris',
  'Ivers',
  'Jones',
  'Khan',
  'Lewis',
  'Miller',
  'Nelson',
  'O\'Brien',
  'Parker',
  'Quinn',
  'Roberts',
  'Smith',
  'Taylor',
];

const campNames = [
  'Summer Adventure Camp',
  'Tech Innovation Summit',
  'Wilderness Explorer',
  'Creative Arts Festival',
  'Leadership Training',
];

const sampleMessages = [
  'Hey everyone, how is it going?',
  'Great to meet you all here!',
  'Looking forward to this camp',
  'Anyone want to grab lunch together?',
  'What activities are on today?',
  'That was amazing! 🎉',
  'See you at the meeting point',
  'Had so much fun today!',
  'Who wants to play some games?',
  'Looking forward to tomorrow',
  'Great work on that project!',
  'Thanks for helping me out',
  'This is going to be awesome',
  'Excited about this!',
  'Let\'s make this unforgettable',
];

const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];

const paymentNames = [
  'Camp Registration Fee',
  'Accommodation & Board',
  'Activity Materials',
  'Equipment Rental',
  'Food & Beverages',
  'Transportation',
  'Insurance',
  'Merchandise Pack',
];

const currencies = ['HUF', 'EUR', 'USD'];

/**
 * Generates a random name
 */
function generateName(): string {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

/**
 * Generates a random email
 */
function generateEmail(index: number): string {
  return `user${index}@ranger.dev`;
}

/**
 * Generates a random date within a range
 */
function getRandomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

/**
 * Generates a random join code (6-12 characters)
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = Math.floor(Math.random() * 7) + 6; // 6-12
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generates a random color from the predefined list
 */
function getRandomColor(): string {
  return colors[Math.floor(Math.random() * colors.length)]??"#000000";
}

/**
 * Creates mock user with hashed password
 */
async function createMockUser(index: number) {
  const hashedPassword = await hash('Almafa01!', 12);

  return {
    id: uuidv4(),
    name: generateName(),
    email: generateEmail(index),
    password: hashedPassword,
    profilePic: null,
    dateOfBirth: getRandomDate(new Date('1990-01-01'), new Date('2008-12-31')).toISOString().split('T')[0],
    phoneNumber: `+36${Math.floor(Math.random() * 999999999999)}`,
    emergencyContact: `+36${Math.floor(Math.random() * 999999999999)}`,
    validated: true,
  };
}

/**
 * Seeds the database with mock data
 */
export async function seedDatabase() {
  try {
    console.log('Starting database seeding...');
    // Create 100 users
    console.log('Creating 100 users...');
    const users: any[] = [];
    for (let i = 0; i < 100; i++) {
      const newUser = await createMockUser(i);
      users.push(newUser);
    }

    await db.insert(user).values(users);
    console.log(`Created ${users.length} users`);

    // Create online status for all users
    const onlineStatuses = users.map((u) => ({
      userId: u.id,
      isOnline: Math.random() > 0.5,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    }));
    await db.insert(userOnlineStatus).values(onlineStatuses);

    // Create 5 camps
    console.log('Creating 5 camps...');
    const camps: any[] = [];
    const campUsers: Map<string, string[]> = new Map(); // campId -> userIds

    for (let c = 0; c < 5; c++) {
      const campStartDate = new Date('2026-06-01');
      const campEndDate = new Date('2026-08-31');

      // Create camp chats
      const campChat = await db.insert(chat).values({}).returning();
      const staffChat = await db.insert(chat).values({}).returning();

      const newCamp = {
        id: uuidv4(),
        name: `${campNames[c]} ${c + 1}`,
        startDate: getRandomDate(campStartDate, new Date('2026-07-01')).toISOString().split('T')[0],
        endDate: getRandomDate(new Date('2026-07-15'), campEndDate).toISOString().split('T')[0],
        minGroupSize: Math.floor(Math.random() * 3) + 2,
        chatId: campChat[0]?.id,
        staffChatId: staffChat[0]?.id,
        joinCode: generateJoinCode(),
      };

      camps.push(newCamp);
      campUsers.set(newCamp.id, []);
    }

    await db.insert(camp).values(camps);
    console.log(`Created ${camps.length} camps`);

    // Assign users to camps (each user in 1-4 camps)
    console.log('Assigning users to camps...');
    const memberToCampData: any[] = [];

    for (const u of users) {
      const numCamps = Math.floor(Math.random() * 4) + 1; // 1-4 camps
      const assignedCamps = new Set<number>();

      while (assignedCamps.size < numCamps) {
        assignedCamps.add(Math.floor(Math.random() * camps.length));
      }

      for (const campIndex of assignedCamps) {
        const campId = camps[campIndex].id;
        const campUsersList = campUsers.get(campId) || [];

        // Determine role: 1 owner, 2-5 staff, rest campers
        const campMembers = campUsersList.length;
        let role = 'Camper';

        if (campMembers === 0) {
          role = 'Owner'; // First user is owner
        } else if (campMembers < Math.floor(Math.random() * 4) + 2) {
          // Some staff members
          role = Math.random() > 0.5 ? 'Staff' : 'Camper';
        }

        memberToCampData.push({
          userId: u.id,
          campId: campId,
          roomId: null,
          groupId: null,
          role: role,
        });

        campUsersList.push(u.id);
        campUsers.set(campId, campUsersList);
      }
    }

    await db.insert(memberToCamp).values(memberToCampData);
    console.log(`Assigned users to camps`);

    // Create rooms and groups for each camp
    console.log('Creating rooms and groups...');
    const roomsToCreate: any[] = [];
    const groupsToCreate: any[] = [];
    const roomChatMembersData: any[] = [];
    const groupChatMembersData: any[] = [];

    for (const c of camps) {
      const campMemberIds = campUsers.get(c.id) || [];

      // Create 2-4 rooms per camp
      const numRooms = Math.floor(Math.random() * 3) + 2;
      for (let r = 0; r < numRooms; r++) {
        const roomChat = await db.insert(chat).values({}).returning();
        const newRoom = {
          id: uuidv4(),
          campId: c.id,
          chatId: roomChat[0]?.id,
          name: `Room ${r + 1}`,
          joinCode: generateJoinCode(),
          color: getRandomColor(),
        };
        roomsToCreate.push(newRoom);

        // Add some members to room chat
        const roomMembersCount = Math.floor(Math.random() * campMemberIds.length) + 1;
        const roomMembers = campMemberIds
          .sort(() => Math.random() - 0.5)
          .slice(0, roomMembersCount);

        for (const memberId of roomMembers) {
          roomChatMembersData.push({
            chatId: newRoom.chatId,
            userId: memberId,
            lastViewed: new Date(),
            joinedAt: new Date(),
          });
        }
      }

      // Create 1-3 groups per camp
      const numGroups = Math.floor(Math.random() * 3) + 1;
      for (let g = 0; g < numGroups; g++) {
        const groupChat = await db.insert(chat).values({}).returning();
        const newGroup = {
          id: uuidv4(),
          campId: c.id,
          chatId: groupChat[0]?.id,
          name: `Group ${g + 1}`,
          joinCode: generateJoinCode(),
          color: getRandomColor(),
        };
        groupsToCreate.push(newGroup);

        // Add some members to group chat
        const groupMembersCount = Math.floor(Math.random() * campMemberIds.length) + 1;
        const groupMembers = campMemberIds
          .sort(() => Math.random() - 0.5)
          .slice(0, groupMembersCount);

        for (const memberId of groupMembers) {
          groupChatMembersData.push({
            chatId: newGroup.chatId,
            userId: memberId,
            lastViewed: new Date(),
            joinedAt: new Date(),
          });
        }
      }

      // Add camp chat members
      for (const memberId of campMemberIds) {
        roomChatMembersData.push({
          chatId: c.chatId,
          userId: memberId,
          lastViewed: new Date(),
          joinedAt: new Date(),
        });

        // Add staff/owner to staff chat
        const memberRole = memberToCampData.find(
          (m) => m.userId === memberId && m.campId === c.id,
        )?.role;

        if (memberRole === 'Staff' || memberRole === 'Owner') {
          roomChatMembersData.push({
            chatId: c.staffChatId,
            userId: memberId,
            lastViewed: new Date(),
            joinedAt: new Date(),
          });
        }
      }
    }

    await db.insert(room).values(roomsToCreate);
    await db.insert(group).values(groupsToCreate);
    console.log(`Created ${roomsToCreate.length} rooms and ${groupsToCreate.length} groups`);

    // Add all chat members
    console.log('Adding chat members...');
    await db.insert(chatMember).values(roomChatMembersData);
    await db.insert(chatMember).values(groupChatMembersData);
    console.log(`Added ${roomChatMembersData.length + groupChatMembersData.length} chat members`);

    // Create payments for each camp
    console.log('Creating payments...');
    const paymentsToCreate: any[] = [];
    const userPaymentsToCreate: any[] = [];
    let totalPayments = 0;

    for (const c of camps) {
      const campMemberIds = campUsers.get(c.id) || [];

      //generate joinQRcodes for camps
      campModel.generateJoinQrCode(c.joinCode,c.id);

      // Create 2-4 payments per camp
      const numPayments = Math.floor(Math.random() * 3) + 2;
      for (let p = 0; p < numPayments; p++) {
        const paymentDueDate = getRandomDate(
          new Date(c.startDate),
          new Date(c.endDate),
        ).toISOString().split('T')[0];

        const newPayment = {
          id: uuidv4(),
          campId: c.id,
          name: paymentNames[Math.floor(Math.random() * paymentNames.length)],
          dueDate: paymentDueDate,
          amount: Math.floor(Math.random() * 100000) + 10000, // 10k-110k
          currency: currencies[Math.floor(Math.random() * currencies.length)],
        };

        paymentsToCreate.push(newPayment);
        totalPayments++;

        // Assign payment to campers only (not owners or staff)
        for (const memberId of campMemberIds) {
          const memberRole = memberToCampData.find(
            (m) => m.userId === memberId && m.campId === c.id,
          )?.role;

          // Only assign to campers
          if (memberRole === 'Camper') {
            userPaymentsToCreate.push({
              userId: memberId,
              paymentId: newPayment.id,
              isPaid: Math.random() > 0.6, // 40% paid, 60% unpaid
            });
          }
        }
      }
    }

    await db.insert(payment).values(paymentsToCreate);
    await db.insert(userPayment).values(userPaymentsToCreate);
    console.log(`Created ${totalPayments} payments with ${userPaymentsToCreate.length} payment assignments`);

    // Generate fake chat messages
    console.log('Generating fake chat messages...');
    let totalMessages = 0;

    for (const c of camps) {
      const campMemberIds = campUsers.get(c.id) || [];

      // Generate messages for camp chat
      const campChatMessages = Math.floor(Math.random() * 50) + 20; // 20-70 messages
      for (let m = 0; m < campChatMessages; m++) {
        const messageDate = getRandomDate(
          new Date(c.startDate),
          new Date(c.endDate),
        );
        const senderId =
          campMemberIds[Math.floor(Math.random() * campMemberIds.length)];

        await db.insert(message).values({
          id: uuidv4(),
          chatId: c.chatId,
          userId: senderId,
          body: {
            text: sampleMessages[Math.floor(Math.random() * sampleMessages.length)],
          },
          createdAt: messageDate,
        });

        totalMessages++;
      }

      // Generate messages for rooms
      for (const r of roomsToCreate.filter((ro) => ro.campId === c.id)) {
        const roomChatMembersList = roomChatMembersData.filter((cm) => cm.chatId === r.chatId);
        if (roomChatMembersList.length === 0) continue;

        const roomMessages = Math.floor(Math.random() * 30) + 10; // 10-40 messages
        for (let m = 0; m < roomMessages; m++) {
          const messageDate = getRandomDate(
            new Date(c.startDate),
            new Date(c.endDate),
          );
          const roomMemberIds = roomChatMembersList.map((cm) => cm.userId);
          const senderId = roomMemberIds[Math.floor(Math.random() * roomMemberIds.length)];

          await db.insert(message).values({
            id: uuidv4(),
            chatId: r.chatId,
            userId: senderId,
            body: {
              text: sampleMessages[Math.floor(Math.random() * sampleMessages.length)],
            },
            createdAt: messageDate,
          });

          totalMessages++;
        }
      }

      // Generate messages for groups
      for (const g of groupsToCreate.filter((gr) => gr.campId === c.id)) {
        const groupChatMembersList = groupChatMembersData.filter((cm) => cm.chatId === g.chatId);
        if (groupChatMembersList.length === 0) continue;

        const groupMessages = Math.floor(Math.random() * 25) + 5; // 5-30 messages
        for (let m = 0; m < groupMessages; m++) {
          const messageDate = getRandomDate(
            new Date(c.startDate),
            new Date(c.endDate),
          );
          const groupMemberIds = groupChatMembersList.map((cm) => cm.userId);
          const senderId = groupMemberIds[Math.floor(Math.random() * groupMemberIds.length)];

          await db.insert(message).values({
            id: uuidv4(),
            chatId: g.chatId,
            userId: senderId,
            body: {
              text: sampleMessages[Math.floor(Math.random() * sampleMessages.length)],
            },
            createdAt: messageDate,
          });

          totalMessages++;
        }
      }
    }

    console.log(`Generated ${totalMessages} messages`);

    console.log('\nDatabase seeding completed successfully!');
    console.log(`Summary:`);
    console.log(`   - Users: 100`);
    console.log(`   - Camps: 5`);
    console.log(`   - Rooms: ${roomsToCreate.length}`);
    console.log(`   - Groups: ${groupsToCreate.length}`);
    console.log(`   - Payments: ${totalPayments}`);
    console.log(`   - Payment Assignments: ${userPaymentsToCreate.length}`);
    console.log(`   - Messages: ${totalMessages}`);
    console.log(`\nDefault password for all users: Almafa01!`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seed function if this file is executed directly
if (require.main === module) {
  seedDatabase();
}
