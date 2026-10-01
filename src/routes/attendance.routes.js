import { Router } from 'express';
import attendanceController from '../controllers/attendance.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);
router.get('/classes/:classId/timetable', attendanceController.getTimetableOverview);
router.post('/classes/:classId/records', attendanceController.updateAttendance);





export default router;
