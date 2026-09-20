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
router.post(



// Write operations: Strictly restricted to PRINCIPAL_BGH / TEACHER_GV
  '/',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createStudentSchema),
  asyncHandler(createStudent),
);

  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(updateStudentSchema),
  asyncHandler(updateStudent),
);

  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteStudent),
);

// Classroom Enrollment & Transfers
  '/:id/enroll',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(assignStudentClassSchema),
  asyncHandler(enrollStudent),
);

  '/:id/transfer',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(transferStudentClassSchema),
  asyncHandler(transferStudent),
);

// Parent / Guardian CRUD
  '/:id/parents',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(parentSchema),
  asyncHandler(addParent),
);

  '/:id/parents/:parentId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(updateParentSchema),
  asyncHandler(updateParent),
);

  '/:id/parents/:parentId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteParent),
);

export default router;
