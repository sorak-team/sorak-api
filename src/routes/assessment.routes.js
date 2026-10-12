import { Router } from 'express';
import assessmentController from '../controllers/assessment.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);
router.get('/classes/:classId', assessmentController.getAssessmentOverview);



// Monthly Assessment (Sổ Bé Ngoan - Table 26)

// Semester Assessment (Đánh giá học kỳ - Table 27)

export default router;
