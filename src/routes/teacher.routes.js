import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { queryTeacherSchema } from '../validators/teacher.schema.js';
import { listTeachers, getTeacherById } from '../controllers/teacher.controller.js';

const router = Router();

router.get('/', authMiddleware, validate(queryTeacherSchema, 'query'), asyncHandler(listTeachers));
router.get('/:id', authMiddleware, asyncHandler(getTeacherById));

export default router;
