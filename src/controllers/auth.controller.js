import jwt from 'jsonwebtoken';
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

export const isMobileClient = (req) => {
  const platform = String(
    req.headers['x-client-platform'] ||
    req.headers['x-platform'] ||
    req.headers['x-client'] ||
    req.query?.platform ||
    ''
  ).toLowerCase().trim();
  return ['android', 'ios', 'mobile', 'react-native', 'flutter'].includes(platform);
};

export const login = async (req, res) => {
  const { username, identifier, password, role, captchaToken, isLinkingChild } = req.body;
  const loginUsername = (username || identifier || '').trim();
  const deviceInfo = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket.remoteAddress;
  const isMobile = isMobileClient(req);

  // Check if caller is authenticated user linking a child account
  let verifiedLinkingChild = false;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, env.jwt.accessSecret);
      if (decoded && (decoded.role === 'PARENT_PH' || decoded.role === 'ADMIN_BGH' || decoded.role === 'PRINCIPAL_BGH')) {
        verifiedLinkingChild = true;
      }
    } catch {
      // ignore invalid token
    }
  }

  const result = await authService.login({
    username: loginUsername,
    identifier: loginUsername,
    password,
    role,
    captchaToken,
    deviceInfo,
    ipAddress,
    isMobile,
    isLinkingChild: verifiedLinkingChild || Boolean(isLinkingChild),
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

  // Set refresh token in secure httpOnly cookie (for web browsers)
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());

  const responseData = {
    user: result.user,
    accessToken: result.accessToken,
  };

  if (isMobile) {
    responseData.refreshToken = result.refreshToken;
    responseData.accessExpiresAt = result.accessExpiresAt;
    responseData.sessionId = result.sessionId;
  }

  res.success(responseData);
};

export const verify2FA = async (req, res) => {
  const { tempToken, otp } = req.body;
  const deviceInfo = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket.remoteAddress;
  const isMobile = isMobileClient(req);

  const result = await authService.verify2FALogin({
    tempToken,
    otp,
    deviceInfo,
    ipAddress,
  });

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());

  const responseData = {
    user: result.user,
    accessToken: result.accessToken,
  };

  if (isMobile) {
    responseData.refreshToken = result.refreshToken;
    responseData.accessExpiresAt = result.accessExpiresAt;
    responseData.sessionId = result.sessionId;
  }

  res.success(responseData);
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

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const result = await authService.changePassword({
    publicId: req.user.sub,
    currentPassword,
    newPassword,
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
  const isMobile = isMobileClient(req);

  const result = await authService.refreshToken({
    rawToken,
    deviceInfo,
    ipAddress,
  });

  // Update rotated refresh token in cookie
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());

  const responseData = {
    accessToken: result.accessToken,
  };

  if (isMobile) {
    responseData.refreshToken = result.refreshToken;
    responseData.accessExpiresAt = result.accessExpiresAt;
    responseData.sessionId = result.sessionId;
  }

  res.success(responseData);
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

export const getMe = async (req, res) => {
  const result = await authService.getMe(req.user.sub);
  res.success(result);
};

export const getSessions = async (req, res) => {
  const currentRawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  const result = await authService.getSessions(req.user.sub, currentRawToken);
  res.success(result);
};

export const revokeSession = async (req, res) => {
  const { sessionId } = req.params;
  const result = await authService.revokeSession(req.user.sub, sessionId);
  res.success(result);
};

export const revokeOtherSessions = async (req, res) => {
  const currentRawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  const result = await authService.revokeOtherSessions(req.user.sub, currentRawToken);
  res.success(result);
};

export const revokeAllSessions = async (req, res) => {
  const result = await authService.revokeAllSessions(req.user.sub);
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
  });
  res.clearCookie('sorak_access', {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
  });
  res.success(result);
};

export const mobileChallenge = (req, res) => {
  // Allow Cloudflare Turnstile scripts and iframes without Helmet blocking
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https:;",
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Bảo mật Sorak Mobile</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
  <style>
    * { box-sizing: border-box; }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
      background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #334155;
    }
    .card {
      width: 100%;
      max-width: 360px;
      padding: 24px 20px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
      text-align: center;
    }
    .logo {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      border-radius: 12px;
      background: #4f46e5;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-weight: bold;
      font-size: 20px;
    }
    h2 {
      font-size: 1.15rem;
      margin: 0 0 8px;
      color: #0f172a;
    }
    p {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0 0 20px;
      line-height: 1.4;
    }
    #turnstile-widget {
      display: flex;
      justify-content: center;
      min-height: 65px;
    }
    .footer {
      margin-top: 16px;
      font-size: 0.75rem;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">S</div>
    <h2>Xác thực an toàn</h2>
    <p>Hệ thống mầm non Sorak đang tiến hành xác thực thiết bị trước khi tiếp tục.</p>
    <div id="turnstile-widget"></div>
    <div class="footer">Bảo vệ bởi Cloudflare Turnstile</div>
  </div>
  <script>
    function emitToken(token) {
      var msg = JSON.stringify({ type: 'TURNSTILE_TOKEN', token: token });
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      }
      if (window.FlutterChannel && window.FlutterChannel.postMessage) {
        window.FlutterChannel.postMessage(msg);
      }
      if (window.parent) {
        window.parent.postMessage(msg, '*');
      }
    }

    function emitError() {
      var msg = JSON.stringify({ type: 'TURNSTILE_ERROR' });
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      }
      if (window.FlutterChannel && window.FlutterChannel.postMessage) {
        window.FlutterChannel.postMessage(msg);
      }
      if (window.parent) {
        window.parent.postMessage(msg, '*');
      }
    }

    function renderWidget() {
      if (window.turnstile) {
        try {
          window.turnstile.render('#turnstile-widget', {
            sitekey: '0x4AAAAAAFJSrvza3ZMzppmy',
            callback: function(token) {
              emitToken(token);
            },
            'error-callback': function() {
              emitError();
            }
          });
        } catch(e) {
          console.error(e);
        }
      } else {
        setTimeout(renderWidget, 100);
      }
    }
    window.addEventListener('load', renderWidget);
  </script>
</body>
</html>`;
  res.send(html);
};
