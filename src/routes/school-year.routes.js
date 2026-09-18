import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRoles } from '../middlewares/roles.js';
import {
  createSchoolYearSchema,
  updateSchoolYearSchema,
  querySchoolYearSchema,
} from '../validators/school-year.schema.js';
import {
  listSchoolYears,
  getSchoolYearById,
  getActiveSchoolYear,
  createSchoolYear,
  updateSchoolYear,
  activateSchoolYear,
  completeSchoolYear,
  deleteSchoolYear,
  getTransitionReadiness,
  closeRemainingEnrollments,
  executeTransition,
  listHolidays,
  createHoliday,
  importHolidays,
  updateHoliday,
  deleteHoliday,
} from '../controllers/school-year.controller.js';

const router = Router();

// Transition & Readiness endpoints
router.get('/:id/transition-readiness', authMiddleware, asyncHandler(getTransitionReadiness));
router.post(
  '/:id/close-enrollments',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(closeRemainingEnrollments),
);
router.post(
  '/:id/execute-transition',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(executeTransition),
);

// Holidays & Academic Calendar endpoints
router.get('/:id/holidays', authMiddleware, asyncHandler(listHolidays));
router.post(
  '/:id/holidays',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(createHoliday),
);
router.post(
  '/:id/holidays/import',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(importHolidays),
);
router.patch(
  '/:id/holidays/:holidayId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(updateHoliday),
);
router.delete(
  '/:id/holidays/:holidayId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteHoliday),
);

// Read operations: Accessible by all authenticated users (Admin, Teachers, Parents)
router.get(
  '/',
  authMiddleware,
  validate(querySchoolYearSchema, 'query'),
  asyncHandler(listSchoolYears),
);
router.get('/active', authMiddleware, asyncHandler(getActiveSchoolYear));
router.get('/:id', authMiddleware, asyncHandler(getSchoolYearById));

// Write operations: Strictly restricted to ADMIN_BGH (School Management)
router.post(
  '/',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createSchoolYearSchema),
  asyncHandler(createSchoolYear),
);

router.patch(
  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateSchoolYearSchema),
  asyncHandler(updateSchoolYear),
);

router.patch(
  '/:id/activate',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(activateSchoolYear),
);

router.patch(
  '/:id/complete',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(completeSchoolYear),
);

router.delete(
  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteSchoolYear),
);

export default router;
