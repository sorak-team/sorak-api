import { Router } from 'express';
import attendanceController from '../controllers/attendance.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);
router.get('/classes/:classId/timetable', attendanceController.getTimetableOverview);
router.post('/classes/:classId/records', attendanceController.updateAttendance);
router.delete('/classes/:classId/records', attendanceController.clearAttendance);
router.get('/classes/:classId/dismissal', attendanceController.getDismissalOverview);
router.post('/classes/:classId/dismissal', attendanceController.recordDismissal);
router.delete('/classes/:classId/dismissal', attendanceController.clearAllDismissals);





export default router;
