import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { querySchoolYearSchema } from '../validators/school-year.schema.js';
import { listSchoolYears, getSchoolYearById } from '../controllers/school-year.controller.js';

const router = Router();

router.get('/', authMiddleware, validate(querySchoolYearSchema, 'query'), asyncHandler(listSchoolYears));
router.get('/:id', authMiddleware, asyncHandler(getSchoolYearById));

export default router;
