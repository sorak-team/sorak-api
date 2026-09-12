import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class AccountService {

  _parseId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (isUuid) return { public_id: str };
      if (/^[A-Za-z0-9_.-]+$/.test(str) && !/^\d+$/.test(str)) return { username: str };
      return { public_id: '00000000-0000-0000-0000-000000000000' };
    }

  async listAccounts({ page = 1, limit = 20, search, role, status, sortBy = 'newest' }) {
      const skip = (Math.max(1, page) - 1) * limit;
  
      const where = {
        deleted_at: null,
      };
  
      if (search && search.trim()) {
        const q = search.trim();
        where.OR = [
          { username: { contains: q, mode: 'insensitive' } },
          { teacher: { full_name: { contains: q, mode: 'insensitive' } } },
          { teacher: { employee_code: { contains: q, mode: 'insensitive' } } },
          { teacher: { email: { contains: q, mode: 'insensitive' } } },
          { teacher: { phone: { contains: q, mode: 'insensitive' } } },
          { student: { full_name: { contains: q, mode: 'insensitive' } } },
          { student: { student_code: { contains: q, mode: 'insensitive' } } },
          { student: { parents: { some: { phone: { contains: q, mode: 'insensitive' } } } } },
        ];
      }
  
      if (role && role !== 'ALL') {
        where.role = role === 'ADMIN_BGH' ? 'PRINCIPAL_BGH' : role;
      }
  
      if (status && status !== 'ALL') {
        where.is_active = status === 'active';
      }
  
      let orderBy = { created_at: 'desc' };
      switch (sortBy) {
        case 'oldest':
          orderBy = { created_at: 'asc' };
          break;
        case 'username':
          orderBy = { username: 'asc' };
          break;
        case 'lastLogin':
          orderBy = { last_login_at: 'desc' };
          break;
        case 'newest':
        default:
          orderBy = { created_at: 'desc' };
          break;
      }
  
      const [total, items] = await Promise.all([
        prisma.account.count({ where }),
        prisma.account.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            teacher: {
              select: {
                teacher_id: true,
                public_id: true,
                employee_code: true,
                full_name: true,
                phone: true,
                email: true,
                avatar_url: true,
                position: true,
                work_status: true,
              },
            },
            student: {
              select: {
                student_id: true,
                public_id: true,
                student_code: true,
                full_name: true,
                avatar_url: true,
                status: true,
                parents: {
                  where: { deleted_at: null },
                  select: {
                    phone: true,
                    full_name: true,
                  },
                },
                student_enrollments: {
                  where: { left_at: null },
                  include: {
                    class: {
                      select: {
                        class_id: true,
                        public_id: true,
                        name: true,
                        room_number: true,
                        age_group: true,
                        school_year: {
                          select: {
                            school_year_id: true,
                            name: true,
                            status: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ]);
  
      const formatted = items.map((acc) => {
        const email = acc.teacher?.email || null;
        const phone = acc.teacher?.phone || acc.student?.parents?.[0]?.phone || null;
        const avatarUrl = acc.teacher?.avatar_url || acc.student?.avatar_url || null;
        const fullName = acc.teacher?.full_name || acc.student?.full_name || acc.username;
  
        const currentEnrollment = acc.student?.student_enrollments?.[0];
        const enrolledClass = currentEnrollment?.class;
  
        return {
          id: acc.public_id || acc.account_id.toString(),
          publicId: acc.public_id,
          username: acc.username,
          fullName,
          email,
          phone,
          role: acc.role,
          avatarUrl,
          isActive: acc.is_active,
          is2faEnabled: acc.is_2fa_enabled,
          lastLoginAt: acc.last_login_at,
          createdAt: acc.created_at,
          updatedAt: acc.updated_at,
          teacherProfile: acc.teacher
            ? {
                id: acc.teacher.public_id || acc.teacher.teacher_id.toString(),
                publicId: acc.teacher.public_id,
                employeeCode: acc.teacher.employee_code,
                fullName: acc.teacher.full_name,
                phone: acc.teacher.phone,
                email: acc.teacher.email,
                avatarUrl: acc.teacher.avatar_url,
                position: acc.teacher.position,
                workStatus: acc.teacher.work_status,
              }
            : null,
          studentProfile: acc.student
            ? {
                id: acc.student.public_id || acc.student.student_id.toString(),
                publicId: acc.student.public_id,
                studentCode: acc.student.student_code,
                fullName: acc.student.full_name,
                avatarUrl: acc.student.avatar_url,
                status: acc.student.status,
                currentClass: enrolledClass
                  ? {
                      classId: enrolledClass.public_id || enrolledClass.class_id.toString(),
                      publicId: enrolledClass.public_id,
                      className: enrolledClass.name,
                      roomNumber: enrolledClass.room_number,
                      ageGroup: enrolledClass.age_group,
                      schoolYearName: enrolledClass.school_year?.name || null,
                    }
                  : null,
                studentClass: enrolledClass?.name || null,
                ageGroup: enrolledClass?.age_group || null,
              }
            : null,
        };
      });
  
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

  async getAccountById(id) {
      const where = { ...this._parseId(id), deleted_at: null };
  
      const account = await prisma.account.findFirst({
        where,
        include: {
          teacher: {
            include: {
              teacher_classes: {
                where: { left_at: null },
                include: {
                  class: {
                    select: {
                      class_id: true,
                      public_id: true,
                      name: true,
                      room_number: true,
                      school_year_id: true,
                      school_year: {
                        select: {
                          school_year_id: true,
                          name: true,
                          status: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          student: {
            include: {
              parents: {
                where: { deleted_at: null },
              },
              student_enrollments: {
                where: { left_at: null },
                include: {
                  class: {
                    select: {
                      class_id: true,
                      public_id: true,
                      name: true,
                      room_number: true,
                      age_group: true,
                      school_year: {
                        select: {
                          school_year_id: true,
                          name: true,
                          status: true,
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
  
      if (!account) {
        throw new NotFound('Tài khoản không tồn tại trên hệ thống');
      }
  
      const email = account.teacher?.email || null;
      const phone = account.teacher?.phone || account.student?.parents?.[0]?.phone || null;
      const avatarUrl = account.teacher?.avatar_url || account.student?.avatar_url || null;
      const fullName = account.teacher?.full_name || account.student?.full_name || account.username;
  
      const currentEnrollment = account.student?.student_enrollments?.[0];
      const enrolledClass = currentEnrollment?.class;
  
      return {
        id: account.public_id || account.account_id.toString(),
        publicId: account.public_id,
        username: account.username,
        fullName,
        email,
        phone,
        role: account.role,
        avatarUrl,
        isActive: account.is_active,
        is2faEnabled: account.is_2fa_enabled,
        lastLoginAt: account.last_login_at,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
        teacherProfile: account.teacher
          ? {
              id: account.teacher.public_id || account.teacher.teacher_id.toString(),
              publicId: account.teacher.public_id,
              employeeCode: account.teacher.employee_code,
              fullName: account.teacher.full_name,
              phone: account.teacher.phone,
              email: account.teacher.email,
              dateOfBirth: account.teacher.date_of_birth,
              gender: account.teacher.gender,
              citizenId: account.teacher.citizen_id,
              address: account.teacher.address,
              position: account.teacher.position,
              workStatus: account.teacher.work_status,
              startDate: account.teacher.start_date,
              assignedClasses: account.teacher.teacher_classes.map((tc) => ({
                id: tc.id.toString(),
                classId: tc.class.public_id || tc.class.class_id.toString(),
                className: tc.class.name,
                schoolYearId: tc.class.school_year_id ? tc.class.school_year_id.toString() : null,
                schoolYearName: tc.class.school_year?.name || null,
                roomNumber: tc.class.room_number,
                isPrimary: tc.is_primary,
                assignedAt: tc.assigned_at,
              })),
            }
          : null,
        studentProfile: account.student
          ? {
              id: account.student.public_id || account.student.student_id.toString(),
              publicId: account.student.public_id,
              studentCode: account.student.student_code,
              fullName: account.student.full_name,
              avatarUrl: account.student.avatar_url,
              status: account.student.status,
              currentClass: enrolledClass
                ? {
                    classId: enrolledClass.public_id || enrolledClass.class_id.toString(),
                    publicId: enrolledClass.public_id,
                    className: enrolledClass.name,
                    roomNumber: enrolledClass.room_number,
                    ageGroup: enrolledClass.age_group,
                    schoolYearName: enrolledClass.school_year?.name || null,
                  }
                : null,
              studentClass: enrolledClass?.name || null,
              ageGroup: enrolledClass?.age_group || null,
              parents: account.student.parents.map((p) => ({
                id: p.public_id || p.parent_id.toString(),
                fullName: p.full_name,
                relationship: p.relationship,
                phone: p.phone,
                canPickup: p.can_pickup,
              })),
            }
          : null,
      };
    }

}
export const accountService = new AccountService();
export default accountService;
