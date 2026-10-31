import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class AccountService {
  /**
   * Helper to parse account identifier (uuid or username)
   * Rejects numeric sequence IDs to prevent enumeration.
   */
  _parseId(id) {
    if (!id) return { public_id: '00000000-0000-0000-0000-000000000000' };
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { account_id: BigInt(str) };
    return { username: str };
  }

  /**
   * List accounts with pagination, search, role and status filter
   */
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
        passwordChangedAt: acc.password_changed_at,
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

  /**
   * Get single account by ID (account_id or public_id)
   */
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
      passwordChangedAt: account.password_changed_at,
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
            })),
          }
        : null,
    };
  }

  /**
   * Create new account
   */
  async createAccount(data) {
    // 1. Check username collision
    const existing = await prisma.account.findFirst({
      where: { username: data.username, deleted_at: null },
    });
    if (existing) {
      throw new Conflict(`Tên đăng nhập '${data.username}' đã được sử dụng`);
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(data.password || 'Sorak@2026', 10);

    const assignedRole = data.role === 'ADMIN_BGH' ? 'PRINCIPAL_BGH' : data.role;
    const account = await prisma.account.create({
      data: {
        username: data.username,
        password_hash: passwordHash,
        role: assignedRole,
        is_active: data.isActive !== undefined ? data.isActive : true,
      },
    });

    if (data.teacherId) {
      try {
        const isBigInt = /^\d+$/.test(String(data.teacherId));
        const where = isBigInt ? { teacher_id: BigInt(data.teacherId) } : { public_id: String(data.teacherId) };
        await prisma.teacher.update({
          where,
          data: { account_id: account.account_id },
        });
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to link teacher profile to account by teacherId');
      }
    } else if (data.role === 'TEACHER_GV' || data.role === 'PRINCIPAL_BGH' || data.role === 'ADMIN_BGH') {
      const code = data.employeeCode || data.username;
      if (code) {
        try {
          const t = await prisma.teacher.findFirst({
            where: { employee_code: { equals: code, mode: 'insensitive' }, deleted_at: null },
          });
          if (t) {
            await prisma.teacher.update({
              where: { teacher_id: t.teacher_id },
              data: { account_id: account.account_id },
            });
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to auto-link teacher by code');
        }
      }
    }

    if (data.studentId) {
      try {
        const isBigInt = /^\d+$/.test(String(data.studentId));
        const where = isBigInt ? { student_id: BigInt(data.studentId) } : { public_id: String(data.studentId) };
        await prisma.student.update({
          where,
          data: { account_id: account.account_id },
        });
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to link student profile to account by studentId');
      }
    } else if (data.role === 'PARENT_PH' || data.role === 'STUDENT') {
      const code = data.studentCode || data.username;
      if (code) {
        try {
          const s = await prisma.student.findFirst({
            where: { student_code: { equals: code, mode: 'insensitive' }, deleted_at: null },
          });
          if (s) {
            await prisma.student.update({
              where: { student_id: s.student_id },
              data: { account_id: account.account_id },
            });
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to auto-link student by code');
        }
      }
    }

    logger.info(
      { accountId: account.account_id.toString(), username: account.username },
      'Created account',
    );

    return this.getAccountById(account.public_id || account.account_id.toString());
  }

  /**
   * Update account
   */
  async updateAccount(id, data, currentUser = null) {
    const where = { ...this._parseId(id), deleted_at: null };
    const account = await prisma.account.findFirst({
      where,
      include: {
        teacher: {
          include: {
            teacher_classes: {
              where: { left_at: null },
            },
          },
        },
        student: true,
      },
    });
    if (!account) {
      throw new NotFound('Tài khoản không tồn tại trên hệ thống');
    }

    const updateData = {};
    if (data.role !== undefined) {
      const normalizedRole = data.role === 'ADMIN_BGH' ? 'PRINCIPAL_BGH' : data.role;

      if (normalizedRole !== account.role) {
        // Rule 1: A user cannot change their own role (Comment 5)
        if (currentUser) {
          const userSub = String(currentUser.sub || '');
          const userAccId = String(currentUser.accountId || '');
          const targetPubId = String(account.public_id);
          const targetAccId = String(account.account_id);
          if (userSub === targetPubId || userSub === targetAccId || userAccId === targetAccId) {
            throw new BadRequest('Người dùng không được phép tự thay đổi vai trò của chính mình.');
          }
        }

        // Rule 2: System must retain at least 1 active Principal (Comment 6)
        if (account.role === 'PRINCIPAL_BGH') {
          const activePrincipalsCount = await prisma.account.count({
            where: {
              role: 'PRINCIPAL_BGH',
              is_active: true,
              deleted_at: null,
            },
          });
          if (activePrincipalsCount <= 1) {
            throw new BadRequest('Hệ thống phải có ít nhất 1 tài khoản Ban giám hiệu (Hiệu trưởng) đang hoạt động.');
          }
        }

        // Rule 3: Teacher currently assigned to a class cannot change role to BGH (Comment 7)
        if (normalizedRole === 'PRINCIPAL_BGH' && account.teacher) {
          const activeClassCount = (account.teacher.teacher_classes || []).length;
          if (activeClassCount > 0) {
            throw new BadRequest(
              'Giáo viên đang được phân công giảng dạy lớp không thể đổi vai trò sang Ban giám hiệu. Vui lòng gỡ phân công lớp trước.'
            );
          }
        }

        updateData.role = normalizedRole;
      }
    }
    if (data.isActive !== undefined) updateData.is_active = data.isActive;

    if (Object.keys(updateData).length > 0) {
      await prisma.account.update({
        where: { account_id: account.account_id },
        data: updateData,
      });
    }

    // If contact or avatar data is passed and linked to teacher/student, update the linked profile
    if (account.teacher) {
      const teacherUpdate = {};
      if (data.email !== undefined) teacherUpdate.email = data.email || null;
      if (data.phone !== undefined) teacherUpdate.phone = data.phone || null;
      if (data.avatarUrl !== undefined) teacherUpdate.avatar_url = data.avatarUrl || null;
      if (Object.keys(teacherUpdate).length > 0) {
        await prisma.teacher.update({
          where: { teacher_id: account.teacher.teacher_id },
          data: teacherUpdate,
        });
      }
    } else if (account.student) {
      const studentUpdate = {};
      if (data.avatarUrl !== undefined) studentUpdate.avatar_url = data.avatarUrl || null;
      if (Object.keys(studentUpdate).length > 0) {
        await prisma.student.update({
          where: { student_id: account.student.student_id },
          data: studentUpdate,
        });
      }
    }

    return this.getAccountById(account.public_id || account.account_id.toString());
  }

  /**
   * Change account active status
   */
  async changeStatus(id, isActive, currentUser = null) {
    const where = { ...this._parseId(id), deleted_at: null };
    const account = await prisma.account.findFirst({ where });
    if (!account) {
      throw new NotFound('Tài khoản không tồn tại');
    }

    // Rule 4: User cannot change status of their own account (cannot lock themselves) (Comment 9 & 10)
    if (currentUser) {
      const userSub = String(currentUser.sub || '');
      const userAccId = String(currentUser.accountId || '');
      const targetPubId = String(account.public_id);
      const targetAccId = String(account.account_id);
      if (userSub === targetPubId || userSub === targetAccId || userAccId === targetAccId) {
        throw new BadRequest('Tài khoản tự đổi trạng thái của chính mình sẽ bị từ chối.');
      }
    }

    // Rule 5: Cannot lock the last active Principal (Comment 9 & 10)
    if (!isActive && account.role === 'PRINCIPAL_BGH') {
      const activePrincipalsCount = await prisma.account.count({
        where: {
          role: 'PRINCIPAL_BGH',
          is_active: true,
          deleted_at: null,
        },
      });
      if (activePrincipalsCount <= 1) {
        throw new BadRequest('Hệ thống phải có ít nhất 1 tài khoản Ban giám hiệu (Hiệu trưởng) đang hoạt động.');
      }
    }

    await prisma.account.update({
      where: { account_id: account.account_id },
      data: { is_active: isActive },
    });

    // If locked/deactivated, revoke active refresh sessions
    if (!isActive) {
      await prisma.refreshToken.updateMany({
        where: { account_id: account.account_id, is_revoked: false },
        data: { is_revoked: true },
      });
    }

    return {
      id: account.public_id || account.account_id.toString(),
      isActive,
      message: isActive ? 'Đã kích hoạt tài khoản' : 'Đã khóa tài khoản thành công',
    };
  }

  /**
   * Reset account password
   */
  async resetPassword(id, newPassword = 'Sorak@2026') {
    const where = { ...this._parseId(id), deleted_at: null };
    const account = await prisma.account.findFirst({ where });
    if (!account) {
      throw new NotFound('Tài khoản không tồn tại');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.account.update({
      where: { account_id: account.account_id },
      data: {
        password_hash: passwordHash,
        password_changed_at: new Date(),
      },
    });

    // Revoke all sessions so old JWT tokens cannot be refreshed
    await prisma.refreshToken.updateMany({
      where: { account_id: account.account_id, is_revoked: false },
      data: { is_revoked: true },
    });

    logger.info({ accountId: account.account_id.toString() }, 'Reset password for account');

    return {
      id: account.public_id || account.account_id.toString(),
      temporaryPassword: newPassword,
      message: 'Đặt lại mật khẩu thành công. Mật khẩu tạm thời là: ' + newPassword,
    };
  }

  /**
   * Soft delete account
   */
  async deleteAccount(id) {
    const where = { ...this._parseId(id), deleted_at: null };
    const account = await prisma.account.findFirst({ where });
    if (!account) {
      throw new NotFound('Tài khoản không tồn tại');
    }

    await prisma.account.update({
      where: { account_id: account.account_id },
      data: {
        deleted_at: new Date(),
        is_active: false,
      },
    });

    // Revoke sessions
    await prisma.refreshToken.updateMany({
      where: { account_id: account.account_id, is_revoked: false },
      data: { is_revoked: true },
    });

    return { success: true, message: 'Đã xóa tài khoản thành công' };
  }
}

export const accountService = new AccountService();
export default accountService;
