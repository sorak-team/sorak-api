import { Router } from 'express';
import assessmentController from '../controllers/assessment.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/classes/:classId/records', assessmentController.getSlotAssessmentRecords);
router.post('/classes/:classId/records', assessmentController.saveAssessmentRecords);
router.delete('/classes/:classId/records', assessmentController.clearAssessmentRecords);
router.get('/classes/:classId', assessmentController.getAssessmentOverview);

// Monthly Assessment (Sổ Bé Ngoan - Table 26)
router.get('/classes/:classId/monthly', assessmentController.getMonthlyAssessments);
router.post('/classes/:classId/monthly', assessmentController.saveMonthlyAssessments);
router.post('/classes/:classId/monthly/publish', assessmentController.publishMonthlyAssessments);

// Semester Assessment (Đánh giá học kỳ - Table 27)
router.get('/classes/:classId/semester', assessmentController.getSemesterAssessments);
router.post('/classes/:classId/semester', assessmentController.saveSemesterAssessments);
router.post('/classes/:classId/semester/publish', assessmentController.publishSemesterAssessments);

export default router;
