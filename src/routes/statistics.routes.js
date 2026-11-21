import { Router } from 'express';
import statisticsController from '../controllers/statistics.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware);

// Iteration 4: School-wide Statistics & Dashboard Overview
router.get('/overview', statisticsController.getSchoolOverview);
router.get('/school-wide', statisticsController.getSchoolOverview);
router.get('/students', statisticsController.getStudentStatistics);
router.get('/education-plans', statisticsController.getEducationPlanStatistics);
router.get('/child-assessments', statisticsController.getChildAssessmentStatistics);
router.get('/classes-attendance', statisticsController.getClassAttendanceOverview);
router.get('/children-needing-support', statisticsController.getChildrenNeedingSupport);
router.get('/children-outstanding', statisticsController.getChildrenWithOutstandingResults);

// Iteration 4: Export School-wide Statistics
router.get('/export/excel', statisticsController.exportStatisticsExcel);

export default router;
