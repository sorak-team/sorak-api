import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { queryClassSchema } from '../validators/class.schema.js';
import { listClasses, getClassById } from '../controllers/class.controller.js';

const router = Router();

router.get('/', authMiddleware, validate(queryClassSchema, 'query'), asyncHandler(listClasses));
router.get('/:id', authMiddleware, asyncHandler(getClassById));

export default router;
