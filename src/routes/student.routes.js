import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRoles } from '../middlewares/roles.js';
import {
  createStudentSchema,
  updateStudentSchema,
  queryStudentSchema,
  assignStudentClassSchema,
  transferStudentClassSchema,
  parentSchema,
  updateParentSchema,
} from '../validators/student.schema.js';
import {
  listStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  enrollStudent,
  transferStudent,
  addParent,
  updateParent,
  deleteParent,
} from '../controllers/student.controller.js';

const router = Router();

// Read operations: Available to authenticated school staff
router.get('/', authMiddleware, validate(queryStudentSchema, 'query'), asyncHandler(listStudents));

router.get('/:id', authMiddleware, asyncHandler(getStudentById));

// Write operations: Strictly restricted to PRINCIPAL_BGH / TEACHER_GV
router.post(
  '/',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createStudentSchema),
  asyncHandler(createStudent),
);

router.patch(
  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateStudentSchema),
  asyncHandler(updateStudent),
);

router.delete(
  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteStudent),
);

// Classroom Enrollment & Transfers
router.post(
  '/:id/enroll',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(assignStudentClassSchema),
  asyncHandler(enrollStudent),
);

router.post(
  '/:id/transfer',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(transferStudentClassSchema),
  asyncHandler(transferStudent),
);

// Parent / Guardian CRUD
router.post(
  '/:id/parents',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(parentSchema),
  asyncHandler(addParent),
);

router.patch(
  '/:id/parents/:parentId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateParentSchema),
  asyncHandler(updateParent),
);

router.delete(
  '/:id/parents/:parentId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteParent),
);

export default router;
