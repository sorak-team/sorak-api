import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRoles } from '../middlewares/roles.js';
import {
  createAccountSchema,
  updateAccountSchema,
  queryAccountSchema,
  resetPasswordSchema,
} from '../validators/account.schema.js';
import {
  listAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  toggleAccountStatus,
  resetAccountPassword,
  deleteAccount,
} from '../controllers/account.controller.js';

const router = Router();

// All Account Management endpoints require authentication and PRINCIPAL_BGH role

router.use(authMiddleware);


  '/:id/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(resetAccountPassword),
);

export default router;
