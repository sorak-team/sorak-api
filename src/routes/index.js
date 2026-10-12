import { Router } from 'express';
import authRouter from './auth.routes.js';
import accountRouter from './account.routes.js';
import teacherRouter from './teacher.routes.js';
import schoolYearRouter from './school-year.routes.js';
import studentRouter from './student.routes.js';
import classRouter from './class.routes.js';
import curriculumRouter from './curriculum.routes.js';
import planningRouter from './planning.routes.js';
import attendanceRouter from './attendance.routes.js';
import healthRouter from './health.routes.js';
import uploadRouter from './upload.routes.js';
import assessmentRouter from './assessment.routes.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/accounts', accountRouter);
router.use('/teachers', teacherRouter);
router.use('/school-years', schoolYearRouter);
router.use('/students', studentRouter);
router.use('/classes', classRouter);
router.use('/curriculum', curriculumRouter);
router.use('/planning', planningRouter);
router.use('/attendance', attendanceRouter);
router.use('/health', healthRouter);
router.use('/upload', uploadRouter);
router.use('/assessment', assessmentRouter);

export default router;
