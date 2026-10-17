import { Router } from 'express';
import parentController from '../controllers/parent.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);
router.get('/home', parentController.getHome);
router.get('/schedule', parentController.getSchedule);
router.get('/profile', parentController.getProfile);
router.get('/requests', parentController.getRequests);
router.post('/requests/pickup', parentController.createPickupRequest);
router.post('/requests/pickup/:requestId/cancel', parentController.cancelPickupRequest);



export default router;
