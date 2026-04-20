import express from 'express';
import * as devController from '../../controllers/devController';
import { protectDevRoutes } from '../../controllers/authController';

const router = express.Router();

// Dev routes - only for development purposes
// Protected by DEV_API_KEY static password via header x-dev-password
router.use(protectDevRoutes);

// Logs routes
router.route('/logs').get(devController.getAvailableLogDates);
router.route('/logs/:date').get(devController.getLogsByDate);

router.route('/databasedump').get(devController.getDatabaseDump);

export default router;
