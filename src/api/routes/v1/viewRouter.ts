import express from 'express';
//region Controllers
import * as viewController from '../../controllers/viewController';
import * as authController from '../../controllers/authController';
//endregion


const router = express.Router();

//region defining routes
router.get('/',viewController.mainPageView);

router.get('/profile', authController.protect, viewController.profileView);

router.get('/camps', authController.protect, viewController.campsView);

router.get('/camps/:id', authController.protect, authController.roleSwitcher([{role: "Owner", func: viewController.campView},{role: "Staff", func: viewController.joinedCampView},{role: "Camper", func: viewController.joinedCampView}], {message: "You must be an accepted part of this camp to access this page!", code: 401}, true));

router.get('/payments', authController.protect, viewController.paymentView);

router.get('/passwordReset/:token', viewController.passwordResetView);

router.get('/confirmRegistration/:token', viewController.condirmRegistrationView);

router.get('/joinCamp/:code', viewController.joinCampView);

router.get('/docs/dev', viewController.devDocsView);

router.get('/docs/user', viewController.userDocsView);
//endregion


export default router;
