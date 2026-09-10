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

}
export const authService = new AuthService();
export default authService;
