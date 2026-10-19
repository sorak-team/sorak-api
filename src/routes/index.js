import { Router } from 'express';
import authRouter from './auth.routes.js';
import schoolYearRouter from './school-year.routes.js';
import accountRouter from './account.routes.js';
import teacherRouter from './teacher.routes.js';
import classRouter from './class.routes.js';
import studentRouter from './student.routes.js';
import uploadRouter from './upload.routes.js';
import curriculumRouter from './curriculum.routes.js';
import planningRouter from './planning.routes.js';
import attendanceRouter from './attendance.routes.js';
import healthRouter from './health.routes.js';
import assessmentRouter from './assessment.routes.js';
import goodBehaviorRouter from './good-behavior.routes.js';
import parentRouter from './parent.routes.js';

const router = Router();

// Health Check
router.get('/health', (req, res) => {
  res.success({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Feature Modules
router.use('/auth', authRouter);
router.use('/school-years', schoolYearRouter);
router.use('/accounts', accountRouter);
router.use('/teachers', teacherRouter);
router.use('/classes', classRouter);
router.use('/students', studentRouter);
router.use('/upload', uploadRouter);
router.use('/curriculum', curriculumRouter);
router.use('/planning', planningRouter);
router.use('/attendance', attendanceRouter);
router.use('/student-health', healthRouter);
router.use('/assessment', assessmentRouter);
router.use('/good-behavior', goodBehaviorRouter);
router.use('/parent', parentRouter);

export default router;
