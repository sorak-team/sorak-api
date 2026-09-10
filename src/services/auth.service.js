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
          isPrimary: Boolean(tc.is_primary),
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
        is_first_login: isFirstLogin,
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
            studentClass?.teacher_classes?.find((tc) => tc.is_primary && !tc.left_at)?.teacher ||
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
              canPickup: p.can_pickup,
            })),
          };
        })(),
      };
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

}
export const authService = new AuthService();
export default authService;
