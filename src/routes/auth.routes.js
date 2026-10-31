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
  changePasswordSchema,
} from '../validators/auth.schema.js';
import {
  login,
  verify2FA,
  requestEnable2FA,
  confirmEnable2FA,
  disable2FA,
  changePassword,
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


// Protected Profile & Security Endpoints
router.post(
  '/change-password',
  authMiddleware,
  validate(changePasswordSchema),
  asyncHandler(changePassword),
);

router.post(
  '/2fa/request-enable',
  authMiddleware,
  asyncHandler(requestEnable2FA),
);

router.post(
  '/2fa/confirm-enable',
  authMiddleware,
  validate(confirmEnable2FASchema),
  asyncHandler(confirmEnable2FA),
);

router.post(
  '/2fa/disable',
  authMiddleware,
  validate(disable2FASchema),
  asyncHandler(disable2FA),
);

router.delete('/sessions/:sessionId', authMiddleware, asyncHandler(revokeSession));
router.delete('/sessions', authMiddleware, asyncHandler(revokeAllSessions));

export default router;
