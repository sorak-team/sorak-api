import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Unauthorized, Forbidden, Conflict } from '../utils/http-error.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

export class AuthService {
  _parseId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
  }
  _formatUser(account, isFirstLogin = false) {
    return {
      id: account.public_id || account.account_id.toString(),
      username: account.username,
      role: account.role,
      isActive: account.is_active,
      isFirstLogin,
      createdAt: account.created_at,
    };
  }
  _generateTokens(account) {
    const accessToken = jwt.sign(
      { sub: account.public_id || account.account_id.toString(), role: account.role, username: account.username },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn || '15m' }
    );
    const refreshToken = crypto.randomBytes(40).toString('hex');
    return { accessToken, refreshToken };
  }

  async login({ identifier, password, role, captchaToken, deviceInfo, ipAddress, rememberMe = true }) {
    const trimmedId = identifier.trim();

    // 1. Mandatory Bot & DDoS Shield (Cloudflare Turnstile Invisible Mode)
    // Blocks automated headless scripts, curl, and botnets before bcrypt or DB access
    const isBotChallengePassed = await this.verifyCaptchaToken(captchaToken, ipAddress);
    if (!isBotChallengePassed) {
      throw BadRequest(
        'Xác thực bảo vệ bot không hợp lệ. Vui lòng thử lại trên trình duyệt được hỗ trợ.',
        {
          botBlocked: true,
        },
      );
    }

    // 2. Query account strictly by username with linked profile
    const account = await prisma.account.findUnique({
      where: {
        username: trimmedId,
      },
      include: {
        teacher: {
          include: {
            teacher_classes: {
              where: { left_at: null },
              include: {
                class: {
                  include: {
                    school_year: true,
                  },
                },
              },
            },
          },
        },
        student: {
          include: {
            parents: true,
            student_enrollments: {
              where: { left_at: null },
              include: {
                class: {
                  include: {
                    teacher_classes: {
                      where: { left_at: null },
                      include: {
                        teacher: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // 3. Verify Password & Role
    // Mitigate Timing Attack / User Enumeration: if account doesn't exist, run dummy bcrypt comparison
    const hashToCompare = account ? account.password_hash : DUMMY_BCRYPT_HASH;
    const isPasswordValid = await bcrypt.compare(password, hashToCompare);

    const isRoleValid =
      account &&
      (((role === 'TEACHER_GV' || role === 'PRINCIPAL_BGH' || role === 'ADMIN_BGH') &&
        (account.role === 'TEACHER_GV' ||
          account.role === 'PRINCIPAL_BGH' ||
          account.role === 'ADMIN_BGH')) ||
        (role === 'PARENT_PH' && account.role === 'PARENT_PH') ||
        account.role === role);

    if (!account || !account.is_active || account.deleted_at || !isPasswordValid || !isRoleValid) {
      // 100% Uniform Response: Eliminates all username enumeration side-channels (Zero DB write)
      throw Unauthorized('Tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
    }

    // 4. Check if Two-Factor Authentication (2FA) is enabled for this account
    if (account.is_2fa_enabled) {
      const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = await bcrypt.hash(rawOtp, 10);

      // Invalidate previous LOGIN_2FA OTPs for this account
      await prisma.otpVerification.updateMany({
        where: {
          account_id: account.account_id,
          purpose: 'LOGIN_2FA',
          is_used: false,
        },
        data: { is_used: true },
      });

      const targetEmail =
        account.teacher?.email || `${account.username.toLowerCase()}@sorak.edu.vn`;

      // Save new OTP (5 minutes validity)
      await prisma.otpVerification.create({
        data: {
          account_id: account.account_id,
          email: targetEmail,
          otp_hash: otpHash,
          purpose: 'LOGIN_2FA',
          expires_at: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      logger.info(
        { username: account.username, email: targetEmail, otp: rawOtp },
        '🔐 [SORAK 2FA LOGIN] Generated 2FA verification code',
      );

      // Send branded OTP email via Resend
      await emailService.sendOtpEmail({
        to: targetEmail,
        otp: rawOtp,
        purpose: 'LOGIN_2FA',
        userName: account.username,
      });

      // Issue temporary 2FA token (5 minutes)
      const tempToken = jwt.sign(
        {
          sub: account.public_id,
          purpose: '2FA_LOGIN_PENDING',
          rememberMe: !!rememberMe,
        },
        env.jwt.accessSecret,
        { expiresIn: '5m' },
      );

      return {
        requires2FA: true,
        tempToken,
        emailMasked: maskEmail(targetEmail),
        message: 'Mã xác thực 2 bước gồm 6 chữ số đã được gửi tới email của bạn.',
      };
    }

    // 5. Normal single-step login flow if 2FA is NOT enabled
    const isFirstLogin = account.last_login_at === null;

    await prisma.account.update({
      where: { account_id: account.account_id },
      data: {
        last_login_at: new Date(),
      },
    });

    // 6. Generate Tokens
    const accessToken = jwt.sign(
      { sub: account.public_id, role: account.role },
      env.jwt.accessSecret,
      { expiresIn: env.jwt.accessTtl },
    );

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    await prisma.refreshToken.create({
      data: {
        account_id: account.account_id,
        token_hash: tokenHash,
        device_info: deviceInfo || 'Unknown Browser',
        ip_address: ipAddress || null,
        expires_at: new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000), // 30 days persistent login
      },
    });

    return {
      user: this._formatUser(account, isFirstLogin),
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async refreshToken({ rawToken, deviceInfo, ipAddress }) {
    if (!rawToken) {
      throw Unauthorized('Không tìm thấy refresh token');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const existingToken = await prisma.refreshToken.findFirst({
      where: {
        token_hash: tokenHash,
        is_revoked: false,
        expires_at: { gt: new Date() },
      },
      include: {
        account: true,
      },
    });

    if (!existingToken || !existingToken.account.is_active || existingToken.account.deleted_at) {
      throw Unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }

    // Revoke old token
    await prisma.refreshToken.update({
      where: { token_id: existingToken.token_id },
      data: { is_revoked: true },
    });

    // Create new rotated refresh token
    const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
    const newHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');

    await prisma.refreshToken.create({
      data: {
        account_id: existingToken.account_id,
        token_hash: newHash,
        device_info: deviceInfo || existingToken.device_info,
        ip_address: ipAddress || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Generate new Access Token
    const newAccessToken = jwt.sign(
      { sub: existingToken.account.public_id, role: existingToken.account.role },
      env.jwt.accessSecret,
      { expiresIn: env.jwt.accessTtl },
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  async logout({ rawToken }) {
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await prisma.refreshToken.updateMany({
        where: { token_hash: tokenHash },
        data: { is_revoked: true },
      });
    }

    return {
      message: 'Đăng xuất thành công',
    };
  }
}
export const authService = new AuthService();
export default authService;
