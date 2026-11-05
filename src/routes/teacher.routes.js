import { Router } from 'express';
import multer from 'multer';
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
  getImportTemplate,
  previewImport,
  importTeachers,
  exportTeachersExcel,
} from '../controllers/teacher.controller.js';

const router = Router();
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ==========================================
// IMPORT & EXPORT (Place before /:id)
// ==========================================

// Tải file mẫu nhập giáo viên
router.get('/import/template', authMiddleware, requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'), asyncHandler(getImportTemplate));

// Xem trước dữ liệu và kiểm tra lỗi từ file Excel
router.post(
  '/import/preview',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  uploadExcel.single('file'),
  asyncHandler(previewImport),
);

// Thực thi nhập giáo viên
router.post(
  '/import',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(importTeachers),
);

// Xuất danh sách giáo viên ra file Excel
router.get('/export/excel', authMiddleware, asyncHandler(exportTeachersExcel));

// ==========================================
// CRUD OPERATIONS
// ==========================================

// Read operations: Available to authenticated users (Admin, Teachers)
router.get('/', authMiddleware, validate(queryTeacherSchema, 'query'), asyncHandler(listTeachers));

router.get('/:id', authMiddleware, asyncHandler(getTeacherById));

// Write operations: Strictly restricted to ADMIN_BGH / PRINCIPAL_BGH
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
