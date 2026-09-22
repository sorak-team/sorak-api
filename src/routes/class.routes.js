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

// Global transfer requests for BGH / Admin
router.get(
  '/transfers/all',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(getAllTransfers),
);

router.get(
  '/transfers/:transferId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(getTransferById),
);

router.post(
  '/transfers',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(createGlobalTransferRequest),
);

router.patch(
  '/transfers/:transferId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(updateTransferStatus),
);

router.get('/:id', authMiddleware, asyncHandler(getClassById));

// Write operations: Strictly restricted to ADMIN_BGH
router.post(
  '/',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createClassSchema),
  asyncHandler(createClass),
);

router.patch(
  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateClassSchema),
  asyncHandler(updateClass),
);

router.delete(
  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteClass),
);

// Teacher assignment endpoints from classroom perspective
router.get('/:id/teachers', authMiddleware, asyncHandler(getClassTeachers));

router.post(
  '/:id/teachers',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(assignTeacherToClassSchema),
  asyncHandler(assignTeacher),
);

router.patch(
  '/:id/teachers/:teacherId/role',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(updateTeacherRole),
);

router.delete(
  '/:id/teachers/:teacherId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(removeTeacher),
);

// Student Allocation & Pool endpoints
router.get('/:id/students', authMiddleware, asyncHandler(getClassStudents));
router.get('/:id/student-report', authMiddleware, asyncHandler(getStudentReport));
router.get('/:id/daily-report', authMiddleware, asyncHandler(getDailyReport));
router.put('/:id/daily-report/student', authMiddleware, asyncHandler(saveStudentDailyReport));
router.post('/:id/daily-report/batch', authMiddleware, asyncHandler(batchSaveDailyReport));

router.get(
  '/:id/student-pool',
  authMiddleware,
  validate(queryStudentPoolSchema, 'query'),
  asyncHandler(getStudentPool),
);

router.post(
  '/:id/students',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(allocateStudentsSchema),
  asyncHandler(allocateStudents),
);

router.delete(
  '/:id/students',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  validate(removeStudentsSchema),
  asyncHandler(removeStudents),
);

// History sources & students
router.get('/:id/history-sources', authMiddleware, asyncHandler(getHistorySources));
router.get('/:id/history-students', authMiddleware, asyncHandler(getHistoryStudents));

// Import students
router.post(
  '/:id/import-students',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(importStudents),
);

// Transfer requests endpoints
router.get('/:id/transfers', authMiddleware, asyncHandler(getClassTransfers));

router.post(
  '/:id/transfers',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(createTransferRequest),
);

router.patch(
  '/:id/transfers/:transferId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(updateTransferStatus),
);

// Class Export Roster endpoint
router.get('/:id/export-data', authMiddleware, asyncHandler(getClassExportData));

export default router;

