import express from 'express';
//region Controllers
import * as authController from '../../controllers/authController';
import * as campController from '../../controllers/campController';
import * as chatController from '../../controllers/chatController';
import * as selfController from '../../controllers/selfController';
import * as userController from '../../controllers/userController';
import * as groupController from '../../controllers/groupController';
import * as roomController from '../../controllers/roomController';
//endregion

const router = express.Router();
router.use(authController.protect);

//region defining routes

//region camp routes
router
  .route('/')
  .get(campController.getMyCamps)
  .post(campController.createCamp);

router
  .route('/:id')
  .get(
    authController.restrictToCampRole('Owner', 'Staff', 'Camper', 'Pending'),
    campController.getMyCamp,
  )
  .patch(
    authController.restrictToCampRole('Owner'),
    campController.updateCamp,
    campController.updateJoinQRCode,
  )
  .delete(
    authController.restrictToCampRole('Owner'),
    campController.deleteCamp,
  );

router.get('/:id/owner', authController.restrictToCampRole('Staff', 'Camper'), campController.getCampOwner);

router.post('/:code', selfController.joinCamp);

router
  .delete('/:id/leave',
    authController.restrictToCampRole('Staff', 'Camper', 'Pending'),
    campController.leaveCamp,
  );

router
  .get('/:id/participants',
    authController.restrictToCampRole('Owner', 'Staff', 'Camper'),
    campController.getCampUsers,
  );

router
  .post('/:id/location',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    campController.updateLocation,
  );
//endregion

//region management routes
router
  .route('/:campId/participants/:userId')
  .get(authController.restrictToCampRole('Owner'), campController.getCampUser)
  .patch(
    authController.restrictToCampRole('Owner'),
    campController.changeUserRole,
  )
  .delete(
    authController.restrictToCampRole('Owner'),
    userController.removeUserFromCamp,
  );

router
  .route('/:id/payments')
  .get(
    authController.roleSwitcher([
      { role: 'Owner', func: campController.getCampPayments },
      { role: 'Camper', func: selfController.getMyCampPayments },
    ],{
      message: "You do not have payments regarding this camp since you are a staff",
      code: 403,
    }),
  )
  .post(
    authController.restrictToCampRole('Owner'),
    campController.addPaymentToCamp,
  );

router
  .route('/:campId/payments/:paymentId')
  .patch(
    authController.restrictToCampRole('Owner'),
    campController.updatePayment,
  )
  .delete(
    authController.restrictToCampRole('Owner'),
    campController.deletePayment,
  );

router
  .patch('/:campId/participants/:userId/payments/:paymentId', authController.restrictToCampRole('Owner'), userController.setPayment);

//endregion

//region room routes
router
  .route('/:id/rooms')
  .get(
    authController.restrictToCampRole('Staff', 'Owner'),
    roomController.getCampRooms,
  )
  .post(
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    roomController.createRoom,
  );

router
  .post('/:id/rooms/:code',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    roomController.joinRoom,
  );

// TODO: Implementing room management endpoints - Work in progress
router
  .patch('/:id/rooms/:roomId',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    roomController.updateRoom,
  );

router
  .delete('/:id/rooms/leave',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    roomController.leaveRoom,
  );
//endregion

//region group routes
router
  .route('/:id/groups')
  .get(
    authController.restrictToCampRole('Staff', 'Owner'),
    groupController.getCampGroups,
  )
  .post(
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    groupController.createGroup,
  );

router
  .post('/:id/groups/:code',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    groupController.joinGroup,
  );

router
  .get('/:campId/groups/:groupId',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    groupController.getCampGroup,
  );

// TODO: Implementing group management endpoints - Work in progress
router
  .patch('/:id/groups/:groupId',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    groupController.updateGroup,
  );

router
  .delete('/:id/groups/leave',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    groupController.leaveGroup,
  );

router.get(
  '/:id/joinQrCode',
  authController.restrictToCampRole('Owner', 'Staff', 'Camper', 'Pending'),
  campController.getJoinQRCode,
);
//endregion

//region chat routes
// TODO: Implementing chat management endpoints - Work in progress
router
  .get('/:id/chats',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    chatController.getMyCampChats,
  );

router
  .get('/:id/chats/:chatId',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    chatController.getChat,
  );

router
  .delete('/:id/chats/:chatId/leave',
    authController.restrictToCampRole('Camper', 'Staff', 'Owner'),
    campController.leaveChat,
  );
//endregion

//endregion

export default router;
