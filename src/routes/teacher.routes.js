import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRoles } from '../middlewares/roles.js';
import {
  createTeacherSchema,
  updateTeacherSchema,
  queryTeacherSchema,
  assignTeacherClassSchema,
} from '../validators/teacher.schema.js';
import {
  listTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  assignTeacherToClass,
  removeTeacherFromClass,
} from '../controllers/teacher.controller.js';

const router = Router();

// Read operations: Available to authenticated users (Admin, Teachers)
router.get('/', authMiddleware, validate(queryTeacherSchema, 'query'), asyncHandler(listTeachers));

router.get('/:id', authMiddleware, asyncHandler(getTeacherById));

// Write operations: Strictly restricted to ADMIN_BGH
router.post(
  '/',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createTeacherSchema),
  asyncHandler(createTeacher),
);

router.patch(
  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateTeacherSchema),
  asyncHandler(updateTeacher),
);

router.delete(
  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteTeacher),
);

// Classroom Allocations
router.post(
  '/:id/classes',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(assignTeacherClassSchema),
  asyncHandler(assignTeacherToClass),
);

router.delete(
  '/:id/classes/:classId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(removeTeacherFromClass),
);

export default router;
