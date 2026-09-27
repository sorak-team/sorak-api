import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { queryStudentSchema } from '../validators/student.schema.js';
import { listStudents, getStudentById } from '../controllers/student.controller.js';

const router = Router();

// Read operations: Available to authenticated school staff
router.get('/', authMiddleware, validate(queryStudentSchema, 'query'), asyncHandler(listStudents));
router.get('/:id', authMiddleware, asyncHandler(getStudentById));

export default router;
