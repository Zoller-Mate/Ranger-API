import express from 'express';
import * as authController from '../../controllers/authController';
import * as imageController from '../../controllers/imageController';

const router = express.Router();

// Public routes

router.post('/me/profilePicture',
  express.raw({
    type: 'application/octet-stream',
    limit: '5mb',
  }),
  authController.protect,
  imageController.uploadProfilePicture,
);

router.get('/camps/:id/joinQrCode/download',
  express.raw({
    type: 'application/octet-stream',
    limit: '5mb',
  }),
  authController.protect,
  authController.restrictToCampRole('Camper', 'Owner', 'Staff'),
  imageController.downloadCampQrCode,
);

// endregion

export default router;
