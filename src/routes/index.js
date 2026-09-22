import { Router } from 'express';
import authRouter from './auth.routes.js';
import accountRouter from './account.routes.js';
import teacherRouter from './teacher.routes.js';
import schoolYearRouter from './school-year.routes.js';
import studentRouter from './student.routes.js';
import classRouter from './class.routes.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/accounts', accountRouter);
router.use('/teachers', teacherRouter);
router.use('/school-years', schoolYearRouter);
router.use('/students', studentRouter);
router.use('/classes', classRouter);

export default router;
