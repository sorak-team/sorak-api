import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import {
  loginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  verify2FASchema,
  confirmEnable2FASchema,
  disable2FASchema,
} from '../validators/auth.schema.js';
import {
  login,
  verify2FA,
  requestEnable2FA,
  confirmEnable2FA,
  disable2FA,
  forgotPassword,
  verifyOtp,
  resetPassword,
  refreshToken,
  logout,
  getMe,
  getSessions,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
} from '../controllers/auth.controller.js';

const router = Router();

// Public Authentication Endpoints

router.post('/login', validate(loginSchema), asyncHandler(login));
router.post('/verify-2fa', validate(verify2FASchema), asyncHandler(verify2FA));


// Protected Profile & Security Endpoints
  '/2fa/confirm-enable',
  authMiddleware,
  validate(confirmEnable2FASchema),
  asyncHandler(confirmEnable2FA),
);

export default router;
