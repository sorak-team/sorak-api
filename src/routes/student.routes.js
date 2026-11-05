import { Router } from 'express';
import multer from 'multer';
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
  getImportTemplate,
  previewImport,
  importStudents,
  exportStudentsExcel,
} from '../controllers/student.controller.js';

const router = Router();
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ==========================================
// IMPORT & EXPORT (Place before /:id)
// ==========================================

// Tải file mẫu nhập học sinh
router.get('/import/template', authMiddleware, requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'), asyncHandler(getImportTemplate));

// Xem trước dữ liệu và kiểm tra lỗi từ file Excel
router.post(
  '/import/preview',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  uploadExcel.single('file'),
  asyncHandler(previewImport),
);

// Thực thi nhập học sinh
router.post(
  '/import',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(importStudents),
);

// Xuất danh sách học sinh ra file Excel
router.get('/export/excel', authMiddleware, asyncHandler(exportStudentsExcel));

// ==========================================
// CRUD OPERATIONS
// ==========================================

// Read operations: Available to authenticated school staff
router.get('/', authMiddleware, validate(queryStudentSchema, 'query'), asyncHandler(listStudents));

router.get('/:id', authMiddleware, asyncHandler(getStudentById));

// Write operations: Strictly restricted to PRINCIPAL_BGH / ADMIN_BGH
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
