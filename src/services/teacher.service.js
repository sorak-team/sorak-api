import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class TeacherService {
  _parseId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { teacher_id: BigInt(str) };
    if (/^[A-Za-z0-9_-]+$/.test(str)) return { teacher_code: str };
    return { public_id: '00000000-0000-0000-0000-000000000000' };
  }
  _getDefaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'teacher')}`;
  }
  _parseClassId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
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

  async _generateTeacherCode(startDate) {
    let joinYear;
    if (startDate) {
      if (typeof startDate === 'string' && startDate.includes('/')) {
        const parts = startDate.split('/');
        if (parts.length === 3) joinYear = parseInt(parts[2], 10);
      } else {
        const parsed = new Date(startDate).getFullYear();
        if (!isNaN(parsed)) joinYear = parsed;
      }
    }
    // Quy tắc: Mã số cán bộ tối thiểu là từ năm 2000 (CB00xxx)
    if (!joinYear || isNaN(joinYear)) {
      joinYear = new Date().getFullYear();
    } else if (joinYear < 2000) {
      joinYear = 2000;
    }

    const yearSuffix = String(joinYear).slice(-2);
    const prefix = `CB${yearSuffix}`;

    const existing = await prisma.teacher.findMany({
      where: { employee_code: { startsWith: prefix, mode: 'insensitive' }, deleted_at: null },
      select: { employee_code: true },
    });

    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}(\\d{3})$`, 'i');
    for (const t of existing) {
      const match = String(t.employee_code || '')
        .trim()
        .match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }

    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    return `${prefix}${nextSeq}`;
  }

  async createTeacher(data) {
    let finalCode = data.employeeCode?.trim().toUpperCase();
    if (
      !finalCode ||
      finalCode.startsWith('GV') ||
      (finalCode.startsWith('CB') && finalCode.length > 7)
    ) {
      finalCode = await this._generateTeacherCode(data.startDate || data.joinDate);
    }

    // 1. Verify code and citizen_id uniqueness
    const codeConflict = await prisma.teacher.findFirst({
      where: { employee_code: finalCode, deleted_at: null },
    });
    if (codeConflict) {
      throw new Conflict(`Mã giáo viên '${finalCode}' đã tồn tại`);
    }

    const citizenConflict = await prisma.teacher.findFirst({
      where: { citizen_id: data.citizenId, deleted_at: null },
    });
    if (citizenConflict) {
      throw new Conflict(`Số CCCD '${data.citizenId}' đã được đăng ký bởi giáo viên khác`);
    }

    // 2. Create teacher profile (without auto-creating account)
    const createdTeacher = await prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.create({
        data: {
          account_id: null,
          employee_code: finalCode,
          full_name: data.fullName,
          date_of_birth: new Date(data.dateOfBirth),
          gender: data.gender,
          citizen_id: data.citizenId,
          phone: data.phone || null,
          email: data.email || null,
          avatar_url: data.avatarUrl || null,
          address: data.address || null,
          position: data.position || null,
          work_status: data.workStatus || 'WORKING',
          start_date: new Date(data.startDate),
          end_date: data.endDate ? new Date(data.endDate) : null,
        },
      });

      // Optional initial class assignment
      if (data.classId) {
        const targetClass = await tx.class.findFirst({
          where: { ...this._parseClassId(data.classId), deleted_at: null },
        });
        if (targetClass) {
          await tx.teacherClass.create({
            data: {
              teacher_id: teacher.teacher_id,
              class_id: targetClass.class_id,
              is_primary: !!data.isPrimary,
              assigned_at: new Date(),
            },
          });
        }
      }

      return teacher;
    });

    logger.info(
      { teacherId: createdTeacher.teacher_id.toString() },
      'Created teacher profile and account',
    );

    return this.getTeacherById(createdTeacher.public_id || createdTeacher.teacher_id.toString());
  }

  async updateTeacher(id, data) {
    const where = { ...this._parseId(id), deleted_at: null };
    const teacher = await prisma.teacher.findFirst({ where });
    if (!teacher) {
      throw new NotFound('Giáo viên không tồn tại trên hệ thống');
    }

    if (data.citizenId && data.citizenId !== teacher.citizen_id) {
      const conflict = await prisma.teacher.findFirst({
        where: { citizen_id: data.citizenId, deleted_at: null },
      });
      if (conflict) {
        throw new Conflict(`Số CCCD '${data.citizenId}' đã được sử dụng`);
      }
    }

    const teacherUpdate = {};
    if (data.fullName !== undefined) teacherUpdate.full_name = data.fullName;
    if (data.dateOfBirth !== undefined) teacherUpdate.date_of_birth = new Date(data.dateOfBirth);
    if (data.gender !== undefined) teacherUpdate.gender = data.gender;
    if (data.citizenId !== undefined) teacherUpdate.citizen_id = data.citizenId;
    if (data.phone !== undefined) teacherUpdate.phone = data.phone || null;
    if (data.email !== undefined) teacherUpdate.email = data.email || null;
    if (data.avatarUrl !== undefined) teacherUpdate.avatar_url = data.avatarUrl || null;
    if (data.address !== undefined) teacherUpdate.address = data.address || null;
    if (data.position !== undefined) teacherUpdate.position = data.position || null;
    if (data.workStatus !== undefined) teacherUpdate.work_status = data.workStatus;
    if (data.startDate !== undefined) teacherUpdate.start_date = new Date(data.startDate);
    if (data.endDate !== undefined)
      teacherUpdate.end_date = data.endDate ? new Date(data.endDate) : null;

    await prisma.teacher.update({
      where: { teacher_id: teacher.teacher_id },
      data: teacherUpdate,
    });

    return this.getTeacherById(teacher.public_id || teacher.teacher_id.toString());
  }

  async assignTeacherToClass(teacherId, { classId, isPrimary = false, assignedAt = new Date() }) {
    const teacher = await prisma.teacher.findFirst({
      where: { ...this._parseId(teacherId), deleted_at: null },
    });
    if (!teacher) throw new NotFound('Giáo viên không tồn tại');

    // Only personnel with position 'Giáo viên' can be assigned to classes (exclude Principal, Vice Principal, etc.)
    const pos = (teacher.position || '').trim().toLowerCase();
    if (pos.includes('hiệu trưởng') || (pos && !pos.includes('giáo viên'))) {
      throw new Conflict(
        `Chỉ có thể phân công nhân sự có vị trí là Giáo viên vào lớp học. Nhân sự ${teacher.full_name} có chức vụ '${teacher.position}'.`,
      );
    }

    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseClassId(classId), deleted_at: null },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    // Check if teacher is already actively assigned to any class in the same school year
    const existingSchoolYearAssignment = await prisma.teacherClass.findFirst({
      where: {
        teacher_id: teacher.teacher_id,
        left_at: null,
        class: {
          school_year_id: classRecord.school_year_id,
        },
      },
      include: {
        class: true,
      },
    });

    if (existingSchoolYearAssignment) {
      if (existingSchoolYearAssignment.class_id === classRecord.class_id) {
        throw new Conflict('Giáo viên này hiện đang phụ trách lớp học này');
      }
      throw new Conflict(
        `Trong một năm học, mỗi giáo viên chỉ được phụ trách 01 lớp. Giáo viên ${teacher.full_name} hiện đang phụ trách lớp '${existingSchoolYearAssignment.class.name}'.`,
      );
    }

    // If isPrimary, check if class already has a primary teacher
    if (isPrimary) {
      const existingPrimary = await prisma.teacherClass.findFirst({
        where: {
          class_id: classRecord.class_id,
          is_primary: true,
          left_at: null,
        },
      });
      if (existingPrimary) {
        // Demote previous primary teacher to co-teacher
        await prisma.teacherClass.update({
          where: { id: existingPrimary.id },
          data: { is_primary: false },
        });
      }
    }

    const created = await prisma.teacherClass.create({
      data: {
        teacher_id: teacher.teacher_id,
        class_id: classRecord.class_id,
        is_primary: isPrimary,
        assigned_at: new Date(assignedAt),
      },
      include: { class: true },
    });

    return {
      allocationId: created.id.toString(),
      teacherId: teacher.public_id || teacher.teacher_id.toString(),
      classId: created.class.public_id || created.class_id.toString(),
      className: created.class.name,
      isPrimary: created.is_primary,
      assignedAt: created.assigned_at,
    };
  }

  async removeTeacherFromClass(teacherId, classId) {
    const teacher = await prisma.teacher.findFirst({
      where: { ...this._parseId(teacherId), deleted_at: null },
    });
    if (!teacher) throw new NotFound('Giáo viên không tồn tại');

    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseClassId(classId), deleted_at: null },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    const active = await prisma.teacherClass.findFirst({
      where: {
        teacher_id: teacher.teacher_id,
        class_id: classRecord.class_id,
        left_at: null,
      },
    });
    if (!active) {
      throw new NotFound('Không tìm thấy bản ghi phân công lớp đang hoạt động');
    }

    await prisma.teacherClass.update({
      where: { id: active.id },
      data: { left_at: new Date() },
    });

    return { success: true, message: 'Đã hoàn tất phân công giáo viên rời khỏi lớp học' };
  }

  async deleteTeacher(id) {
    const where = { ...this._parseId(id), deleted_at: null };
    const teacher = await prisma.teacher.findFirst({ where });
    if (!teacher) throw new NotFound('Giáo viên không tồn tại');

    await prisma.$transaction(async (tx) => {
      // 1. Soft delete teacher
      await tx.teacher.update({
        where: { teacher_id: teacher.teacher_id },
        data: {
          deleted_at: new Date(),
          work_status: 'RESIGNED',
          end_date: new Date(),
        },
      });

      // 2. Terminate active class allocations
      await tx.teacherClass.updateMany({
        where: { teacher_id: teacher.teacher_id, left_at: null },
        data: { left_at: new Date() },
      });

      // 3. Deactivate associated account if exists
      if (teacher.account_id) {
        await tx.account.update({
          where: { account_id: teacher.account_id },
          data: { is_active: false, deleted_at: new Date() },
        });
      }
    });

    return { success: true, message: 'Đã xóa hồ sơ giáo viên thành công' };
  }
}
export const teacherService = new TeacherService();
export default teacherService;
