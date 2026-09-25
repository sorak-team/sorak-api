import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRoles } from '../middlewares/roles.js';
import {
  createClassSchema,
  updateClassSchema,
  queryClassSchema,
  allocateStudentsSchema,
  removeStudentsSchema,
  queryStudentPoolSchema,
  assignTeacherToClassSchema,
} from '../validators/class.schema.js';
import {
  listClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  assignTeacher,
  removeTeacher,
  getClassStudents,
  getStudentPool,
  allocateStudents,
  removeStudents,
  getHistorySources,
  getHistoryStudents,
  importStudents,
  getClassTeachers,
  updateTeacherRole,
  getClassTransfers,
  createTransferRequest,
  updateTransferStatus,
  getAllTransfers,
  getTransferById,
  createGlobalTransferRequest,
  getClassExportData,
  getDailyReport,
  saveStudentDailyReport,
  batchSaveDailyReport,
  getStudentReport,
} from '../controllers/class.controller.js';

const router = Router();

// Read operations: Available to all authenticated users

router.get('/', authMiddleware, validate(queryClassSchema, 'query'), asyncHandler(listClasses));
router.get(
router.get(
router.post(
router.patch(
router.get('/:id', authMiddleware, asyncHandler(getClassById));
router.post(
router.patch(
router.delete(
router.get('/:id/teachers', authMiddleware, asyncHandler(getClassTeachers));
router.post(
router.patch(
router.delete(
router.get('/:id/students', authMiddleware, asyncHandler(getClassStudents));
router.get('/:id/student-report', authMiddleware, asyncHandler(getStudentReport));
router.get('/:id/daily-report', authMiddleware, asyncHandler(getDailyReport));
router.put('/:id/daily-report/student', authMiddleware, asyncHandler(saveStudentDailyReport));
router.post('/:id/daily-report/batch', authMiddleware, asyncHandler(batchSaveDailyReport));
router.get(
router.post(
router.delete(
router.get('/:id/history-sources', authMiddleware, asyncHandler(getHistorySources));
router.get('/:id/history-students', authMiddleware, asyncHandler(getHistoryStudents));
router.post(
router.get('/:id/transfers', authMiddleware, asyncHandler(getClassTransfers));
router.post(
router.patch(


// Global transfer requests for BGH / Admin
  '/transfers/all',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(getAllTransfers),
);

  '/transfers/:transferId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(getTransferById),
);

  '/transfers',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(createGlobalTransferRequest),
);

  '/transfers/:transferId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(updateTransferStatus),
);


// Write operations: Strictly restricted to ADMIN_BGH
  '/',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createClassSchema),
  asyncHandler(createClass),
);

  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateClassSchema),
  asyncHandler(updateClass),
);

  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteClass),
);

// Teacher assignment endpoints from classroom perspective

  '/:id/teachers',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(assignTeacherToClassSchema),
  asyncHandler(assignTeacher),
);

  '/:id/teachers/:teacherId/role',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(updateTeacherRole),
);

  '/:id/teachers/:teacherId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(removeTeacher),
);

// Student Allocation & Pool endpoints

  '/:id/student-pool',
  authMiddleware,
  validate(queryStudentPoolSchema, 'query'),
  asyncHandler(getStudentPool),
);

  '/:id/students',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(allocateStudentsSchema),
  asyncHandler(allocateStudents),
);

  '/:id/students',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(removeStudentsSchema),
  asyncHandler(removeStudents),
);

// History sources & students

// Import students
  '/:id/import-students',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(importStudents),
);

// Transfer requests endpoints

  '/:id/transfers',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(createTransferRequest),
);

  '/:id/transfers/:transferId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(updateTransferStatus),
);

// Class Export Roster endpoint

export default router;

