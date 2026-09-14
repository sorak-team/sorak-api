import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class TeacherService {

  _parseId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (isUuid) return { public_id: str };
      if (/^[A-Za-z0-9_-]+$/.test(str) && !/^\d+$/.test(str)) return { employee_code: str };
      return { public_id: '00000000-0000-0000-0000-000000000000' };
    }

  _parseClassId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
    }

  _getDefaultAvatar(seed) {
      const safeSeed = (seed || 'GV').toString().trim();
      return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(safeSeed)}`;
    }

  async listTeachers({
      page = 1,
      limit = 20,
      search,
      workStatus,
      gender,
      classId,
      sortBy = 'newest',
    }) {
      const skip = (Math.max(1, page) - 1) * limit;
  
      const where = {
        deleted_at: null,
      };
  
      if (search && search.trim()) {
        const q = search.trim();
        where.OR = [
          { full_name: { contains: q, mode: 'insensitive' } },
          { employee_code: { contains: q, mode: 'insensitive' } },
          { citizen_id: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { account: { username: { contains: q, mode: 'insensitive' } } },
        ];
      }
  
      if (workStatus && workStatus !== 'ALL') {
        where.work_status = workStatus;
      }
  
      if (gender && gender !== 'ALL') {
        where.gender = gender;
      }
  
      if (classId) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(classId),
        );
        where.teacher_classes = {
          some: {
            ...(isUuid ? { class: { public_id: String(classId) } } : { class_id: BigInt(classId) }),
            left_at: null,
          },
        };
      }
  
      let orderBy = { employee_code: 'asc' };
      switch (sortBy) {
        case 'oldest':
          orderBy = { created_at: 'asc' };
          break;
        case 'name':
          orderBy = { full_name: 'asc' };
          break;
        case 'code':
          orderBy = { employee_code: 'asc' };
          break;
        case 'startDate':
          orderBy = { start_date: 'desc' };
          break;
        case 'newest':
          orderBy = { created_at: 'desc' };
          break;
        default:
          orderBy = { employee_code: 'asc' };
          break;
      }
  
      const [total, items] = await Promise.all([
        prisma.teacher.count({ where }),
        prisma.teacher.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            account: {
              select: {
                account_id: true,
                public_id: true,
                username: true,
                role: true,
                is_active: true,
              },
            },
            teacher_classes: {
              where: { left_at: null },
              include: {
                class: {
                  select: {
                    class_id: true,
                    public_id: true,
                    name: true,
                    room_number: true,
                    school_year: { select: { name: true } },
                  },
                },
              },
            },
          },
        }),
      ]);
  
      const formatted = items.map((t) => ({
        id: t.public_id || t.teacher_id.toString(),
        publicId: t.public_id,
        employeeCode: t.employee_code,
        fullName: t.full_name,
        dateOfBirth: t.date_of_birth,
        gender: t.gender,
        citizenId: t.citizen_id,
        phone: t.phone || '',
        email: t.email || '',
        avatarUrl: t.avatar_url || this._getDefaultAvatar(t.full_name || t.employee_code),
        address: t.address,
        position: t.position,
        workStatus: t.work_status,
        startDate: t.start_date,
        endDate: t.end_date,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        account: t.account
          ? {
              id: t.account.public_id || t.account.account_id.toString(),
              publicId: t.account.public_id,
              username: t.account.username,
              isActive: t.account.is_active,
            }
          : null,
        assignedClasses: t.teacher_classes.map((tc) => ({
          allocationId: tc.id.toString(),
          classId: tc.class.public_id || tc.class.class_id.toString(),
          className: tc.class.name,
          roomNumber: tc.class.room_number,
          schoolYearName: tc.class.school_year?.name,
          isPrimary: tc.is_primary,
          assignedAt: tc.assigned_at,
        })),
      }));
  
      return {
        items: formatted,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

  async getTeacherById(id) {
      const where = { ...this._parseId(id), deleted_at: null };
  
      const teacher = await prisma.teacher.findFirst({
        where,
        include: {
          account: {
            select: {
              account_id: true,
              public_id: true,
              username: true,
              role: true,
              is_active: true,
              last_login_at: true,
            },
          },
          teacher_classes: {
            orderBy: { assigned_at: 'desc' },
            include: {
              class: {
                select: {
                  class_id: true,
                  public_id: true,
                  name: true,
                  room_number: true,
                  age_group: true,
                  school_year: { select: { school_year_id: true, name: true, status: true } },
                },
              },
            },
          },
        },
      });
  
      if (!teacher) {
        throw new NotFound('Hồ sơ giáo viên không tồn tại trên hệ thống');
      }
  
      return {
        id: teacher.public_id || teacher.teacher_id.toString(),
        publicId: teacher.public_id,
        employeeCode: teacher.employee_code,
        fullName: teacher.full_name,
        dateOfBirth: teacher.date_of_birth,
        gender: teacher.gender,
        citizenId: teacher.citizen_id,
        phone: teacher.phone || '',
        email: teacher.email || '',
        avatarUrl: teacher.avatar_url || this._getDefaultAvatar(teacher.full_name || teacher.employee_code),
        address: teacher.address,
        position: teacher.position,
        workStatus: teacher.work_status,
        startDate: teacher.start_date,
        endDate: teacher.end_date,
        createdAt: teacher.created_at,
        updatedAt: teacher.updated_at,
        account: teacher.account
          ? {
              id: teacher.account.public_id || teacher.account.account_id.toString(),
              publicId: teacher.account.public_id,
              username: teacher.account.username,
              isActive: teacher.account.is_active,
              lastLoginAt: teacher.account.last_login_at,
            }
          : null,
        activeClasses: teacher.teacher_classes
          .filter((tc) => tc.left_at === null)
          .map((tc) => ({
            allocationId: tc.id.toString(),
            classId: tc.class.public_id || tc.class.class_id.toString(),
            className: tc.class.name,
            roomNumber: tc.class.room_number,
            ageGroup: tc.class.age_group,
            schoolYear: tc.class.school_year?.name,
            isPrimary: tc.is_primary,
            assignedAt: tc.assigned_at,
          })),
        assignmentHistory: teacher.teacher_classes.map((tc) => ({
          allocationId: tc.id.toString(),
          classId: tc.class.public_id || tc.class.class_id.toString(),
          className: tc.class.name,
          schoolYear: tc.class.school_year?.name,
          isPrimary: tc.is_primary,
          assignedAt: tc.assigned_at,
          leftAt: tc.left_at,
          isActive: tc.left_at === null,
        })),
      };
    }

}
export const teacherService = new TeacherService();
export default teacherService;
