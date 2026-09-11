import { authService } from '../services/auth.service.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE_NAME = 'sorak_refresh';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const getCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax',
  maxAge: COOKIE_MAX_AGE,
});


export const login = async (req, res) => {
  const { identifier, password, role, captchaToken } = req.body;
  const deviceInfo = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket.remoteAddress;

  const result = await authService.login({
    identifier,
    password,
    role,
    captchaToken,
    deviceInfo,
    ipAddress,
  });

  // If account has 2FA enabled, return tempToken and masked email for OTP challenge
  if (result.requires2FA) {
    return res.success({
      requires2FA: true,
      tempToken: result.tempToken,
      emailMasked: result.emailMasked,
      message: result.message,
    });
  }

  // Set refresh token in secure httpOnly cookie
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());

  res.success({
    user: result.user,
    accessToken: result.accessToken,
  });
};

export const verify2FA = async (req, res) => {
  const { tempToken, otp } = req.body;
  const deviceInfo = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket.remoteAddress;

  const result = await authService.verify2FALogin({
    tempToken,
    otp,
    deviceInfo,
    ipAddress,
  });

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());

  res.success({
    user: result.user,
    accessToken: result.accessToken,
  });
};

export const requestEnable2FA = async (req, res) => {
  const result = await authService.requestEnable2FA(req.user.sub);
  res.success(result);
};

export const confirmEnable2FA = async (req, res) => {
  const { otp } = req.body;
  const result = await authService.confirmEnable2FA({
    publicId: req.user.sub,
    otp,
  });
  res.success(result);
};

export const disable2FA = async (req, res) => {
  const { password } = req.body;
  const result = await authService.disable2FA({
    publicId: req.user.sub,
    password,
  });
  res.success(result);
};

export const forgotPassword = async (req, res) => {
  const { identifier, email } = req.body;
  const result = await authService.forgotPassword({ identifier, email });
  res.success(result);
};

export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  const result = await authService.verifyOtp({ email, otp });
  res.success(result);
};

export const resetPassword = async (req, res) => {
  const { email, resetToken, password } = req.body;
  const result = await authService.resetPassword({ email, resetToken, password });
  res.success(result);
};

export const refreshToken = async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  const deviceInfo = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket.remoteAddress;

  const result = await authService.refreshToken({
    rawToken,
    deviceInfo,
    ipAddress,
  });

  // Update rotated refresh token in cookie
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());

  res.success({
    accessToken: result.accessToken,
  });
};

export const logout = async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

  const result = await authService.logout({ rawToken });

  // Clear cookie on client
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
  });

  res.success(result);
};

