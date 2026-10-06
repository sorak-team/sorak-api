import { Router } from 'express';
import healthController from '../controllers/health.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);
router.get('/classes/:classId', healthController.getHealthOverview);



export default router;
