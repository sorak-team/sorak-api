import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Unauthorized } from '../utils/http-error.js';
import prisma from '../config/prisma.js';

const ACCESS_COOKIE = 'sorak_access';
const REFRESH_COOKIE_NAME = 'sorak_refresh';

export async function authMiddleware(req, res, next) {
  // Authorization header takes precedence over cookie so multi-child account switching works seamlessly
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() ||
    req.cookies?.[ACCESS_COOKIE];

  if (!token) {
    return next(Unauthorized('Missing access token'));
  }
  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);

    const account = await prisma.account.findFirst({
      where: {
        OR: [
          { public_id: String(payload.sub) },
          { account_id: /^\d+$/.test(String(payload.sub)) ? BigInt(payload.sub) : -1n },
        ],
        deleted_at: null,
      },
      select: {
        account_id: true,
        public_id: true,
        role: true,
        is_active: true,
        password_changed_at: true,
      },
    });

    if (!account) {
      return next(Unauthorized('Tài khoản không tồn tại'));
    }

    if (!account.is_active) {
      const err = Unauthorized('Tài khoản đã bị tạm khóa');
      err.code = 'ACCOUNT_LOCKED';
      return next(err);
    }

    if (payload.role && account.role !== payload.role) {
      const err = Unauthorized('Vai trò tài khoản của bạn đã thay đổi. Vui lòng đăng nhập lại.');
      err.code = 'ROLE_CHANGED';
      return next(err);
    }

    // Tester_24 Item 1: Invalidate all sessions/tokens issued before the latest password change
    if (account.password_changed_at && payload.iat) {
      const pwdChangedSec = Math.floor(new Date(account.password_changed_at).getTime() / 1000);
      if (payload.iat < pwdChangedSec - 1) {
        const err = Unauthorized('Mật khẩu của bạn đã được thay đổi. Vui lòng đăng nhập lại.');
        err.code = 'PASSWORD_CHANGED';
        return next(err);
      }
    }

    // Tester_24 Item 2: Immediate revocation check for active sessions (when 4th session kicks out 1st)
    if (payload.sid && /^\d+$/.test(String(payload.sid))) {
      const session = await prisma.refreshToken.findUnique({
        where: { token_id: BigInt(payload.sid) },
        select: { is_revoked: true, expires_at: true },
      });
      if (!session || session.is_revoked || session.expires_at < new Date()) {
        const err = Unauthorized('Phiên đăng nhập đã bị vô hiệu hóa hoặc đăng xuất từ thiết bị khác.');
        err.code = 'SESSION_REVOKED';
        return next(err);
      }
    }

    req.user = {
      sub: account.public_id || payload.sub,
      role: account.role,
      accountId: account.account_id.toString(),
      sessionId: payload.sid ? String(payload.sid) : null,
    };
    next();
  } catch (err) {
    if (['ROLE_CHANGED', 'ACCOUNT_LOCKED', 'PASSWORD_CHANGED', 'SESSION_REVOKED'].includes(err.code)) {
      return next(err);
    }
    next(Unauthorized('Invalid or expired token'));
  }
}

/**
 * Flexible authentication for mobile push device token unregistration:
 * Allows unregistering push tokens even when:
 * 1. The session was revoked remotely (SESSION_REVOKED) e.g. limit 3 sessions, logout all devices, password change.
 * 2. The access token expired, as long as its cryptographic signature is valid.
 * 3. The client supplies refreshToken (even if revoked/expired) in request body or cookie.
 */
export async function flexibleDeviceTokenAuth(req, res, next) {
  try {
    const rawAuth = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    const rawRefresh = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE_NAME];

    // Case 1: Bearer token is provided
    if (rawAuth) {
      let payload = null;
      try {
        payload = jwt.verify(rawAuth, env.jwt.accessSecret);
      } catch {
        try {
          payload = jwt.verify(rawAuth, env.jwt.accessSecret, { ignoreExpiration: true });
        } catch {
          payload = null;
        }
      }

      if (payload?.sub) {
        const isNumericSub = /^\d+$/.test(String(payload.sub));
        const account = await prisma.account.findFirst({
          where: {
            OR: [
              { public_id: String(payload.sub) },
              { account_id: isNumericSub ? BigInt(payload.sub) : -1n },
            ],
            deleted_at: null,
          },
          select: { account_id: true, public_id: true, role: true },
        });

        if (account) {
          req.user = {
            sub: account.public_id,
            role: account.role,
            accountId: account.account_id.toString(),
            sessionId: payload.sid ? String(payload.sid) : null,
          };
          return next();
        }
      }
    }

    // Case 2: refreshToken is provided
    if (rawRefresh && typeof rawRefresh === 'string' && rawRefresh.trim()) {
      const tokenHash = crypto.createHash('sha256').update(rawRefresh.trim()).digest('hex');
      const session = await prisma.refreshToken.findFirst({
        where: { token_hash: tokenHash },
        include: { account: true },
      });

      if (session?.account && !session.account.deleted_at) {
        req.user = {
          sub: session.account.public_id,
          role: session.account.role,
          accountId: session.account.account_id.toString(),
          sessionId: String(session.token_id),
        };
        return next();
      }
    }

    return next(Unauthorized('Missing or invalid authentication token for unregistering device'));
  } catch (err) {
    return next(err);
  }
}

