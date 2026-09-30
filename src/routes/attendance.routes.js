import { Router } from 'express';
import attendanceController from '../controllers/attendance.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);





export default router;
