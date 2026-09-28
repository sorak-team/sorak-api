import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRoles } from '../middlewares/roles.js';
import { queryStudentSchema, createStudentSchema } from '../validators/student.schema.js';
import { listStudents, getStudentById, createStudent } from '../controllers/student.controller.js';

const router = Router();

router.get('/', authMiddleware, validate(queryStudentSchema, 'query'), asyncHandler(listStudents));
router.get('/:id', authMiddleware, asyncHandler(getStudentById));
router.post('/', authMiddleware, requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'), validate(createStudentSchema), asyncHandler(createStudent));

export default router;
