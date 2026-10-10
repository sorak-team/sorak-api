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
router.post('/forgot-password', validate(forgotPasswordSchema), asyncHandler(forgotPassword));
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(verifyOtp));
router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(resetPassword));
router.post('/refresh', asyncHandler(refreshToken));
router.post('/logout', asyncHandler(logout));
router.get('/me', authMiddleware, asyncHandler(getMe));
router.get('/sessions', authMiddleware, asyncHandler(getSessions));
router.delete('/sessions/others', authMiddleware, asyncHandler(revokeOtherSessions));
router.delete('/sessions', authMiddleware, asyncHandler(revokeAllSessions));
router.delete('/sessions/:sessionId', authMiddleware, asyncHandler(revokeSession));
router.post('/2fa/request-enable', authMiddleware, asyncHandler(requestEnable2FA));
router.post(


// Protected Profile & Security Endpoints
  '/2fa/confirm-enable',
  authMiddleware,
  validate(confirmEnable2FASchema),
  asyncHandler(confirmEnable2FA),
);

export default router;
