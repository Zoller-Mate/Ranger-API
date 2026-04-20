import express from 'express';
//region Controllers
import * as authController from '../../controllers/authController';
//endregion

const router = express.Router();

//region defining routes
router.post('/forgotPassword', authController.forgotPassword);

router.post('/login', authController.login); //TODO: should also push it in the database with the deviceType

router.post('/logout', authController.logout); //TODO: should remove record from DB

router.post('/register', authController.register);

router.patch('/updatePassword/:auth', authController.updatePassword);

router.get('/verifyToken', authController.verifyToken);

router.get('/exists', authController.userExists);

router.post('/verifyEmail/:token', authController.verifyEmail);
//endregion

export default router;
