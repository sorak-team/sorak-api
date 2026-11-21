import { Router } from 'express';
import attendanceController from '../controllers/attendance.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);

router.get('/export/excel', attendanceController.exportAttendanceExcel);
router.get('/classes/:classId/export/excel', attendanceController.exportAttendanceExcel);
router.get('/classes/:classId/stats', attendanceController.getClassAttendanceStats);
router.get('/classes/:classId/timetable', attendanceController.getTimetableOverview);
router.post('/classes/:classId/records', attendanceController.updateAttendance);
router.delete('/classes/:classId/records', attendanceController.clearAttendance);
router.get('/classes/:classId/dismissal', attendanceController.getDismissalOverview);
router.post('/classes/:classId/dismissal', attendanceController.recordDismissal);
router.delete('/classes/:classId/dismissal', attendanceController.clearAllDismissals);
router.delete('/classes/:classId/dismissal/:studentId', attendanceController.cancelDismissal);
router.get('/classes/:classId/authorizations', attendanceController.getPickupAuthorizations);
router.post('/classes/:classId/authorizations', attendanceController.createPickupAuthorization);
router.get('/classes/:classId/students/:studentId/pickup-quota', attendanceController.getStudentPickupQuota);
router.get('/students/:studentId/pickup-quota', attendanceController.getStudentPickupQuota);
router.patch('/classes/:classId/authorizations/:authId/approve', attendanceController.approvePickupAuthorization);
router.patch('/classes/:classId/authorizations/:authId/reject', attendanceController.rejectPickupAuthorization);





export default router;
