import { Router } from 'express';
import assessmentController from '../controllers/assessment.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);
router.get('/classes/:classId', assessmentController.getAssessmentOverview);
router.post('/classes/:classId/records', assessmentController.saveAssessmentRecords);
router.delete('/classes/:classId/records', assessmentController.clearAssessmentRecords);
router.get('/classes/:classId/monthly', assessmentController.getMonthlyAssessments);
router.post('/classes/:classId/monthly', assessmentController.saveMonthlyAssessments);
router.get('/classes/:classId/semester', assessmentController.getSemesterAssessments);



// Monthly Assessment (Sổ Bé Ngoan - Table 26)

// Semester Assessment (Đánh giá học kỳ - Table 27)

export default router;
