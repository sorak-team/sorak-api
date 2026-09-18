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
router.post(
router.get('/:id/holidays', authMiddleware, asyncHandler(listHolidays));
router.post(
router.post(
router.patch(

  '/:id/close-enrollments',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(closeRemainingEnrollments),
);
  '/:id/execute-transition',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(executeTransition),
);

// Holidays & Academic Calendar endpoints
  '/:id/holidays',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(createHoliday),
);
  '/:id/holidays/import',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(importHolidays),
);
  '/:id/holidays/:holidayId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(updateHoliday),
);
  '/:id/holidays/:holidayId',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteHoliday),
);

// Read operations: Accessible by all authenticated users (Admin, Teachers, Parents)
  '/',
  authMiddleware,
  validate(querySchoolYearSchema, 'query'),
  asyncHandler(listSchoolYears),
);

// Write operations: Strictly restricted to ADMIN_BGH (School Management)
  '/',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createSchoolYearSchema),
  asyncHandler(createSchoolYear),
);

  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateSchoolYearSchema),
  asyncHandler(updateSchoolYear),
);

  '/:id/activate',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(activateSchoolYear),
);

  '/:id/complete',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(completeSchoolYear),
);

  '/:id',
  authMiddleware,
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteSchoolYear),
);

export default router;
