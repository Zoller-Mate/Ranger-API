import express from 'express';
//region Controllers
import * as authController from '../../controllers/authController';
import * as selfController from '../../controllers/selfController';
import * as campController from '../../controllers/campController';
import * as userController from '../../controllers/userController';
import * as imageController from '../../controllers/imageController';
import * as notificationController from '../../controllers/notificationCotroller'
//endregion

const router = express.Router();
router.use(authController.protect);

//region defining routes
router
  .route('/')
  .get(selfController.getMyAccount)
  .patch(selfController.updateMyAccount)
  .delete(selfController.deleteMyAccount);

router.get('/chats', selfController.getMyChats);

router.get('/payments', selfController.getMyPayments);

router.patch('/changePassword', selfController.changePassword);

router.delete('/profilePicture', imageController.deleteProfilePicture);

router.route('/FCMTokens').post(notificationController.saveFCMToken).delete(notificationController.removeFCMToken);

//endregion

export default router;
