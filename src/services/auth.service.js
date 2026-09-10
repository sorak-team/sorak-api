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
  
      await prisma.refreshToken.create({
        data: {
          account_id: account.account_id,
          token_hash: tokenHash,
          device_info: deviceInfo || 'Unknown Browser',
          ip_address: ipAddress || null,
          expires_at: new Date(Date.now() + (payload.rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000),
        },
      });
  
      return {
        user: this._formatUser(account, isFirstLogin),
        accessToken,
        refreshToken: rawRefreshToken,
      };
    }

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
      await emailService.sendOtpEmail({
        to: email,
        otp: rawOtp,
        purpose: 'ENABLE_2FA',
        userName: account.username,
      });
  
      return {
        message: `Mã xác thực gồm 6 chữ số đã được gửi tới email ${email}. Vui lòng nhập mã để hoàn tất kích hoạt.`,
      };
    }

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
  
        // Fallback: search by teacher email if username lookup returns nothing
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
                        where: { is_primary: true, left_at: null },
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
            'Quý phụ huynh vui lòng liên hệ giáo viên chủ nhiệm để được hỗ trợ cấp lại mật khẩu.',
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
      await emailService.sendOtpEmail({
        to: trimmedEmail,
        otp: rawOtp,
        purpose: 'FORGOT_PASSWORD',
        userName: account.username,
      });
  
      return {
        hasEmail: true,
        contactTeacher: false,
        email: trimmedEmail,
        emailMasked: maskEmail(trimmedEmail),
        message: `Mã xác thực OTP gồm 6 chữ số đã được gửi tới ${maskEmail(trimmedEmail)}.`,
      };
    }

}
export const authService = new AuthService();
export default authService;
