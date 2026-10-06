import { Router } from 'express';
import healthController from '../controllers/health.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);
router.get('/classes/:classId', healthController.getHealthOverview);
router.post('/classes/:classId/records', healthController.saveHealthRecords);
router.delete('/classes/:classId/records', healthController.clearHealthRecords);



export default router;
