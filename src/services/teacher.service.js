import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict, Forbidden } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { notificationService } from './notification.service.js';

export class TeacherService {
  /**
   * Helper to parse teacher identifier (uuid or employee_code)
   * Rejects numeric sequence IDs to prevent enumeration.
   */
  _parseId(id) {
    if (!id) return { public_id: '00000000-0000-0000-0000-000000000000' };
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { teacher_id: BigInt(str) };
    return { employee_code: str };
  }

  /**
   * Helper to parse class identifier (uuid or numeric class_id)
   */
  _parseClassId(id) {
    if (!id) return { public_id: '00000000-0000-0000-0000-000000000000' };
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { class_id: BigInt(str) };
    return { name: str };
  }

  /**
   * Default DiceBear Initials avatar for teacher profile
   */
  _getDefaultAvatar(seed) {
    const safeSeed = (seed || 'GV').toString().trim();
    return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(safeSeed)}`;
  }

  /**
   * List teachers with pagination, search, status, gender and class filtering
   */
  async listTeachers({
    page = 1,
    limit = 20,
    search,
    workStatus,
    gender,
    classId,
    sortBy = 'newest',
    includeDeleted = false,
  }) {
    const skip = (Math.max(1, page) - 1) * limit;

    const where = {};

    if (workStatus && workStatus !== 'ALL') {
      if (workStatus === 'RESIGNED') {
        where.OR = [
          { work_status: 'RESIGNED' },
          { deleted_at: { not: null } },
        ];
      } else {
        where.work_status = workStatus;
        where.deleted_at = null;
      }
    } else if (!includeDeleted) {
      where.deleted_at = null;
    }

    if (search && search.trim()) {
      const q = search.trim();
      const searchConditions = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { employee_code: { contains: q, mode: 'insensitive' } },
        { citizen_id: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { account: { username: { contains: q, mode: 'insensitive' } } },
      ];
      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
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
              deleted_at: true,
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
      deletedAt: t.deleted_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      account: t.account
        ? {
            id: t.account.public_id || t.account.account_id.toString(),
            publicId: t.account.public_id,
            username: t.account.username,
            isActive: t.account.is_active && !t.account.deleted_at,
            isDeleted: Boolean(t.account.deleted_at),
          }
        : null,
      assignedClasses: t.teacher_classes
        .filter((tc) => tc.left_at === null)
        .map((tc) => ({
          allocationId: tc.id.toString(),
          classId: tc.class.public_id || tc.class.class_id.toString(),
          className: tc.class.name,
          roomNumber: tc.class.room_number,
          schoolYearName: tc.class.school_year?.name,
          assignedAt: tc.assigned_at,
        })),
      assignmentHistory: t.teacher_classes.map((tc) => ({
        allocationId: tc.id.toString(),
        classId: tc.class.public_id || tc.class.class_id.toString(),
        className: tc.class.name,
        schoolYear: tc.class.school_year?.name,
        assignedAt: tc.assigned_at,
        leftAt: tc.left_at,
        leaveReason: tc.leave_reason || null,
        isActive: tc.left_at === null,
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

  /**
   * Get single teacher by ID
   */
  async getTeacherById(id) {
    const where = { ...this._parseId(id) };

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
            deleted_at: true,
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
      deletedAt: teacher.deleted_at,
      createdAt: teacher.created_at,
      updatedAt: teacher.updated_at,
      account: teacher.account
        ? {
            id: teacher.account.public_id || teacher.account.account_id.toString(),
            publicId: teacher.account.public_id,
            username: teacher.account.username,
            isActive: teacher.account.is_active && !teacher.account.deleted_at,
            isDeleted: Boolean(teacher.account.deleted_at),
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
          assignedAt: tc.assigned_at,
        })),
      assignedClasses: teacher.teacher_classes
        .filter((tc) => tc.left_at === null)
        .map((tc) => ({
          allocationId: tc.id.toString(),
          classId: tc.class.public_id || tc.class.class_id.toString(),
          className: tc.class.name,
          roomNumber: tc.class.room_number,
          ageGroup: tc.class.age_group,
          schoolYear: tc.class.school_year?.name,
          assignedAt: tc.assigned_at,
        })),
      assignmentHistory: teacher.teacher_classes.map((tc) => ({
        allocationId: tc.id.toString(),
        classId: tc.class.public_id || tc.class.class_id.toString(),
        className: tc.class.name,
        schoolYear: tc.class.school_year?.name,
        assignedAt: tc.assigned_at,
        leftAt: tc.left_at,
        leaveReason: tc.leave_reason || null,
        isActive: tc.left_at === null,
      })),
    };
  }

  /**
   * Auto-generate teacher code: CB + 2-digit join year + 001..099 (or higher)
   * e.g. CB21001 for year 2021
   */
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

    // Note: Do NOT filter deleted_at: null here because employee_code has a unique constraint across the whole table.
    const existing = await prisma.teacher.findMany({
      where: { employee_code: { startsWith: prefix, mode: 'insensitive' } },
      select: { employee_code: true },
    });

    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}(\\d{3,})$`, 'i');
    for (const t of existing) {
      const match = String(t.employee_code || '')
        .trim()
        .match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }

    let nextSeqNum = maxSeq + 1;
    let candidateCode = `${prefix}${String(nextSeqNum).padStart(3, '0')}`;

    // Guarantee uniqueness in database against any gaps, concurrency or existing codes
    while (
      await prisma.teacher.findFirst({
        where: { employee_code: { equals: candidateCode, mode: 'insensitive' } },
        select: { teacher_id: true },
      })
    ) {
      nextSeqNum++;
      candidateCode = `${prefix}${String(nextSeqNum).padStart(3, '0')}`;
    }

    return candidateCode;
  }

  /**
   * Create teacher with transactional account binding
   */
  async createTeacher(data) {
    let isAutoGenerated = false;
    let finalCode = data.employeeCode?.trim().toUpperCase();

    // Auto-generate if code is not provided, legacy GV prefix, or standard system CB prefix
    if (
      !finalCode ||
      finalCode.startsWith('GV') ||
      finalCode.startsWith('CB')
    ) {
      finalCode = await this._generateTeacherCode(data.startDate || data.joinDate);
      isAutoGenerated = true;
    }

    // 1. Verify code and citizen_id uniqueness against the entire table
    const codeConflict = await prisma.teacher.findFirst({
      where: { employee_code: { equals: finalCode, mode: 'insensitive' } },
    });
    if (codeConflict) {
      if (isAutoGenerated) {
        finalCode = await this._generateTeacherCode(data.startDate || data.joinDate);
      } else {
        throw new Conflict(`Mã giáo viên '${finalCode}' đã tồn tại trên hệ thống`);
      }
    }

    const citizenConflict = await prisma.teacher.findFirst({
      where: { citizen_id: data.citizenId },
    });
    if (citizenConflict) {
      throw new Conflict(`Số CCCD '${data.citizenId}' đã được đăng ký bởi giáo viên khác (${citizenConflict.full_name})`);
    }

    if (data.phone && data.phone.trim()) {
      const phoneConflict = await prisma.teacher.findFirst({
        where: { phone: data.phone.trim(), deleted_at: null },
      });
      if (phoneConflict) {
        throw new Conflict(`Số điện thoại '${data.phone.trim()}' đã được đăng ký bởi giáo viên khác (${phoneConflict.full_name})`);
      }
    }

    if (data.email && data.email.trim()) {
      const emailConflict = await prisma.teacher.findFirst({
        where: { email: { equals: data.email.trim(), mode: 'insensitive' }, deleted_at: null },
      });
      if (emailConflict) {
        throw new Conflict(`Email '${data.email.trim()}' đã được đăng ký bởi giáo viên khác (${emailConflict.full_name})`);
      }
    }

    // 2. Create teacher profile with retry on concurrent employee_code conflict
    let attempts = 0;
    const maxAttempts = 3;
    let createdTeacher;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        createdTeacher = await prisma.$transaction(async (tx) => {
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
                  assigned_at: new Date(),
                },
              });
            }
          }

          return teacher;
        });

        break;
      } catch (err) {
        if (
          err.code === 'P2002' &&
          err.meta?.target?.includes('employee_code') &&
          isAutoGenerated &&
          attempts < maxAttempts
        ) {
          logger.warn(
            { finalCode, attempt: attempts },
            'Teacher employee_code collision detected during insert, regenerating code...',
          );
          finalCode = await this._generateTeacherCode(data.startDate || data.joinDate);
          continue;
        }
        throw err;
      }
    }

    logger.info(
      { teacherId: createdTeacher.teacher_id.toString(), employeeCode: finalCode },
      'Created teacher profile and account',
    );

    return this.getTeacherById(createdTeacher.public_id || createdTeacher.teacher_id.toString());
  }

  /**
   * Update teacher profile
   */
  async updateTeacher(id, data, currentUser = null) {
    const where = { ...this._parseId(id), deleted_at: null };
    const teacher = await prisma.teacher.findFirst({
      where,
      include: { account: true },
    });
    if (!teacher) {
      throw new NotFound('Giáo viên không tồn tại trên hệ thống');
    }

    // CR-18 Optimistic Concurrency Control
    if (data.updatedAt || data.updated_at) {
      const clientTime = new Date(data.updatedAt || data.updated_at).getTime();
      const serverTime = new Date(teacher.updated_at).getTime();
      if (!isNaN(clientTime) && !isNaN(serverTime) && Math.abs(serverTime - clientTime) > 1000) {
        throw new Conflict('Dữ liệu đã được cập nhật trong một phiên khác. Thay đổi của bạn chưa được lưu. Vui lòng tải lại dữ liệu mới nhất và thực hiện lại.');
      }
    }

    if (currentUser) {
      const isSelf =
        (teacher.account_id && currentUser.accountId && String(teacher.account_id) === String(currentUser.accountId)) ||
        (teacher.public_id && currentUser.teacherId && teacher.public_id === currentUser.teacherId) ||
        (currentUser.sub && (teacher.public_id === currentUser.sub || String(teacher.account_id) === String(currentUser.sub)));
      if (isSelf) {
        delete data.position;
        delete data.role;
        delete data.workStatus;
      }
    }

    if (data.citizenId && data.citizenId !== teacher.citizen_id) {
      const conflict = await prisma.teacher.findFirst({
        where: {
          citizen_id: data.citizenId,
          teacher_id: { not: teacher.teacher_id },
        },
      });
      if (conflict) {
        throw new Conflict(`Số CCCD '${data.citizenId}' đã được sử dụng bởi giáo viên khác (${conflict.full_name})`);
      }
    }

    if (data.phone && data.phone.trim() && data.phone.trim() !== (teacher.phone || '').trim()) {
      const conflict = await prisma.teacher.findFirst({
        where: {
          phone: data.phone.trim(),
          teacher_id: { not: teacher.teacher_id },
          deleted_at: null,
        },
      });
      if (conflict) {
        throw new Conflict(`Số điện thoại '${data.phone.trim()}' đã được sử dụng bởi giáo viên khác (${conflict.full_name})`);
      }
    }

    if (data.email && data.email.trim() && data.email.trim().toLowerCase() !== (teacher.email || '').trim().toLowerCase()) {
      const conflict = await prisma.teacher.findFirst({
        where: {
          email: { equals: data.email.trim(), mode: 'insensitive' },
          teacher_id: { not: teacher.teacher_id },
          deleted_at: null,
        },
      });
      if (conflict) {
        throw new Conflict(`Email '${data.email.trim()}' đã được sử dụng bởi giáo viên khác (${conflict.full_name})`);
      }
    }

    const normWorkStatus = data.workStatus ? (
      data.workStatus.toLowerCase() === 'resigned' ? 'RESIGNED' :
      data.workStatus.toLowerCase() === 'on_leave' || data.workStatus.toLowerCase() === 'leave_of_absence' ? 'LEAVE_OF_ABSENCE' :
      data.workStatus.toUpperCase()
    ) : undefined;

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
    if (normWorkStatus !== undefined) teacherUpdate.work_status = normWorkStatus;
    if (data.startDate !== undefined) teacherUpdate.start_date = new Date(data.startDate);
    if (data.endDate !== undefined) {
      teacherUpdate.end_date = data.endDate ? new Date(data.endDate) : null;
    } else if (normWorkStatus === 'RESIGNED' && !teacher.end_date) {
      teacherUpdate.end_date = new Date();
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update teacher profile
      await tx.teacher.update({
        where: { teacher_id: teacher.teacher_id },
        data: teacherUpdate,
      });

      // 2. If status changes to LEAVE_OF_ABSENCE or RESIGNED -> terminate active class assignment (left_at = now, leave_reason = workStatus)
      if (
        normWorkStatus === 'LEAVE_OF_ABSENCE' ||
        normWorkStatus === 'RESIGNED'
      ) {
        const activeAllocation = await tx.teacherClass.findFirst({
          where: {
            teacher_id: teacher.teacher_id,
            left_at: null,
          },
        });
        if (activeAllocation) {
          await tx.teacherClass.update({
            where: { id: activeAllocation.id },
            data: {
              left_at: new Date(),
              leave_reason: normWorkStatus,
            },
          });
        }
      }

      // 3. If status changes to RESIGNED -> lock user account (is_active = false)
      const targetAccountId = teacher.account_id || teacher.account?.account_id;
      if (normWorkStatus === 'RESIGNED' && targetAccountId) {
        await tx.account.update({
          where: { account_id: targetAccountId },
          data: { is_active: false },
        });
      }
    });

    return this.getTeacherById(teacher.public_id || teacher.teacher_id.toString());
  }

  /**
   * Assign teacher to homeroom class
   */
  async assignTeacherToClass(teacherId, { classId, assignedAt = new Date() } = {}) {
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

    const created = await prisma.teacherClass.create({
      data: {
        teacher_id: teacher.teacher_id,
        class_id: classRecord.class_id,
        assigned_at: new Date(assignedAt),
      },
      include: { class: true },
    });

    // Notification 3: Assign Teacher to Class (BGH phân công GV vào lớp)
    if (teacher.account_id) {
      notificationService
        .emitSystemNotification({
          recipientAccountIds: [teacher.account_id],
          type: 'SCHOOL_ANNOUNCEMENT',
          title: 'Phân công lớp học mới',
          body: `Bạn đã được Ban Giám Hiệu phân công giảng dạy tại lớp ${classRecord.name}.`,
          data: {
            type: 'TEACHER_CLASS_ASSIGNED',
            classId: classRecord.class_id.toString(),
            teacherId: teacher.teacher_id.toString(),
          },
        })
        .catch(() => {});
    }

    return {
      allocationId: created.id.toString(),
      teacherId: teacher.public_id || teacher.teacher_id.toString(),
      classId: created.class.public_id || created.class_id.toString(),
      className: created.class.name,
      assignedAt: created.assigned_at,
    };
  }

  /**
   * Remove teacher from class assignment (sets left_at)
   */
  async removeTeacherFromClass(teacherId, classId) {
    const teacher = await prisma.teacher.findFirst({
      where: { ...this._parseId(teacherId), deleted_at: null },
    });
    if (!teacher) throw new NotFound('Giáo viên không tồn tại');

    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseClassId(classId), deleted_at: null },
      include: { school_year: true },
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

    // Preserve assignment history by setting left_at and leave_reason
    await prisma.teacherClass.update({
      where: { id: active.id },
      data: {
        left_at: new Date(),
        leave_reason: 'REMOVED',
      },
    });

    // Notification 4: Unassign Teacher From Class (BGH gỡ GV khỏi lớp)
    if (teacher.account_id) {
      notificationService
        .emitSystemNotification({
          recipientAccountIds: [teacher.account_id],
          type: 'SCHOOL_ANNOUNCEMENT',
          title: 'Gỡ phân công lớp học',
          body: `Bạn đã được gỡ khỏi danh sách giáo viên phụ trách lớp ${classRecord.name}.`,
          data: {
            type: 'TEACHER_CLASS_UNASSIGNED',
            classId: classRecord.class_id.toString(),
            teacherId: teacher.teacher_id.toString(),
          },
        })
        .catch(() => {});
    }

    return { success: true, message: 'Đã hoàn tất gỡ giáo viên khỏi lớp học' };
  }

  /**
   * Soft delete teacher
   */
  async deleteTeacher(id, currentUser = null) {
    // 1. Query teacher existence
    const where = { ...this._parseId(id), deleted_at: null };
    const teacher = await prisma.teacher.findFirst({ where });
    if (!teacher) throw new NotFound('Giáo viên không tồn tại');

    if (currentUser) {
      const isSelf =
        (teacher.account_id && currentUser.accountId && String(teacher.account_id) === String(currentUser.accountId)) ||
        (teacher.public_id && currentUser.teacherId && teacher.public_id === currentUser.teacherId) ||
        (currentUser.sub && (teacher.public_id === currentUser.sub || String(teacher.account_id) === String(currentUser.sub)));
      if (isSelf) {
        throw new Forbidden('Không thể tự xóa hồ sơ của chính mình');
      }
    }

    // 2. Query related assignments and account-authored activities
    const teacherData = await prisma.teacher.findUnique({
      where: { teacher_id: teacher.teacher_id },
      select: {
        _count: {
          select: {
            teacher_classes: true,
          },
        },
      },
    });
    const totalAssignments = teacherData?._count?.teacher_classes || 0;

    let authoredCount = 0;
    if (teacher.account_id) {
      const accountData = await prisma.account.findUnique({
        where: { account_id: teacher.account_id },
        select: {
          _count: {
            select: {
              attendances_checked_in: true,
              attendances_checked_out: true,
              health_assessments_recorded: true,
              daily_assessments_evaluated: true,
              monthly_assessments_evaluated: true,
              semester_assessments_evaluated: true,
              created_educational_activities: true,
              created_sub_theme_activities: true,
              sub_themes_created: true,
            },
          },
        },
      });
      if (accountData?._count) {
        authoredCount = Object.values(accountData._count).reduce((acc, c) => acc + (c || 0), 0);
      }
    }

    if (totalAssignments > 0 || authoredCount > 0) {
      throw new BadRequest(
        'Không thể xóa giáo viên đã có dữ liệu phân công giảng dạy hoặc dữ liệu phát sinh trong hệ thống. Vui lòng chuyển trạng thái sang Nghỉ việc.'
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Soft delete teacher and mark as RESIGNED
      await tx.teacher.update({
        where: { teacher_id: teacher.teacher_id },
        data: {
          work_status: 'RESIGNED',
          end_date: new Date(),
          deleted_at: new Date(),
        },
      });

      // 2. End any active class assignments
      await tx.teacherClass.updateMany({
        where: { teacher_id: teacher.teacher_id, left_at: null },
        data: { left_at: new Date(), leave_reason: 'RESIGNED' },
      });

      // 3. Deactivate associated account if exists (BR-14(3), BR-24(3))
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
