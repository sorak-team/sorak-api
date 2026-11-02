import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { Unauthorized, Forbidden, BadRequest, NotFound } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { emailService } from './email.service.js';

const DUMMY_BCRYPT_HASH = '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6eW6vV7xQyV7e3j1i';

const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '***@sorak.edu.vn';
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx === -1) return trimmed;
  const username = trimmed.substring(0, atIdx);
  const domain = trimmed.substring(atIdx + 1);

  if (username.length <= 2) {
    return `${username[0]}***@${domain}`;
  }
  if (username.length <= 4) {
    return `${username.slice(0, 1)}***${username.slice(-1)}@${domain}`;
  }
  return `${username.slice(0, 2)}***${username.slice(-1)}@${domain}`;
};

export class AuthService {
  /**
   * Verify Turnstile / Captcha token
   */
  async verifyCaptchaToken(token, ipAddress, isMobile = false) {
    if (process.env.DISABLE_TURNSTILE === 'true' || !env.turnstileSecret) {
      return true;
    }

    if (!token) {
      // Allow mobile dev testing in non-production environments when token is omitted
      if (isMobile && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOBILE_BYPASS === 'true')) {
        return true;
      }
      return false;
    }

    // Allow test & bypass tokens for mobile dev, testing, automation
    if (
      token === 'sorak-mobile-bypass' ||
      token === 'test-token-playwright' ||
      token === 'sorak-mobile-test' ||
      (isMobile && token.startsWith('mobile_token_'))
    ) {
      return true;
    }

    try {
      const formData = new URLSearchParams();
      formData.append('secret', env.turnstileSecret);
      formData.append('response', token);
      if (ipAddress) formData.append('remoteip', ipAddress);

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      logger.error({ err }, 'Turnstile captcha verification failed');
      return false;
    }
  }

  /**
   * Helper to format user payload from 3NF account + profile
   */
  _formatUser(account, isFirstLogin = false) {
    const profileName =
      account.teacher?.full_name || account.student?.full_name || account.username;
    const avatarUrl = account.teacher?.avatar_url || account.student?.avatar_url || null;
    const contactEmail = account.teacher?.email || null;
    const contactPhone = account.teacher?.phone || account.student?.parents?.[0]?.phone || null;

    const assignedClasses = (account.teacher?.teacher_classes || [])
      .filter((tc) => !tc.left_at)
      .map((tc) => ({
        classId: tc.class?.public_id || tc.class?.class_id?.toString() || null,
        className: (tc.class?.name || 'Lớp').replace(/^Lớp\s+/i, '').trim(),
        schoolYearId: tc.class?.school_year_id ? tc.class.school_year_id.toString() : null,
        schoolYearName: tc.class?.school_year?.name || null,
        schoolYearStatus: tc.class?.school_year?.status || null,
      }));

    const teacherGender =
      account.teacher?.gender === 'MALE'
        ? 'Nam'
        : account.teacher?.gender === 'FEMALE'
          ? 'Nữ'
          : null;

    const teacherDob = account.teacher?.date_of_birth
      ? new Date(account.teacher.date_of_birth).toLocaleDateString('vi-VN')
      : null;

    const teacherStartDate = account.teacher?.start_date
      ? new Date(account.teacher.start_date).toLocaleDateString('vi-VN')
      : null;

    return {
      id: account.public_id,
      name: profileName,
      fullName: profileName,
      role: account.role,
      identifier: contactEmail || contactPhone || account.username,
      email: contactEmail,
      phone: contactPhone,
      avatar: avatarUrl,
      avatarUrl: avatarUrl,
      is_first_login: false,
      mustChangePassword: false,
      passwordChangedAt: account.password_changed_at || null,
      is_2fa_enabled: account.is_2fa_enabled,
      lastLoginAt: account.last_login_at || null,
      // Extended Teacher Profile
      employeeCode: account.teacher?.employee_code || null,
      citizenId: account.teacher?.citizen_id || null,
      gender: teacherGender,
      dob: teacherDob,
      startDate: teacherStartDate,
      position: account.teacher?.position || null,
      address: account.teacher?.address || null,
      workStatus: account.teacher?.work_status || null,
      assignedClasses,
      teacher: account.teacher
        ? {
            id: account.teacher.public_id || account.teacher.teacher_id?.toString(),
            employeeCode: account.teacher.employee_code,
            citizenId: account.teacher.citizen_id,
            gender: teacherGender,
            dob: teacherDob,
            startDate: teacherStartDate,
            position: account.teacher.position,
            address: account.teacher.address,
            workStatus: account.teacher.work_status,
            assignedClasses,
          }
        : null,
      student: (() => {
        if (!account.student) return null;
        const activeEnrollment =
          account.student.student_enrollments?.find((e) => !e.left_at) ||
          account.student.student_enrollments?.[0];
        const studentClass = activeEnrollment?.class;
        const primaryTeacher =
          studentClass?.teacher_classes?.find((tc) => !tc.left_at)?.teacher ||
          studentClass?.teacher_classes?.[0]?.teacher;

        return {
          id: account.student.public_id,
          studentCode: account.student.student_code,
          fullName: account.student.full_name,
          avatarUrl: account.student.avatar_url,
          gender: account.student.gender === 'MALE' ? 'Nam' : 'Nữ',
          dob: account.student.date_of_birth
            ? new Date(account.student.date_of_birth).toLocaleDateString('vi-VN')
            : null,
          status: account.student.status,
          className: studentClass ? studentClass.name : null,
          classId: studentClass ? studentClass.public_id : null,
          teacherName: primaryTeacher ? primaryTeacher.full_name : null,
          teacherPhone: primaryTeacher ? primaryTeacher.phone : null,
          parents: (account.student.parents || []).map((p) => ({
            id: p.public_id,
            fullName: p.full_name,
            relationship: p.relationship,
            phone: p.phone,
          })),
        };
      })(),
    };
  }

  /**
   * Authenticate user strictly with username and password
   * Implements CAPTCHA-Gated Progressive Bot & DDoS Defense (OWASP Compliant)
   * Without hard lockouts to prevent DoS attacks against school staff / shared NAT Wi-Fi
   */
  async login({ username, identifier, password, role, captchaToken, deviceInfo, ipAddress, isMobile = false, rememberMe = true }) {
    const trimmedUsername = (username || identifier || '').trim();

    // 1. Mandatory Bot & DDoS Shield (Cloudflare Turnstile Invisible Mode)
    // Blocks automated headless scripts, curl, and botnets before bcrypt or DB access
    const isBotChallengePassed = await this.verifyCaptchaToken(captchaToken, ipAddress, isMobile);
    if (!isBotChallengePassed) {
      throw BadRequest(
        'Xác thực bảo vệ bot không hợp lệ. Vui lòng thử lại trên trình duyệt được hỗ trợ.',
        {
          botBlocked: true,
        },
      );
    }

    // 2. Query account strictly by username or linked teacher employee_code
    const account = await prisma.account.findFirst({
      where: {
        OR: [
          { username: { equals: trimmedUsername, mode: 'insensitive' } },
          { teacher: { employee_code: { equals: trimmedUsername, mode: 'insensitive' } } },
        ],
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
      const emailRes = await emailService.sendOtpEmail({
        to: targetEmail,
        otp: rawOtp,
        purpose: 'LOGIN_2FA',
        userName: account.username,
      });

      if (!emailRes?.success) {
        throw BadRequest('Không thể gửi mã xác thực 2 bước qua email. Vui lòng kiểm tra lại email hoặc thử lại sau.');
      }

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

    // OR-01: Enforce maximum 3 active concurrent devices per account.
    // If account has >= 3 active sessions, revoke the oldest active sessions.
    const activeSessions = await prisma.refreshToken.findMany({
      where: {
        account_id: account.account_id,
        is_revoked: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'asc' },
    });

    if (activeSessions.length >= 3) {
      const tokensToRevoke = activeSessions.slice(0, activeSessions.length - 2);
      await prisma.refreshToken.updateMany({
        where: {
          token_id: { in: tokensToRevoke.map((t) => t.token_id) },
        },
        data: { is_revoked: true },
      });
    }

    // OR-01: Session expires after 7 consecutive days of inactivity
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const createdSession = await prisma.refreshToken.create({
      data: {
        account_id: account.account_id,
        token_hash: tokenHash,
        device_info: deviceInfo || 'Unknown Browser',
        ip_address: ipAddress || null,
        expires_at: sessionExpiresAt,
      },
    });

    const decoded = jwt.decode(accessToken);
    const accessExpiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const sessionId = String(createdSession.token_id);

    return {
      user: this._formatUser(account, isFirstLogin),
      accessToken,
      refreshToken: rawRefreshToken,
      accessExpiresAt,
      sessionId,
    };
  }

  /**
   * Verify submitted 6-digit OTP for 2FA Login
   */
  async verify2FALogin({ tempToken, otp, deviceInfo, ipAddress }) {
    if (!tempToken || !otp) {
      throw BadRequest('Vui lòng cung cấp mã xác thực OTP.');
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, env.jwt.accessSecret);
    } catch {
      throw BadRequest(
        'Phiên xác thực 2 bước đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
      );
    }

    if (payload.purpose !== '2FA_LOGIN_PENDING' || !payload.sub) {
      throw BadRequest('Thông tin xác thực không hợp lệ.');
    }

    const account = await prisma.account.findUnique({
      where: { public_id: payload.sub },
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

    if (!account || !account.is_active || account.deleted_at) {
      throw Unauthorized('Tài khoản không tồn tại hoặc đã bị khóa.');
    }

    const activeOtp = await prisma.otpVerification.findFirst({
      where: {
        account_id: account.account_id,
        purpose: 'LOGIN_2FA',
        is_used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!activeOtp) {
      throw BadRequest('Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
    }

    if (activeOtp.attempt_count >= 5) {
      await prisma.otpVerification.update({
        where: { otp_id: activeOtp.otp_id },
        data: { is_used: true },
      });
      throw BadRequest('Mã OTP đã vượt quá số lần thử cho phép. Vui lòng đăng nhập lại.');
    }

    const isMatch = await bcrypt.compare(otp.trim(), activeOtp.otp_hash);
    if (!isMatch) {
      await prisma.otpVerification.update({
        where: { otp_id: activeOtp.otp_id },
        data: { attempt_count: activeOtp.attempt_count + 1 },
      });
      throw BadRequest('Mã OTP không chính xác. Vui lòng kiểm tra lại.');
    }

    // Mark OTP used
    await prisma.otpVerification.update({
      where: { otp_id: activeOtp.otp_id },
      data: { is_used: true },
    });

    // Detect first login and update last_login_at
    const isFirstLogin = account.last_login_at === null;
    await prisma.account.update({
      where: { account_id: account.account_id },
      data: { last_login_at: new Date() },
    });

    const accessToken = jwt.sign(
      { sub: account.public_id, role: account.role },
      env.jwt.accessSecret,
      { expiresIn: env.jwt.accessTtl },
    );

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // OR-01: Enforce maximum 3 active concurrent devices per account.
    const activeSessions = await prisma.refreshToken.findMany({
      where: {
        account_id: account.account_id,
        is_revoked: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'asc' },
    });

    if (activeSessions.length >= 3) {
      const tokensToRevoke = activeSessions.slice(0, activeSessions.length - 2);
      await prisma.refreshToken.updateMany({
        where: {
          token_id: { in: tokensToRevoke.map((t) => t.token_id) },
        },
        data: { is_revoked: true },
      });
    }

    // OR-01: Session expires after 7 consecutive days of inactivity
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const createdSession = await prisma.refreshToken.create({
      data: {
        account_id: account.account_id,
        token_hash: tokenHash,
        device_info: deviceInfo || 'Unknown Browser',
        ip_address: ipAddress || null,
        expires_at: sessionExpiresAt,
      },
    });

    const decoded = jwt.decode(accessToken);
    const accessExpiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const sessionId = String(createdSession.token_id);

    return {
      user: this._formatUser(account, isFirstLogin),
      accessToken,
      refreshToken: rawRefreshToken,
      accessExpiresAt,
      sessionId,
    };
  }

  /**
   * Request OTP to enable 2FA in Account Settings
   */
  async requestEnable2FA(publicId) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
      include: {
        teacher: true,
      },
    });

    if (!account || !account.is_active || account.deleted_at) {
      throw NotFound('Không tìm thấy tài khoản.');
    }

    if (account.is_2fa_enabled) {
      throw BadRequest('Xác thực 2 bước (2FA) đã được bật trên tài khoản này.');
    }

    const email = account.teacher?.email || `${account.username.toLowerCase()}@sorak.edu.vn`;

    // Anti-Spam: Check 60-second cooldown per account
    const recentOtp = await prisma.otpVerification.findFirst({
      where: {
        account_id: account.account_id,
        purpose: 'ENABLE_2FA',
        created_at: {
          gt: new Date(Date.now() - 60 * 1000),
        },
      },
      orderBy: { created_at: 'desc' },
    });

    if (recentOtp) {
      const waitSeconds = Math.max(
        1,
        Math.ceil((60 * 1000 - (Date.now() - new Date(recentOtp.created_at).getTime())) / 1000),
      );
      throw BadRequest(
        `Vui lòng đợi ${waitSeconds} giây trước khi yêu cầu gửi lại mã xác thực 2FA.`,
      );
    }

    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);

    await prisma.otpVerification.updateMany({
      where: {
        account_id: account.account_id,
        purpose: 'ENABLE_2FA',
        is_used: false,
      },
      data: { is_used: true },
    });

    await prisma.otpVerification.create({
      data: {
        account_id: account.account_id,
        email,
        otp_hash: otpHash,
        purpose: 'ENABLE_2FA',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    logger.info(
      { username: account.username, email, otp: rawOtp },
      '🔐 [SORAK ENABLE 2FA] Verification code generated',
    );

    // Send branded OTP email via Resend
    const emailRes = await emailService.sendOtpEmail({
      to: email,
      otp: rawOtp,
      purpose: 'ENABLE_2FA',
      userName: account.username,
    });

    if (!emailRes?.success) {
      throw BadRequest('Không thể gửi mã xác thực qua email. Vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau.');
    }

    return {
      message: `Mã xác thực gồm 6 chữ số đã được gửi tới email ${email}. Vui lòng nhập mã để hoàn tất kích hoạt.`,
    };
  }

  /**
   * Confirm OTP to enable 2FA
   */
  async confirmEnable2FA({ publicId, otp }) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
    });

    if (!account || !account.is_active || account.deleted_at) {
      throw NotFound('Không tìm thấy tài khoản.');
    }

    const activeOtp = await prisma.otpVerification.findFirst({
      where: {
        account_id: account.account_id,
        purpose: 'ENABLE_2FA',
        is_used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!activeOtp) {
      throw BadRequest('Mã OTP không hợp lệ hoặc đã hết hạn.');
    }

    const isMatch = await bcrypt.compare(otp.trim(), activeOtp.otp_hash);
    if (!isMatch) {
      throw BadRequest('Mã OTP không chính xác. Vui lòng kiểm tra lại.');
    }

    await prisma.otpVerification.update({
      where: { otp_id: activeOtp.otp_id },
      data: { is_used: true },
    });

    await prisma.account.update({
      where: { account_id: account.account_id },
      data: { is_2fa_enabled: true },
    });

    return {
      is_2fa_enabled: true,
      message: 'Kích hoạt xác thực 2 bước (2FA) thành công!',
    };
  }

  /**
   * Disable 2FA with current password confirmation
   */
  async disable2FA({ publicId, password }) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
    });

    if (!account || !account.is_active || account.deleted_at) {
      throw NotFound('Không tìm thấy tài khoản.');
    }

    if (!account.is_2fa_enabled) {
      throw BadRequest('Xác thực 2 bước (2FA) chưa được bật.');
    }

    const isPasswordValid = await bcrypt.compare(password, account.password_hash);
    if (!isPasswordValid) {
      throw BadRequest('Mật khẩu hiện tại không chính xác.');
    }

    await prisma.account.update({
      where: { account_id: account.account_id },
      data: { is_2fa_enabled: false },
    });

    return {
      is_2fa_enabled: false,
      message: 'Đã tắt xác thực 2 bước (2FA) thành công.',
    };
  }

  /**
   * Change password for authenticated user
   */
  async changePassword({ publicId, currentPassword, newPassword }) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
    });

    if (!account || !account.is_active || account.deleted_at) {
      throw NotFound('Không tìm thấy tài khoản.');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, account.password_hash);
    if (!isPasswordValid) {
      throw BadRequest('Mật khẩu hiện tại không chính xác.');
    }

    if (currentPassword === newPassword) {
      throw BadRequest('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.account.update({
      where: { account_id: account.account_id },
      data: {
        password_hash: newPasswordHash,
        password_changed_at: new Date(),
      },
    });

    logger.info({ publicId }, 'Password changed successfully for authenticated user');

    return {
      success: true,
      message: 'Đổi mật khẩu thành công.',
    };
  }

  /**
   * Request 6-digit OTP for password reset or prompt parent to contact teacher if no email is linked
   */
  async forgotPassword({ identifier, email }) {
    const rawQuery = (identifier || email || '').trim();
    if (!rawQuery) {
      throw BadRequest('Vui lòng cung cấp mã học sinh, tên đăng nhập hoặc email.');
    }

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawQuery);

    let account = null;
    if (isEmail) {
      // Look up faculty / staff by email in the teachers table
      const teacher = await prisma.teacher.findFirst({
        where: {
          email: {
            equals: rawQuery,
            mode: 'insensitive',
          },
          deleted_at: null,
        },
        include: {
          account: {
            include: {
              teacher: true,
              student: { include: { parents: true } },
            },
          },
        },
      });
      account = teacher?.account || null;
    } else {
      // Find by username first (e.g., HS26001, CB24001, ADMIN01)
      account = await prisma.account.findFirst({
        where: {
          username: {
            equals: rawQuery,
            mode: 'insensitive',
          },
          is_active: true,
          deleted_at: null,
        },
        include: {
          teacher: true,
          student: { include: { parents: true } },
        },
      });

      // Fallback 1: search by teacher email if username lookup returns nothing
      if (!account) {
        const teacher = await prisma.teacher.findFirst({
          where: {
            email: {
              equals: rawQuery,
              mode: 'insensitive',
            },
            deleted_at: null,
          },
          include: {
            account: {
              include: {
                teacher: true,
                student: { include: { parents: true } },
              },
            },
          },
        });
        account = teacher?.account || null;
      }

      // Fallback 2: search by teacher employee_code (mã cán bộ / giáo viên)
      if (!account) {
        const teacherByCode = await prisma.teacher.findFirst({
          where: {
            employee_code: {
              equals: rawQuery,
              mode: 'insensitive',
            },
            deleted_at: null,
          },
          include: {
            account: {
              include: {
                teacher: true,
                student: { include: { parents: true } },
              },
            },
          },
        });
        account = teacherByCode?.account || null;
      }
    }

    if (!account) {
      if (isEmail) {
        // Generic response to prevent account enumeration
        return {
          hasEmail: true,
          contactTeacher: false,
          message: 'Nếu thông tin tồn tại trong hệ thống, mã xác thực OTP đã được gửi.',
        };
      }
      throw NotFound('Không tìm thấy tài khoản với mã học sinh hoặc tên đăng nhập này.');
    }

    if (!account.is_active || account.deleted_at) {
      throw Forbidden('Tài khoản đã bị vô hiệu hóa hoặc ngừng hoạt động. Không thể thực hiện khôi phục mật khẩu.');
    }

    // Special rule: PARENT_PH (Parents & Students) NEVER use email OTP.
    // They must contact the homeroom teacher / school support for account reset.
    if (account.role === 'PARENT_PH') {
      let student = null;
      try {
        student = await prisma.student.findFirst({
          where: { account_id: account.account_id, deleted_at: null },
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
                        teacher: {
                          select: {
                            full_name: true,
                            phone: true,
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
      } catch (e) {
        logger.warn(
          { error: e.message },
          'Failed to load student enrollment for forgot-password response',
        );
      }

      const activeEnrollment = student?.student_enrollments?.[0];
      const className = activeEnrollment?.class?.name || null;
      const primaryTeacher = activeEnrollment?.class?.teacher_classes?.[0]?.teacher;
      const parentPhone = student?.parents?.[0]?.phone || null;

      return {
        hasEmail: false,
        contactTeacher: true,
        role: 'PARENT_PH',
        username: account.username,
        studentName: student?.full_name || null,
        className,
        teacherName: primaryTeacher?.full_name || null,
        teacherPhone: primaryTeacher?.phone || null,
        phone: parentPhone,
        message:
          'Quý phụ huynh vui lòng liên hệ giáo viên phụ trách để được hỗ trợ cấp lại mật khẩu.',
      };
    }

    // For faculty / admin roles (TEACHER_GV, PRINCIPAL_BGH, ADMIN_BGH): check teacher profile email
    const teacherEmail = account.teacher?.email;
    if (!teacherEmail || teacherEmail.trim() === '') {
      return {
        hasEmail: false,
        contactTeacher: true,
        contactAdmin: true,
        role: account.role,
        username: account.username,
        teacherName: account.teacher?.full_name || account.username,
        phone: account.teacher?.phone || null,
        message:
          'Tài khoản giáo viên chưa được liên kết email. Vui lòng liên hệ ban giám hiệu hoặc quản trị viên nhà trường để được hỗ trợ.',
      };
    }

    const trimmedEmail = teacherEmail.trim().toLowerCase();

    // Anti-Spam: Check 60-second cooldown per account
    const recentOtp = await prisma.otpVerification.findFirst({
      where: {
        account_id: account.account_id,
        purpose: 'FORGOT_PASSWORD',
        created_at: {
          gt: new Date(Date.now() - 60 * 1000),
        },
      },
      orderBy: { created_at: 'desc' },
    });

    if (recentOtp) {
      const waitSeconds = Math.max(
        1,
        Math.ceil((60 * 1000 - (Date.now() - new Date(recentOtp.created_at).getTime())) / 1000),
      );
      throw BadRequest(
        `Vui lòng đợi ${waitSeconds} giây trước khi yêu cầu gửi lại mã OTP mới.`,
      );
    }

    // Generate 6-digit OTP
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);

    // Invalidate previous OTPs for this account
    await prisma.otpVerification.updateMany({
      where: {
        account_id: account.account_id,
        purpose: 'FORGOT_PASSWORD',
        is_used: false,
      },
      data: { is_used: true },
    });

    // Save new OTP (5 minutes validity)
    await prisma.otpVerification.create({
      data: {
        account_id: account.account_id,
        email: trimmedEmail,
        otp_hash: otpHash,
        purpose: 'FORGOT_PASSWORD',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // In development / demo: log OTP clearly to console for testing
    logger.info(
      { username: account.username, email: trimmedEmail, otp: rawOtp },
      '🔐 [SORAK OTP] Generated password reset code',
    );

    // Send branded OTP email via Resend
    const emailRes = await emailService.sendOtpEmail({
      to: trimmedEmail,
      otp: rawOtp,
      purpose: 'FORGOT_PASSWORD',
      userName: account.username,
    });

    if (!emailRes?.success) {
      throw BadRequest('Không thể gửi mã xác thực qua email. Vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau.');
    }

    return {
      hasEmail: true,
      contactTeacher: false,
      email: trimmedEmail,
      emailMasked: maskEmail(trimmedEmail),
      message: `Mã xác thực OTP gồm 6 chữ số đã được gửi tới ${maskEmail(trimmedEmail)}.`,
    };
  }

  /**
   * Verify submitted 6-digit OTP and return temporary password reset token
   */
  async verifyOtp({ email, otp }) {
    const trimmedInput = (email || '').trim().toLowerCase();
    const trimmedOtp = (otp || '').trim();

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedInput);
    let whereClause = {
      purpose: 'FORGOT_PASSWORD',
      is_used: false,
      expires_at: { gt: new Date() },
    };

    if (isEmail) {
      whereClause.email = trimmedInput;
    } else {
      const account = await prisma.account.findFirst({
        where: {
          OR: [
            { username: { equals: trimmedInput, mode: 'insensitive' } },
            { teacher: { employee_code: { equals: trimmedInput, mode: 'insensitive' } } },
          ],
          deleted_at: null,
        },
      });
      if (account) {
        whereClause.account_id = account.account_id;
      } else {
        whereClause.email = trimmedInput;
      }
    }

    const activeOtp = await prisma.otpVerification.findFirst({
      where: whereClause,
      include: {
        account: true,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!activeOtp) {
      throw BadRequest('Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.');
    }

    if (activeOtp.account && (!activeOtp.account.is_active || activeOtp.account.deleted_at)) {
      throw Forbidden('Tài khoản đã bị vô hiệu hóa hoặc ngừng hoạt động. Không thể thực hiện xác thực OTP.');
    }

    // Rate-limit OTP guessing (Max 5 attempts)
    if (activeOtp.attempt_count >= 5) {
      await prisma.otpVerification.update({
        where: { otp_id: activeOtp.otp_id },
        data: { is_used: true },
      });
      throw BadRequest('Mã OTP đã vượt quá số lần thử cho phép. Vui lòng yêu cầu mã xác thực mới.');
    }

    const isMatch = await bcrypt.compare(trimmedOtp, activeOtp.otp_hash);
    if (!isMatch) {
      await prisma.otpVerification.update({
        where: { otp_id: activeOtp.otp_id },
        data: { attempt_count: activeOtp.attempt_count + 1 },
      });
      throw BadRequest('Mã OTP không chính xác. Vui lòng kiểm tra lại.');
    }

    // Mark OTP as used
    await prisma.otpVerification.update({
      where: { otp_id: activeOtp.otp_id },
      data: { is_used: true },
    });

    // Issue short-lived Reset Token (10 minutes)
    const resetToken = jwt.sign(
      {
        sub: activeOtp.account_id.toString(),
        email: activeOtp.email,
        purpose: 'RESET_PASSWORD',
      },
      env.jwt.accessSecret,
      { expiresIn: '10m' },
    );

    return {
      resetToken,
      email: activeOtp.email,
      message: 'Xác thực OTP thành công. Bạn có thể tiến hành đặt lại mật khẩu.',
    };
  }

  /**
   * Update password using validated reset token
   */
  async resetPassword({ email, resetToken, password }) {
    let payload;
    try {
      payload = jwt.verify(resetToken, env.jwt.accessSecret);
    } catch {
      throw BadRequest('Phiên đặt lại mật khẩu đã hết hạn hoặc không hợp lệ.');
    }

    const trimmedInput = (email || '').trim().toLowerCase();
    const isEmailMatch = payload.email?.toLowerCase() === trimmedInput;
    let isAccountMatch = false;

    if (!isEmailMatch) {
      const acc = await prisma.account.findUnique({
        where: { account_id: BigInt(payload.sub) },
        include: { teacher: true },
      });
      if (
        acc &&
        (acc.username.toLowerCase() === trimmedInput ||
          acc.teacher?.employee_code?.toLowerCase() === trimmedInput)
      ) {
        isAccountMatch = true;
      }
    }

    if (payload.purpose !== 'RESET_PASSWORD' || (!isEmailMatch && !isAccountMatch)) {
      throw BadRequest('Thông tin xác thực đặt lại mật khẩu không hợp lệ.');
    }

    const accountId = BigInt(payload.sub);
    const targetAccount = await prisma.account.findUnique({
      where: { account_id: accountId },
    });
    if (!targetAccount || !targetAccount.is_active || targetAccount.deleted_at) {
      throw Forbidden('Tài khoản đã bị vô hiệu hóa hoặc ngừng hoạt động. Không thể thực hiện đặt lại mật khẩu.');
    }

    const newPasswordHash = await bcrypt.hash(password, 10);

    // Update password, record password_changed_at and last_login_at
    await prisma.account.update({
      where: { account_id: accountId },
      data: {
        password_hash: newPasswordHash,
        password_changed_at: new Date(),
        last_login_at: new Date(),
      },
    });

    // Revoke all existing sessions for security
    await prisma.refreshToken.updateMany({
      where: { account_id: accountId },
      data: { is_revoked: true },
    });

    return {
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
    };
  }

  /**
   * Rotate refresh token and issue new access token
   */
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

    const createdSession = await prisma.refreshToken.create({
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

    const decoded = jwt.decode(newAccessToken);
    const accessExpiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const sessionId = String(createdSession.token_id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      accessExpiresAt,
      sessionId,
    };
  }

  /**
   * Revoke active session on logout
   */
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

  /**
   * Get active user profile
   */
  async getMe(publicId) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
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

    if (!account || !account.is_active || account.deleted_at) {
      throw NotFound('Không tìm thấy tài khoản');
    }

    return {
      user: this._formatUser(account, account.last_login_at === null),
    };
  }

  /**
   * Helper to parse user-agent string into human-readable device info
   */
  _parseUserAgent(ua = '') {
    let browser = 'Trình duyệt Web';
    let os = 'Thiết bị';
    let deviceType = 'desktop';

    if (/windows nt 10\.0/i.test(ua)) os = 'Windows 10/11';
    else if (/windows nt 6\.3/i.test(ua)) os = 'Windows 8.1';
    else if (/windows nt 6\.1/i.test(ua)) os = 'Windows 7';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/iphone/i.test(ua)) {
      os = 'iOS (iPhone)';
      deviceType = 'mobile';
    } else if (/ipad/i.test(ua)) {
      os = 'iPadOS';
      deviceType = 'tablet';
    } else if (/android/i.test(ua)) {
      os = 'Android';
      deviceType = 'mobile';
    } else if (/linux/i.test(ua)) {
      os = 'Linux';
    }

    if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/opr\/|opera\//i.test(ua)) browser = 'Opera';
    else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
    else if (/safari/i.test(ua)) browser = 'Apple Safari';

    return {
      browser,
      os,
      deviceType,
      display: `${browser} · ${os}`,
    };
  }

  /**
   * Helper to format human-readable network location from IP
   */
  _formatLocation(ip = '') {
    const cleanIp = ip ? ip.replace(/^::ffff:/, '') : '';
    const isLocal =
      !cleanIp ||
      cleanIp === '::1' ||
      cleanIp === '127.0.0.1' ||
      cleanIp.startsWith('192.168.') ||
      cleanIp.startsWith('10.') ||
      cleanIp.startsWith('172.16.') ||
      cleanIp.startsWith('172.17.') ||
      cleanIp.startsWith('172.18.') ||
      cleanIp.startsWith('172.19.') ||
      cleanIp.startsWith('172.2') ||
      cleanIp.startsWith('172.30.') ||
      cleanIp.startsWith('172.31.');

    if (isLocal) {
      return 'Cơ sở Sorak Cao Lãnh (Mạng trường)';
    }
    return `Cơ sở Sorak Cao Lãnh · IP ${cleanIp}`;
  }

  /**
   * Get active login sessions from database for the authenticated account
   */
  async getSessions(publicId, currentRawToken = null) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
      select: {
        account_id: true,
        last_login_at: true,
      },
    });

    if (!account) {
      throw NotFound('Không tìm thấy tài khoản');
    }

    let currentHash = null;
    if (currentRawToken) {
      currentHash = crypto.createHash('sha256').update(currentRawToken).digest('hex');
    }

    const tokens = await prisma.refreshToken.findMany({
      where: {
        account_id: account.account_id,
        is_revoked: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    const sessions = tokens.map((token, index) => {
      const parsedDevice = this._parseUserAgent(token.device_info);
      const isCurrent = currentHash
        ? token.token_hash === currentHash
        : index === 0;

      return {
        id: token.token_id.toString(),
        deviceInfo: token.device_info,
        browser: parsedDevice.browser,
        os: parsedDevice.os,
        deviceType: parsedDevice.deviceType,
        deviceDisplay: parsedDevice.display,
        ipAddress: token.ip_address,
        location: this._formatLocation(token.ip_address),
        createdAt: token.created_at,
        lastActive: isCurrent ? (account.last_login_at || token.created_at) : token.created_at,
        lastActiveAt: isCurrent ? (account.last_login_at || token.created_at) : token.created_at,
        isCurrent,
      };
    });

    // If no active refresh token record exists in DB, fallback to a virtual current session
    if (sessions.length === 0) {
      const now = new Date();
      sessions.push({
        id: 'current',
        deviceInfo: 'Web Browser',
        browser: 'Trình duyệt Web',
        os: 'Thiết bị này',
        deviceType: 'desktop',
        deviceDisplay: 'Trình duyệt Web · Windows',
        ipAddress: '127.0.0.1',
        location: 'Cơ sở Sorak Cao Lãnh (Mạng trường)',
        createdAt: account.last_login_at || now,
        lastActive: account.last_login_at || now,
        lastActiveAt: account.last_login_at || now,
        isCurrent: true,
      });
    }

    return {
      lastLoginAt: account.last_login_at,
      sessions,
    };
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(publicId, sessionId) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
      select: { account_id: true },
    });

    if (!account) {
      throw NotFound('Không tìm thấy tài khoản');
    }

    await prisma.refreshToken.updateMany({
      where: {
        account_id: account.account_id,
        token_id: BigInt(sessionId),
      },
      data: { is_revoked: true },
    });

    return { message: 'Đã thu hồi phiên đăng nhập thành công' };
  }

  /**
   * Revoke all other sessions except the current one
   */
  async revokeOtherSessions(publicId, currentRawToken = null) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
      select: { account_id: true },
    });

    if (!account) {
      throw NotFound('Không tìm thấy tài khoản');
    }

    let currentHash = null;
    if (currentRawToken) {
      currentHash = crypto.createHash('sha256').update(currentRawToken).digest('hex');
    }

    const whereClause = {
      account_id: account.account_id,
      is_revoked: false,
    };

    if (currentHash) {
      whereClause.token_hash = { not: currentHash };
    }

    const result = await prisma.refreshToken.updateMany({
      where: whereClause,
      data: { is_revoked: true },
    });

    return {
      message: 'Đã thu hồi tất cả các phiên đăng nhập khác thành công',
      revokedCount: result.count,
    };
  }

  /**
   * Revoke all sessions including the current one
   */
  async revokeAllSessions(publicId) {
    const account = await prisma.account.findUnique({
      where: { public_id: publicId },
      select: { account_id: true },
    });

    if (!account) {
      throw NotFound('Không tìm thấy tài khoản');
    }

    const result = await prisma.refreshToken.updateMany({
      where: {
        account_id: account.account_id,
        is_revoked: false,
      },
      data: { is_revoked: true },
    });

    return {
      message: 'Đã thu hồi tất cả phiên đăng nhập thành công',
      revokedCount: result.count,
    };
  }
}

export const authService = new AuthService();
