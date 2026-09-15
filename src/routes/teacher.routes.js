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
router.post(
router.patch(
router.delete(



// Write operations: Strictly restricted to ADMIN_BGH
  '/',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createTeacherSchema),
  asyncHandler(createTeacher),
);

  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateTeacherSchema),
  asyncHandler(updateTeacher),
);

  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteTeacher),
);

// Classroom Allocations
  '/:id/classes',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(assignTeacherClassSchema),
  asyncHandler(assignTeacherToClass),
);

  '/:id/classes/:classId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(removeTeacherFromClass),
);

export default router;
