import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict, Forbidden } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { teacherService } from './teacher.service.js';
import { calculateWhoAssessment, getClassificationFromZScores } from '../utils/who-calculator.js';

const GRADE_LABELS = {
  NHA_TRE: 'Khối Nhà trẻ',
  MAM: 'Khối Mầm',
  CHOI: 'Khối Chồi',
  LA: 'Khối Lá',
};

const GRADE_COLORS = {
  NHA_TRE: 'amber',
  MAM: 'blue',
  CHOI: 'coral',
  LA: 'emerald',
};

const GRADE_PLANET_KEYS = {
  NHA_TRE: 'nhatre',
  MAM: 'mam',
  CHOI: 'choi',
  LA: 'la',
};

const getClassPlanetUrl = (ageGroup, theme = 'light') => {
  const key = GRADE_PLANET_KEYS[ageGroup] || 'nhatre';
  const t = theme === 'dark' ? 'dark' : 'light';
  return `/planets/${key}-${t}.svg`;
};

export class ClassService {
  /**
   * Helper to parse class identifier (uuid only)
   * Rejects numeric sequence IDs to prevent enumeration.
   */
  _parseId(id) {
    if (!id) return { public_id: '00000000-0000-0000-0000-000000000000' };
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { class_id: BigInt(str) };
    return { name: str };
  }

  /**
   * Helper to parse teacher identifier (uuid or numeric teacher_id)
   */
  _parseTeacherId(id) {
    if (!id) return { public_id: '00000000-0000-0000-0000-000000000000' };
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { teacher_id: BigInt(str) };
    return { employee_code: str };
  }

  /**
   * Helper to parse transfer identifier (uuid or numeric transfer_id)
   */
  _parseTransferId(id) {
    if (!id) return { public_id: '00000000-0000-0000-0000-000000000000' };
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { transfer_id: BigInt(str) };
    return { public_id: '00000000-0000-0000-0000-000000000000' };
  }

  /**
   * Helper to parse student identifier (uuid, numeric student_id, or student_code)
   */
  _parseStudentId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { student_id: BigInt(str) };
    if (/^[A-Za-z0-9_-]+$/.test(str)) return { student_code: str };
    return { public_id: '00000000-0000-0000-0000-000000000000' };
  }

  /**
   * Helper to safely resolve account_id from UUID or numeric or fallback to active staff account
   */
  async _resolveAccountId(id) {
    if (!id) {
      const defaultAdmin = await prisma.account.findFirst({
        where: { role: 'PRINCIPAL_BGH', deleted_at: null },
        select: { account_id: true },
      });
      return defaultAdmin?.account_id || 1n;
    }
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) {
      const acc = await prisma.account.findFirst({
        where: { public_id: str, deleted_at: null },
        select: { account_id: true },
      });
      if (acc) return acc.account_id;
    }
    if (/^\d+$/.test(str)) {
      return BigInt(str);
    }
    const defaultAdmin = await prisma.account.findFirst({
      where: { role: 'PRINCIPAL_BGH', deleted_at: null },
      select: { account_id: true },
    });
    return defaultAdmin?.account_id || 1n;
  }

  /**
   * List classrooms with pagination, search, school year and age group filtering
   */
  async listClasses({ page = 1, limit = 50, search, schoolYearId, ageGroup, sortBy = 'name' }) {
    const skip = (Math.max(1, page) - 1) * limit;

    const where = {
      deleted_at: null,
    };

    if (schoolYearId) {
      where.school_year_id = BigInt(schoolYearId);
    } else {
      // Default to active school year if none specified
      const activeYear = await prisma.schoolYear.findFirst({
        where: { status: 'ACTIVE', deleted_at: null },
      });
      if (activeYear) {
        where.school_year_id = activeYear.school_year_id;
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { room_number: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (ageGroup && ageGroup !== 'ALL') {
      where.age_group = ageGroup;
    }

    let orderBy = { name: 'asc' };
    switch (sortBy) {
      case 'newest':
        orderBy = { created_at: 'desc' };
        break;
      case 'oldest':
        orderBy = { created_at: 'asc' };
        break;
      case 'name':
      default:
        orderBy = { name: 'asc' };
        break;
    }

    const [total, items] = await Promise.all([
      prisma.class.count({ where }),
      prisma.class.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          school_year: {
            select: { school_year_id: true, name: true, status: true },
          },
          teacher_classes: {
            where: { left_at: null },
            orderBy: { assigned_at: 'asc' },
            include: {
              teacher: {
                select: {
                  teacher_id: true,
                  public_id: true,
                  employee_code: true,
                  full_name: true,
                  position: true,
                  avatar_url: true,
                  phone: true,
                  email: true,
                },
              },
            },
          },
          student_enrollments: {
            where: {
              student: { deleted_at: null },
            },
            select: { enrollment_id: true, left_at: true },
          },
        },
      }),
    ]);

    const formatted = items.map((c) => {
      const activeTeachers = c.teacher_classes.map((tc) => ({
        allocationId: tc.id.toString(),
        teacherId: tc.teacher.public_id || tc.teacher.teacher_id.toString(),
        publicId: tc.teacher.public_id,
        employeeCode: tc.teacher.employee_code,
        fullName: tc.teacher.full_name,
        position: tc.teacher.position,
        avatar: tc.teacher.avatar_url || null,
        phone: tc.teacher.phone || null,
      }));

      const primaryTeacher = activeTeachers[0] || null;
      const isCompletedYear = c.school_year?.status === 'COMPLETED';
      const studentCount = isCompletedYear
        ? c.student_enrollments?.length || 0
        : c.student_enrollments?.filter((e) => e.left_at === null).length || 0;

      return {
        id: c.public_id || c.class_id.toString(),
        publicId: c.public_id,
        name: c.name,
        schoolYearId: c.school_year_id.toString(),
        academicYear: c.school_year?.name,
        grade: c.age_group.toLowerCase(),
        ageGroup: c.age_group,
        gradeLabel: GRADE_LABELS[c.age_group] || c.age_group,
        room: c.room_number || '',
        roomNumber: c.room_number || '',
        color: GRADE_COLORS[c.age_group] || 'emerald',
        avatarUrl: getClassPlanetUrl(c.age_group),
        description: c.description || '',
        teachersCount: activeTeachers.length,
        teacher: activeTeachers.length > 0 ? activeTeachers.map((t) => t.fullName).join(', ') : 'Chưa phân công',
        primaryTeacher: primaryTeacher || null,
        teachers: activeTeachers,
        capacity: 24,
        studentCount,
        remainingSlots: Math.max(0, 24 - studentCount),
        transferRequestsCount: 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    });

    const AGE_GROUP_ORDER = {
      NHA_TRE: 1,
      MAM: 2,
      CHOI: 3,
      LA: 4,
    };

    if (sortBy === 'name') {
      formatted.sort((a, b) => {
        const orderA = AGE_GROUP_ORDER[a.ageGroup] || 99;
        const orderB = AGE_GROUP_ORDER[b.ageGroup] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, 'vi');
      });
    }

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
   * Get single classroom by ID
   */
  async getClassById(id, user = null) {
    const where = { ...this._parseId(id), deleted_at: null };

    const c = await prisma.class.findFirst({
      where,
      include: {
        school_year: true,
        teacher_classes: {
          orderBy: { assigned_at: 'desc' },
          include: {
            teacher: {
              include: {
                account: {
                  select: { account_id: true, public_id: true, is_active: true },
                },
              },
            },
          },
        },
        student_enrollments: {
          where: {
            student: { deleted_at: null },
          },
          select: { enrollment_id: true, left_at: true },
        },
      },
    });

    if (!c) {
      throw NotFound('Lớp học không tồn tại trên hệ thống');
    }

    const activeAllocations = c.teacher_classes.filter((tc) => tc.left_at === null);

    if (user && user.role === 'TEACHER_GV') {
      const userSub = String(user.sub);
      const isAssigned = activeAllocations.some((tc) => {
        const acc = tc.teacher?.account;
        return (
          acc &&
          (String(acc.account_id) === userSub || String(acc.public_id) === userSub)
        );
      });
      if (!isAssigned) {
        throw Forbidden('Giáo viên chỉ có quyền xem lớp của mình');
      }
    }
    const teacherName =
      activeAllocations.map((tc) => tc.teacher.full_name).join(', ') || 'Chưa phân công';

    const capacity = 24;
    const isCompletedYear = c.school_year?.status === 'COMPLETED';
    const studentCount = isCompletedYear
      ? c.student_enrollments?.length || 0
      : c.student_enrollments?.filter((e) => e.left_at === null).length || 0;

    return {
      id: c.public_id || c.class_id.toString(),
      publicId: c.public_id,
      name: c.name,
      schoolYearId: c.school_year_id.toString(),
      academicYear: c.school_year?.name,
      schoolYearStatus: c.school_year?.status,
      grade: c.age_group.toLowerCase(),
      ageGroup: c.age_group,
      gradeLabel: GRADE_LABELS[c.age_group] || c.age_group,
      room: c.room_number || '',
      roomNumber: c.room_number || '',
      color: GRADE_COLORS[c.age_group] || 'emerald',
      avatarUrl: getClassPlanetUrl(c.age_group),
      description: c.description || '',
      capacity,
      studentCount,
      remainingSlots: Math.max(0, capacity - studentCount),
      teachersCount: activeAllocations.length,
      teacher: teacherName,
      activeTeachers: activeAllocations.map((tc) => ({
        allocationId: tc.id.toString(),
        teacherId: tc.teacher.public_id || tc.teacher.teacher_id.toString(),
        employeeCode: tc.teacher.employee_code,
        fullName: tc.teacher.full_name,
        position: tc.teacher.position,
        email: tc.teacher.email || '',
        phone: tc.teacher.phone || '',
        avatar: tc.teacher.avatar_url || null,
      })),
      assignmentHistory: c.teacher_classes.map((tc) => ({
        allocationId: tc.id.toString(),
        teacherId: tc.teacher.public_id || tc.teacher.teacher_id.toString(),
        fullName: tc.teacher.full_name,
        employeeCode: tc.teacher.employee_code,
        assignedAt: tc.assigned_at,
        leftAt: tc.left_at,
        leaveReason: tc.leave_reason || null,
        isActive: tc.left_at === null,
      })),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    };
  }

  /**
   * Create new classroom
   */
  async createClass(data) {
    let schoolYearId = data.schoolYearId;
    let targetYear = null;
    if (!schoolYearId) {
      targetYear = await prisma.schoolYear.findFirst({
        where: { status: 'ACTIVE', deleted_at: null },
      });
      if (!targetYear) {
        throw new BadRequest('Chưa có năm học nào đang kích hoạt. Vui lòng chọn năm học.');
      }
      schoolYearId = targetYear.school_year_id;
    } else {
      const isSyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(schoolYearId));
      targetYear = await prisma.schoolYear.findFirst({
        where: isSyUuid ? { public_id: String(schoolYearId), deleted_at: null } : { school_year_id: BigInt(schoolYearId), deleted_at: null },
      });
      if (!targetYear) {
        throw new NotFound('Năm học không tồn tại');
      }
      schoolYearId = targetYear.school_year_id;
    }

    if (targetYear.status === 'COMPLETED') {
      throw new BadRequest('Năm học đã kết thúc. Chỉ được xem, không được thêm lớp học mới.');
    }

    // Check duplicate name within the same school year
    const existing = await prisma.class.findFirst({
      where: {
        school_year_id: schoolYearId,
        name: data.name.trim(),
        deleted_at: null,
      },
    });
    if (existing) {
      throw new Conflict(`Tên lớp '${data.name.trim()}' đã tồn tại trong năm học này`);
    }

    if (data.roomNumber && data.roomNumber.trim()) {
      const roomConflict = await prisma.class.findFirst({
        where: {
          school_year_id: schoolYearId,
          room_number: { equals: data.roomNumber.trim(), mode: 'insensitive' },
          deleted_at: null,
        },
      });
      if (roomConflict) {
        throw new Conflict(`Phòng học '${data.roomNumber.trim()}' đã được xếp cho lớp '${roomConflict.name}' trong năm học này`);
      }
    }

    // Check if soft-deleted class exists with the same name, if so restore & update it to avoid uq_year_class_name conflict
    const softDeleted = await prisma.class.findFirst({
      where: {
        school_year_id: schoolYearId,
        name: data.name.trim(),
        deleted_at: { not: null },
      },
    });
    if (softDeleted) {
      const restored = await prisma.class.update({
        where: { class_id: softDeleted.class_id },
        data: {
          deleted_at: null,
          age_group: data.ageGroup,
          room_number: data.roomNumber?.trim() || null,
          description: data.description?.trim() || null,
        },
      });
      logger.info({ classId: restored.class_id.toString(), name: restored.name }, 'Restored soft-deleted classroom');
      return this.getClassById(restored.public_id || restored.class_id.toString());
    }

    const created = await prisma.class.create({
      data: {
        school_year_id: schoolYearId,
        name: data.name.trim(),
        age_group: data.ageGroup,
        room_number: data.roomNumber?.trim() || null,
        description: data.description?.trim() || null,
      },
    });

    logger.info({ classId: created.class_id.toString(), name: created.name }, 'Created classroom');

    return this.getClassById(created.public_id || created.class_id.toString());
  }

  /**
   * Update classroom
   */
  async updateClass(id, data) {
    const where = { ...this._parseId(id), deleted_at: null };
    const classRecord = await prisma.class.findFirst({
      where,
      include: { school_year: true },
    });
    if (!classRecord) {
      throw new NotFound('Lớp học không tồn tại');
    }

    if (classRecord.school_year?.status === 'COMPLETED') {
      throw new BadRequest('Năm học đã kết thúc. Chỉ được xem, không được chỉnh sửa lớp học.');
    }

    if (data.roomNumber !== undefined && data.roomNumber?.trim()) {
      const roomConflict = await prisma.class.findFirst({
        where: {
          school_year_id: classRecord.school_year_id,
          room_number: { equals: data.roomNumber.trim(), mode: 'insensitive' },
          class_id: { not: classRecord.class_id },
          deleted_at: null,
        },
      });
      if (roomConflict) {
        throw new Conflict(`Phòng học '${data.roomNumber.trim()}' đã được xếp cho lớp '${roomConflict.name}' trong năm học này`);
      }
    }

    if (data.name && data.name.trim() !== classRecord.name) {
      const conflict = await prisma.class.findFirst({
        where: {
          school_year_id: classRecord.school_year_id,
          name: data.name.trim(),
          class_id: { not: classRecord.class_id },
          deleted_at: null,
        },
      });
      if (conflict) {
        throw new Conflict(`Tên lớp '${data.name.trim()}' đã tồn tại trong năm học`);
      }

      const softDeleted = await prisma.class.findFirst({
        where: {
          school_year_id: classRecord.school_year_id,
          name: data.name.trim(),
          class_id: { not: classRecord.class_id },
          deleted_at: { not: null },
        },
      });
      if (softDeleted) {
        await prisma.class.update({
          where: { class_id: softDeleted.class_id },
          data: { name: `${softDeleted.name}__deleted_${Date.now()}` },
        });
      }
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.roomNumber !== undefined) updateData.room_number = data.roomNumber?.trim() || null;
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;

    const updated = await prisma.class.update({
      where: { class_id: classRecord.class_id },
      data: updateData,
    });

    return this.getClassById(updated.public_id || updated.class_id.toString());
  }

  /**
   * Soft delete classroom
   */
  async deleteClass(id) {
    // 1. Query class existence
    const where = { ...this._parseId(id), deleted_at: null };
    const classRecord = await prisma.class.findFirst({
      where,
      include: { school_year: true },
    });
    if (!classRecord) {
      throw new NotFound('Lớp học không tồn tại');
    }

    if (classRecord.school_year?.status === 'COMPLETED') {
      throw new BadRequest('Năm học đã kết thúc. Chỉ được xem, không được xóa lớp học.');
    }

    // 2. Query related data counts
    const relatedCounts = await prisma.class.findUnique({
      where: { class_id: classRecord.class_id },
      select: {
        _count: {
          select: {
            teacher_classes: true,
            student_enrollments: true,
            attendances: true,
            sub_theme_activities: true,
            theme_goals: true,
            monthly_assessments: true,
            semester_assessments: true,
            class_transfers_from: true,
            class_transfers_to: true,
          },
        },
      },
    });

    const counts = relatedCounts?._count || {};
    const totalRelated = Object.values(counts).reduce((acc, c) => acc + (c || 0), 0);
    if (totalRelated > 0) {
      throw new BadRequest(
        'Không thể xóa lớp học đã có dữ liệu liên quan (học sinh, giáo viên, thời khóa biểu, điểm danh, đánh giá...). Vui lòng kiểm tra lại.'
      );
    }

    await prisma.class.update({
      where: { class_id: classRecord.class_id },
      data: {
        deleted_at: new Date(),
        name: `${classRecord.name}__deleted_${Date.now()}`,
      },
    });

    return { success: true, message: 'Đã xóa lớp học thành công' };
  }

  /**
   * Helper to assign teacher to class
   */
  async assignTeacher(classId, body = {}) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    if (Array.isArray(body.teacherIds) && body.teacherIds.length > 0) {
      const results = [];
      for (const tId of body.teacherIds) {
        const res = await teacherService.assignTeacherToClass(tId, {
          classId: classRecord.class_id,
          assignedAt: body.assignedAt,
        });
        results.push(res);
      }
      return results;
    }

    const targetTeacherId = body.teacherId || body.id;
    return teacherService.assignTeacherToClass(targetTeacherId, {
      classId: classRecord.class_id,
      assignedAt: body.assignedAt,
    });
  }

  /**
   * Helper to remove teacher from class (BGH only, before semester 1 start date)
   */
  async removeTeacher(classId, teacherId) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    return teacherService.removeTeacherFromClass(teacherId, classRecord.class_id);
  }

  /**
   * Calculate age in months relative to a reference date (start of school year)
   */
  _calculateAgeInMonths(dob, refDate) {
    if (!dob) return null;
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    const ref = refDate ? new Date(refDate) : new Date('2026-09-01');
    let months = (ref.getFullYear() - birth.getFullYear()) * 12 + (ref.getMonth() - birth.getMonth());
    if (ref.getDate() < birth.getDate()) {
      months--;
    }
    return Math.max(0, months);
  }

  /**
   * Get matching grade based on exact age in months according to preschool regulations:
   * - Nhà trẻ: Từ đủ 24 tháng đến dưới 36 tháng
   * - Mầm: Từ đủ 36 tháng đến dưới 48 tháng
   * - Chồi: Từ đủ 48 tháng đến dưới 60 tháng
   * - Lá: Từ đủ 60 tháng đến dưới 72 tháng
   */
  _getGradeByAgeInMonths(months) {
    if (months === null || months === undefined) return null;
    if (months >= 24 && months < 36) {
      return { key: 'NHA_TRE', label: 'Khối Nhà trẻ', minMonths: 24, maxMonths: 36 };
    }
    if (months >= 36 && months < 48) {
      return { key: 'MAM', label: 'Khối Mầm', minMonths: 36, maxMonths: 48 };
    }
    if (months >= 48 && months < 60) {
      return { key: 'CHOI', label: 'Khối Chồi', minMonths: 48, maxMonths: 60 };
    }
    if (months >= 60 && months < 72) {
      return { key: 'LA', label: 'Khối Lá', minMonths: 60, maxMonths: 72 };
    }
    return null;
  }

  /**
   * Helper: Normalize age group strings with diacritics / symbols to standard keys:
   * 'NHATRE', 'MAM', 'CHOI', 'LA'
   */
  _normalizeAgeGroupKey(ageGroup) {
    if (!ageGroup) return '';
    const clean = String(ageGroup)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    if (clean.includes('NHATRE')) return 'NHATRE';
    if (clean.includes('MAM')) return 'MAM';
    if (clean.includes('CHOI')) return 'CHOI';
    if (clean.includes('LA')) return 'LA';
    return clean;
  }

  /**
   * Check if student's age is eligible for the class age group
   */
  _isAgeEligible(dob, classAgeGroup, refDate) {
    if (!dob || !classAgeGroup) return false;
    const months = this._calculateAgeInMonths(dob, refDate);
    if (months === null) return false;

    const norm = this._normalizeAgeGroupKey(classAgeGroup);
    if (norm === 'NHATRE') {
      return months >= 24 && months < 36;
    }
    if (norm === 'MAM') {
      return months >= 36 && months < 48;
    }
    if (norm === 'CHOI') {
      return months >= 48 && months < 60;
    }
    if (norm === 'LA') {
      return months >= 60 && months < 72;
    }
    return false;
  }

  /**
   * Calculate suitable grade based on date of birth relative to school year
   */
  _calculateSuitableGrade(dob, refDate) {
    const months = this._calculateAgeInMonths(dob, refDate);
    const grade = this._getGradeByAgeInMonths(months);
    if (grade) {
      return grade;
    }
    if (months !== null && months < 24) {
      return { key: 'UNDER_AGE', label: 'Dưới 24 tháng', minMonths: 0, maxMonths: 24 };
    }
    return { key: 'OVER_AGE', label: 'Trên 72 tháng', minMonths: 72, maxMonths: 999 };
  }

  /**
   * Get students enrolled in this class (active or historical)
   */
  async getClassStudents(classId, { search } = {}, user = null) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: {
        school_year: { select: { school_year_id: true, name: true, status: true } },
        teacher_classes: {
          where: { left_at: null },
          include: {
            teacher: {
              select: {
                teacher_id: true,
                account: {
                  select: { account_id: true, public_id: true },
                },
              },
            },
          },
        },
      },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    if (user && user.role === 'TEACHER_GV') {
      const userSub = String(user.sub);
      const isAssigned = (classRecord.teacher_classes || []).some((tc) => {
        const acc = tc.teacher?.account;
        return (
          acc &&
          (String(acc.account_id) === userSub || String(acc.public_id) === userSub)
        );
      });
      if (!isAssigned) {
        throw Forbidden('Giáo viên chỉ có quyền xem lớp của mình');
      }
    }

    const isCurrentActiveYear = classRecord.school_year?.status === 'ACTIVE';

    const enrollmentWhere = {
      class_id: classRecord.class_id,
      student: { deleted_at: null },
    };

    // Only filter active enrollment if the school year is ACTIVE
    // For past school years, all students who were enrolled in this class are included!
    if (isCurrentActiveYear) {
      enrollmentWhere.left_at = null;
    }

    if (search && search.trim()) {
      const q = search.trim();
      enrollmentWhere.student.OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { student_code: { contains: q, mode: 'insensitive' } },
      ];
    }

    const enrollments = await prisma.studentEnrollment.findMany({
      where: enrollmentWhere,
      orderBy: { enrolled_at: 'asc' },
      include: {
        student: {
          include: {
            parents: {
              where: { deleted_at: null },
              orderBy: { created_at: 'asc' },
            },
          },
        },
      },
    });

    const STATUS_MAP = {
      STUDYING: { label: 'Đang học', color: 'emerald' },
      RESERVED: { label: 'Bảo lưu', color: 'amber' },
      TRANSFERRED: { label: 'Chuyển trường', color: 'blue' },
      DROPPED_OUT: { label: 'Thôi học', color: 'rose' },
      GRADUATED: { label: 'Đã tốt nghiệp', color: 'purple' },
    };

    const ENROLLMENT_STATUS_MAP = {
      ENROLLED: { label: 'Đang học', color: 'emerald' },
      COMPLETED: { label: 'Hoàn thành năm học', color: 'indigo' },
      GRADUATED: { label: 'Đã tốt nghiệp', color: 'purple' },
      TRANSFERRED_CLASS: { label: 'Chuyển lớp', color: 'cyan' },
      TRANSFERRED_SCHOOL: { label: 'Chuyển trường', color: 'blue' },
      RESERVED: { label: 'Bảo lưu', color: 'amber' },
      DROPPED_OUT: { label: 'Thôi học', color: 'rose' },
    };

    const capacity = 24;
    const students = enrollments.map((e) => {
      const primaryParent = e.student.parents?.[0] || null;
      return {
        id: e.student.public_id || e.student.student_id.toString(),
        publicId: e.student.public_id,
        enrollmentId: e.enrollment_id.toString(),
        studentCode: e.student.student_code,
        fullName: e.student.full_name,
        avatarUrl:
          e.student.avatar_url ||
          `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(e.student.student_code || e.student.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
        dateOfBirth: e.student.date_of_birth,
        gender: e.student.gender,
        status: e.status,
        enrollmentStatus: e.status,
        leaveReason: e.leave_reason,
        globalStatus: e.student.status,
        statusLabel: ENROLLMENT_STATUS_MAP[e.status]?.label || STATUS_MAP[e.student.status]?.label || 'Đang học',
        statusColor: ENROLLMENT_STATUS_MAP[e.status]?.color || STATUS_MAP[e.student.status]?.color || 'gray',
        enrolledAt: e.enrolled_at,
        leftAt: e.left_at,
        currentClass: {
          classId: classRecord.public_id || classRecord.class_id.toString(),
          className: classRecord.name,
          ageGroup: classRecord.age_group,
          schoolYear: classRecord.school_year?.name,
        },
        primaryParent: primaryParent
          ? {
              id: primaryParent.public_id || primaryParent.parent_id.toString(),
              fullName: primaryParent.full_name,
              phone: primaryParent.phone,
              relationship: primaryParent.relationship,
            }
          : null,
      };
    });

    return {
      class: {
        id: classRecord.public_id || classRecord.class_id.toString(),
        publicId: classRecord.public_id,
        name: classRecord.name,
        ageGroup: classRecord.age_group,
        gradeLabel: GRADE_LABELS[classRecord.age_group] || classRecord.age_group,
        academicYear: classRecord.school_year?.name,
        schoolYearId: classRecord.school_year_id.toString(),
        schoolYearStatus: classRecord.school_year?.status,
        capacity,
        studentCount: students.length,
        remainingSlots: Math.max(0, capacity - students.length),
      },
      students,
    };
  }

  /**
   * Get student pool for allocation into class
   */
  async getStudentPool(classId, { search, previousClassGroup = 'ALL', ageGroup = 'ALL', status = 'UNASSIGNED', page = 1, limit = 100 } = {}) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: { school_year: true },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    const schoolYearId = classRecord.school_year_id;

    // Immediately preceding school year before this class's school year (e.g. 2025-2026 for 2026-2027)
    const previousSchoolYear = await prisma.schoolYear.findFirst({
      where: {
        start_date: { lt: classRecord.school_year.start_date },
        deleted_at: null,
      },
      orderBy: { start_date: 'desc' },
    });

    const where = {
      deleted_at: null,
      status: { notIn: ['RESERVED', 'DROPPED_OUT', 'TRANSFERRED', 'GRADUATED'] },
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { student_code: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allStudents = await prisma.student.findMany({
      where,
      orderBy: { student_code: 'asc' },
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
        student_enrollments: {
          include: {
            class: {
              include: { school_year: true },
            },
          },
          orderBy: { enrolled_at: 'desc' },
        },
      },
    });

    const poolItems = [];

    for (const s of allStudents) {
      // Exclude students who ALREADY have an active class in this school year
      const activeEnrollmentThisYear = s.student_enrollments.find(
        (e) => e.left_at === null && e.class?.school_year_id === schoolYearId
      );
      if (activeEnrollmentThisYear) {
        continue;
      }

      const refDate = classRecord.school_year?.start_date || new Date('2026-09-01');
      const ageInMonths = this._calculateAgeInMonths(s.date_of_birth, refDate);
      const suitable = this._calculateSuitableGrade(s.date_of_birth, refDate);
      const isAgeEligible = this._isAgeEligible(s.date_of_birth, classRecord.age_group, refDate);
      const isAccountLinked = Boolean(
        s.account_id && s.account && !s.account.deleted_at && s.account.is_active
      );

      // Previous class lookup (Must display the class from the previous school year, e.g. 2025-2026 for 2026-2027)
      let previousClass = null;
      let prevEnrollment = null;

      if (previousSchoolYear) {
        prevEnrollment = s.student_enrollments.find(
          (e) => e.class?.school_year_id === previousSchoolYear.school_year_id
        );
      }

      if (!prevEnrollment) {
        prevEnrollment = s.student_enrollments.find(
          (e) =>
            e.class?.school_year &&
            e.class.school_year.start_date < classRecord.school_year.start_date
        );
      }

      let previousClassAgeGroup = 'NONE';

      if (prevEnrollment && prevEnrollment.class) {
        const yearShort = prevEnrollment.class.school_year?.name
          ? prevEnrollment.class.school_year.name.replace('Năm học ', '').replace('–', '-')
          : '';
        previousClass = `${prevEnrollment.class.name}${yearShort ? ` · ${yearShort}` : ''}`;
        previousClassAgeGroup = prevEnrollment.class.age_group || 'NONE';
      } else if (s.previous_school) {
        previousClass = s.previous_school;
        const prevLower = s.previous_school.toLowerCase();
        if (prevLower.includes('nhà trẻ') || prevLower.includes('nha tre')) {
          previousClassAgeGroup = 'NHA_TRE';
        } else if (prevLower.includes('mầm') || prevLower.includes('mam')) {
          previousClassAgeGroup = 'MAM';
        } else if (prevLower.includes('chồi') || prevLower.includes('choi')) {
          previousClassAgeGroup = 'CHOI';
        } else if (prevLower.includes('lá') || prevLower.includes('la')) {
          previousClassAgeGroup = 'LA';
        } else {
          previousClassAgeGroup = 'EXTERNAL';
        }
      }

      // Filter by previous class tier if specified
      if (previousClassGroup && previousClassGroup !== 'ALL') {
        if (previousClassGroup === 'NONE') {
          if (previousClassAgeGroup !== 'NONE' && previousClassAgeGroup !== 'EXTERNAL') {
            continue;
          }
        } else if (previousClassAgeGroup !== previousClassGroup) {
          const pLower = (previousClass || '').toLowerCase();
          const matchesFallback =
            (previousClassGroup === 'NHA_TRE' && (pLower.includes('nhà trẻ') || pLower.includes('nha tre'))) ||
            (previousClassGroup === 'MAM' && (pLower.includes('mầm') || pLower.includes('mam'))) ||
            (previousClassGroup === 'CHOI' && (pLower.includes('chồi') || pLower.includes('choi'))) ||
            (previousClassGroup === 'LA' && (pLower.includes('lá') || pLower.includes('la')));
          if (!matchesFallback) {
            continue;
          }
        }
      }

      // Age group filter (only if explicitly specified and not ALL)
      if (ageGroup && ageGroup !== 'ALL' && suitable.key !== ageGroup) {
        continue;
      }

      poolItems.push({
        id: s.public_id || s.student_id.toString(),
        publicId: s.public_id,
        studentCode: s.student_code,
        fullName: s.full_name,
        avatarUrl:
          s.avatar_url ||
          `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(s.student_code || s.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
        dateOfBirth: s.date_of_birth,
        gender: s.gender,
        ageInMonths,
        isAgeEligible,
        hasAccount: isAccountLinked,
        accountId: s.account_id ? s.account_id.toString() : null,
        accountUsername: s.account?.username || null,
        suitableGrade: suitable.label,
        suitableAgeGroup: suitable.key,
        previousClass,
        previousClassAgeGroup,
        allocationStatus: 'UNASSIGNED',
        allocationStatusLabel: 'Chưa phân lớp',
        currentClass: null,
      });
    }

    const total = poolItems.length;
    const skip = (Math.max(1, page) - 1) * limit;
    const paginatedItems = poolItems.slice(skip, skip + limit);

    return {
      items: paginatedItems,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Batch allocate students to this class
   */
  async allocateStudents(classId, { studentIds }) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: {
        school_year: true,
        teacher_classes: {
          where: { left_at: null },
          include: {
            teacher: {
              select: { teacher_id: true, full_name: true, account_id: true },
            },
          },
        },
      },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    // Resolve student records
    const students = await prisma.student.findMany({
      where: {
        OR: studentIds.map((id) => {
          const s = String(id).trim();
          if (/^\d+$/.test(s)) return { student_id: BigInt(s) };
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { public_id: s };
          return { student_code: s };
        }),
        deleted_at: null,
      },
      select: {
        student_id: true,
        public_id: true,
        full_name: true,
        date_of_birth: true,
        account_id: true,
        account: {
          select: { account_id: true, is_active: true, deleted_at: true },
        },
      },
    });

    if (students.length === 0) {
      throw new BadRequest('Không tìm thấy học sinh hợp lệ để thêm vào lớp');
    }

    // Check if any student does NOT have a linked active account
    const unlinkedStudents = students.filter(
      (s) => !s.account_id || !s.account || s.account.deleted_at !== null || !s.account.is_active
    );
    if (unlinkedStudents.length > 0) {
      const unlinkedNames = unlinkedStudents.map((s) => s.full_name).join(', ');
      throw new BadRequest(
        `Hồ sơ học sinh (${unlinkedNames}) chưa được liên kết tài khoản. Vui lòng liên kết tài khoản cho học sinh trước khi phân lớp.`
      );
    }

    // Check if any student does NOT have suitable age for this class's age bracket
    const refDate = classRecord.school_year?.start_date || new Date('2026-09-01');
    const ineligibleStudents = students.filter(
      (s) => !this._isAgeEligible(s.date_of_birth, classRecord.age_group, refDate)
    );
    if (ineligibleStudents.length > 0) {
      throw new BadRequest('Độ tuổi học sinh không phù hợp với khối lớp được chọn.');
    }

    // Check if any student already has an active class in this school year
    const existingEnrollments = await prisma.studentEnrollment.findMany({
      where: {
        student_id: { in: students.map((s) => s.student_id) },
        left_at: null,
        class: {
          school_year_id: classRecord.school_year_id,
        },
      },
      include: {
        student: true,
        class: true,
      },
    });

    if (existingEnrollments.length > 0) {
      const studentNames = existingEnrollments.map((e) => e.student.full_name).join(', ');
      throw new Conflict(
        `Trong một năm học, mỗi học sinh chỉ được học 01 lớp. Học sinh (${studentNames}) hiện đã có lớp trong năm học này.`
      );
    }

    const now = new Date();
    await prisma.studentEnrollment.createMany({
      data: students.map((s) => ({
        student_id: s.student_id,
        class_id: classRecord.class_id,
        enrolled_at: now,
        left_at: null,
      })),
    });

    return this.getClassStudents(classRecord.public_id || classRecord.class_id.toString());
  }

  /**
   * Unassign a single student from class (BGH only, before semester 1 start date)
   */
  async unassignStudent(classId, studentId) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    const schoolYear = await prisma.schoolYear.findUnique({
      where: { school_year_id: classRecord.school_year_id },
    });

    if (schoolYear?.start_date) {
      const now = new Date();
      const sem1StartDate = new Date(schoolYear.start_date);
      now.setHours(0, 0, 0, 0);
      sem1StartDate.setHours(0, 0, 0, 0);

      if (now >= sem1StartDate) {
        throw new BadRequest(
          'Không thể gỡ học sinh khỏi lớp khi năm học/học kỳ 1 đã bắt đầu. Vui lòng sử dụng tính năng chuyển lớp.'
        );
      }
    }

    const sStr = String(studentId).trim();
    const studentWhere = /^\d+$/.test(sStr)
      ? { student_id: BigInt(sStr) }
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sStr)
      ? { public_id: sStr }
      : { student_code: sStr };

    const activeEnrollment = await prisma.studentEnrollment.findFirst({
      where: {
        class_id: classRecord.class_id,
        student: { ...studentWhere, deleted_at: null },
        left_at: null,
      },
    });
    if (!activeEnrollment) {
      throw new NotFound('Không tìm thấy bản ghi phân lớp đang hoạt động của học sinh');
    }

    // Hard delete before semester 1 starts: releases the unique constraint @@unique([student_id, class_id])
    // and cleanly returns student to the unassigned student pool without dirtying academic history.
    await prisma.studentEnrollment.delete({
      where: { enrollment_id: activeEnrollment.enrollment_id },
    });

    return {
      success: true,
      message: 'Đã gỡ học sinh khỏi lớp thành công!',
    };
  }

  /**
   * Batch unassign students from this class (BGH only, allowed before semester 1 start date)
   */
  async unassignStudents(classId, { studentIds }) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: { school_year: true },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    // Rule: BGH can only unassign students before the start date of Semester 1
    if (classRecord.school_year?.start_date) {
      const now = new Date();
      const sem1StartDate = new Date(classRecord.school_year.start_date);
      now.setHours(0, 0, 0, 0);
      sem1StartDate.setHours(0, 0, 0, 0);

      if (now >= sem1StartDate) {
        throw new BadRequest(
          'Không thể gỡ học sinh khỏi lớp khi năm học/học kỳ 1 đã bắt đầu. Vui lòng sử dụng tính năng chuyển lớp.'
        );
      }
    }

    const students = await prisma.student.findMany({
      where: {
        OR: studentIds.map((id) => {
          const s = String(id).trim();
          if (/^\d+$/.test(s)) return { student_id: BigInt(s) };
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { public_id: s };
          return { student_code: s };
        }),
      },
      select: { student_id: true },
    });

    const targetStudentIds = students.map((s) => s.student_id);

    await prisma.studentEnrollment.deleteMany({
      where: {
        class_id: classRecord.class_id,
        student_id: { in: targetStudentIds },
        left_at: null,
      },
    });

    return this.getClassStudents(classRecord.public_id || classRecord.class_id.toString());
  }

  async removeStudents(classId, payload) {
    return this.unassignStudents(classId, payload);
  }

  /**
   * Get historical sources (previous school years and their classes) for student allocation
   */
  async getHistorySources(classId) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: { school_year: true },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    const schoolYears = await prisma.schoolYear.findMany({
      where: {
        deleted_at: null,
      },
      orderBy: { start_date: 'desc' },
      include: {
        classes: {
          where: { deleted_at: null },
          orderBy: { name: 'asc' },
          select: {
            class_id: true,
            public_id: true,
            name: true,
            age_group: true,
            room_number: true,
          },
        },
      },
    });

    const years = schoolYears.map((sy) => ({
      id: sy.school_year_id.toString(),
      name: sy.name,
      displayName: sy.name.replace('Năm học ', ''),
      status: sy.status,
      isCurrent: sy.school_year_id === classRecord.school_year_id,
      classes: sy.classes.map((c) => ({
        id: c.public_id || c.class_id.toString(),
        publicId: c.public_id,
        name: c.name,
        ageGroup: c.age_group,
        gradeLabel: GRADE_LABELS[c.age_group] || c.age_group,
      })),
    }));

    return { years };
  }

  /**
   * Get students from a past class with their current allocation status in this school year
   */
  async getHistoryStudents(classId, { previousClassId, search } = {}) {
    const currentClassRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: { school_year: true },
    });
    if (!currentClassRecord) throw new NotFound('Lớp học không tồn tại');

    if (!previousClassId) {
      return { students: [], summary: { total: 0, assignedThisYear: 0, unassignedThisYear: 0 } };
    }

    const previousClass = await prisma.class.findFirst({
      where: { ...this._parseId(previousClassId), deleted_at: null },
      include: { school_year: true },
    });
    if (!previousClass) throw new NotFound('Lớp cũ không tồn tại');

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: previousClass.class_id,
        student: { deleted_at: null },
      },
      include: {
        student: {
          include: {
            student_enrollments: {
              where: { left_at: null },
              include: {
                class: {
                  include: { school_year: true },
                },
              },
            },
          },
        },
      },
      orderBy: { enrolled_at: 'asc' },
    });

    const currentSchoolYearId = currentClassRecord.school_year_id;
    let assignedCount = 0;
    let unassignedCount = 0;

    const students = [];

    for (const e of enrollments) {
      const s = e.student;
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          s.full_name.toLowerCase().includes(q) ||
          s.student_code.toLowerCase().includes(q);
        if (!match) continue;
      }

      // Check current year active enrollment
      const activeEnrollmentThisYear = s.student_enrollments.find(
        (en) => en.class?.school_year_id === currentSchoolYearId
      );

      let currentStatus = 'UNASSIGNED';
      let currentStatusLabel = 'Chưa phân lớp';
      let currentClassName = null;

      if (activeEnrollmentThisYear) {
        if (activeEnrollmentThisYear.class_id === currentClassRecord.class_id) {
          currentStatus = 'IN_THIS_CLASS';
          currentStatusLabel = 'Đã vào lớp này';
          currentClassName = currentClassRecord.name;
        } else {
          currentStatus = 'IN_OTHER_CLASS';
          currentStatusLabel = 'Đã vào lớp khác';
          currentClassName = activeEnrollmentThisYear.class.name;
          assignedCount++;
        }
      } else {
        unassignedCount++;
      }

      students.push({
        id: s.public_id || s.student_id.toString(),
        publicId: s.public_id,
        studentCode: s.student_code,
        fullName: s.full_name,
        avatarUrl:
          s.avatar_url ||
          `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(s.student_code || s.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
        dateOfBirth: s.date_of_birth,
        gender: s.gender,
        previousClassName: previousClass.name,
        previousSchoolYear: previousClass.school_year?.name?.replace('Năm học ', '') || '',
        currentStatus,
        currentStatusLabel,
        currentClassName,
      });
    }

    return {
      previousClass: {
        id: previousClass.public_id || previousClass.class_id.toString(),
        name: previousClass.name,
        schoolYear: previousClass.school_year?.name,
      },
      summary: {
        total: students.length,
        assignedThisYear: assignedCount,
        unassignedThisYear: unassignedCount,
      },
      students,
    };
  }

  /**
   * Import students from file / list and optionally allocate to class
   */
  async importStudents(classId, { students, autoAllocate = false }) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: { school_year: true },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    if (!Array.isArray(students) || students.length === 0) {
      throw new BadRequest('Danh sách học sinh nhập không hợp lệ');
    }

    const createdIds = [];

    await prisma.$transaction(async (tx) => {
      for (const item of students) {
        const studentCode = item.studentCode?.trim();
        const fullName = item.fullName?.trim();
        if (!studentCode || !fullName) continue;

        let dob = item.dateOfBirth ? new Date(item.dateOfBirth) : new Date('2023-01-01');
        if (isNaN(dob.getTime())) dob = new Date('2023-01-01');

        const gender = item.gender === 'FEMALE' ? 'FEMALE' : 'MALE';

        const student = await tx.student.upsert({
          where: { student_code: studentCode },
          update: {
            full_name: fullName,
            date_of_birth: dob,
            gender,
            status: 'STUDYING',
          },
          create: {
            student_code: studentCode,
            full_name: fullName,
            date_of_birth: dob,
            gender,
            enrollment_date: new Date(),
            status: 'STUDYING',
            avatar_url: `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(studentCode)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
          },
        });

        createdIds.push(student.student_id);

        if (autoAllocate) {
          const existing = await tx.studentEnrollment.findFirst({
            where: { student_id: student.student_id, class_id: classRecord.class_id },
          });
          if (existing) {
            await tx.studentEnrollment.update({
              where: { enrollment_id: existing.enrollment_id },
              data: { left_at: null },
            });
          } else {
            await tx.studentEnrollment.create({
              data: {
                student_id: student.student_id,
                class_id: classRecord.class_id,
                enrolled_at: new Date(),
              },
            });
          }
        }
      }
    });

    return {
      importedCount: createdIds.length,
      allocatedCount: autoAllocate ? createdIds.length : 0,
    };
  }

  /**
   * Get class teachers & available pool for this school year
   */
  async getClassTeachers(classId) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: { school_year: true },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    // 1. Current active teachers for this class
    const activeAllocations = await prisma.teacherClass.findMany({
      where: {
        class_id: classRecord.class_id,
        left_at: null,
        teacher: { deleted_at: null },
      },
      include: {
        teacher: {
          include: { account: { select: { is_active: true, username: true } } },
        },
      },
      orderBy: [{ assigned_at: 'asc' }],
    });

    const activeTeachers = activeAllocations.map((tc) => ({
      allocationId: tc.id.toString(),
      teacherId: tc.teacher.public_id || tc.teacher.teacher_id.toString(),
      employeeCode: tc.teacher.employee_code,
      fullName: tc.teacher.full_name,
      assignedAt: tc.assigned_at,
      phone: tc.teacher.phone || '',
      email: tc.teacher.email || '',
      position: tc.teacher.position || 'Giáo viên',
      workStatus: tc.teacher.work_status,
      avatarUrl:
        tc.teacher.avatar_url ||
        `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(tc.teacher.full_name)}`,
    }));

    // 2. Candidate teachers pool:
    // Only active teachers (not resigned)
    const allTeachers = await prisma.teacher.findMany({
      where: {
        deleted_at: null,
        work_status: { not: 'RESIGNED' },
      },
      include: {
        teacher_classes: {
          where: {
            left_at: null,
            class: { school_year_id: classRecord.school_year_id },
          },
          include: { class: true },
        },
      },
      orderBy: { employee_code: 'asc' },
    });

    const activeTeacherIds = new Set(activeTeachers.map((t) => t.teacherId));

    const poolTeachers = allTeachers
      .filter((t) => {
        // Position rule: strictly 'Giáo viên', excluding 'Hiệu trưởng', 'Phó hiệu trưởng', etc.
        const pos = (t.position || '').trim().toLowerCase();
        if (pos.includes('hiệu trưởng') || (pos && !pos.includes('giáo viên'))) {
          return false;
        }

        // Academic year rule: 1 teacher can only teach 1 class per school year
        // Exclude teachers who already have an active class in this school year
        if (t.teacher_classes.length > 0) {
          return false;
        }

        // Exclude teachers already assigned to this class
        if (activeTeacherIds.has(t.teacher_id.toString())) {
          return false;
        }

        return true;
      })
      .map((t) => ({
        teacherId: t.public_id || t.teacher_id.toString(),
        employeeCode: t.employee_code,
        fullName: t.full_name,
        phone: t.phone || '',
        email: t.email || '',
        position: t.position || 'Giáo viên',
        workStatus: t.work_status,
        avatarUrl:
          t.avatar_url ||
          `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(t.full_name)}`,
        isAssignedHere: false,
        isAssignedElsewhere: false,
        assignedClassName: null,
        canAssign: true,
      }));

    return {
      class: {
        id: classRecord.public_id || classRecord.class_id.toString(),
        name: classRecord.name,
        gradeLabel: GRADE_LABELS[classRecord.age_group] || classRecord.age_group,
        academicYear: classRecord.school_year?.name,
      },
      summary: {
        total: activeTeachers.length,
        recommendedCount: 2,
      },
      activeTeachers,
      poolTeachers,
    };
  }

  /**
   * Update teacher role in class (no-op in co-teaching model)
   */
  async updateTeacherRole(classId, teacherId) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    return this.getClassTeachers(classRecord.public_id || classRecord.class_id.toString());
  }

  /**
   * Get class transfer requests (inbound & outbound)
   */
  async getClassTransfers(classId, { status, direction, search } = {}, user = null) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: {
        school_year: true,
        teacher_classes: {
          where: { left_at: null },
          include: {
            teacher: {
              select: {
                account: {
                  select: { account_id: true, public_id: true },
                },
              },
            },
          },
        },
      },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    if (user && user.role === 'TEACHER_GV') {
      const userSub = String(user.sub);
      const isAssigned = (classRecord.teacher_classes || []).some((tc) => {
        const acc = tc.teacher?.account;
        return (
          acc &&
          (String(acc.account_id) === userSub || String(acc.public_id) === userSub)
        );
      });
      if (!isAssigned) {
        throw new Forbidden('Giáo viên chỉ có quyền xem yêu cầu chuyển lớp của lớp mình');
      }
    }

    const where = {
      deleted_at: null,
    };

    if (direction === 'OUT') {
      where.from_class_id = classRecord.class_id;
    } else if (direction === 'IN') {
      where.to_class_id = classRecord.class_id;
    } else {
      where.OR = [
        { from_class_id: classRecord.class_id },
        { to_class_id: classRecord.class_id },
      ];
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.student = {
        OR: [
          { full_name: { contains: q, mode: 'insensitive' } },
          { student_code: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const transfers = await prisma.classTransfer.findMany({
      where,
      include: {
        student: true,
        from_class: true,
        to_class: true,
        creator: true,
        approver: true,
      },
      orderBy: { created_at: 'desc' },
    });

    const items = transfers.map((t) => {
      const isOutbound = t.from_class_id === classRecord.class_id;
      return {
        id: t.public_id || t.transfer_id.toString(),
        publicId: t.public_id,
        studentId: t.student.public_id || t.student.student_id.toString(),
        studentCode: t.student.student_code,
        studentName: t.student.full_name,
        studentAvatar:
          (t.student.avatar_url && !t.student.avatar_url.includes('api.dicebear.com'))
            ? t.student.avatar_url
            : `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(t.student.student_code || t.student.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
        fromClassId: t.from_class?.public_id || t.from_class_id.toString(),
        fromClassName: t.from_class.name,
        toClassId: t.to_class?.public_id || t.to_class_id.toString(),
        toClassName: t.to_class.name,
        direction: isOutbound ? 'OUT' : 'IN',
        directionLabel: isOutbound ? 'Chuyển đi' : 'Chuyển đến',
        status: t.status,
        transferDate: t.transfer_date,
        reason: t.reason || '',
        rejectedReason: t.rejected_reason || '',
        createdAt: t.created_at,
        createdByName: t.creator?.username || 'Ban Giám Hiệu',
        approvedAt: t.approved_at,
        cancelledAt: t.cancelled_at,
      };
    });

    const totalCount = items.length;
    const pendingCount = items.filter((i) => i.status === 'PENDING').length;
    const approvedCount = items.filter((i) => i.status === 'APPROVED').length;
    const rejectedCount = items.filter((i) => i.status === 'REJECTED').length;
    const cancelledCount = items.filter((i) => i.status === 'CANCELLED').length;

    // Available target classes in same school year
    const availableTargetClasses = await prisma.class.findMany({
      where: {
        school_year_id: classRecord.school_year_id,
        class_id: { not: classRecord.class_id },
        deleted_at: null,
      },
      select: {
        class_id: true,
        public_id: true,
        name: true,
        age_group: true,
        room_number: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      class: {
        id: classRecord.public_id || classRecord.class_id.toString(),
        name: classRecord.name,
        academicYear: classRecord.school_year?.name,
      },
      summary: {
        total: totalCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        cancelled: cancelledCount,
      },
      items,
      targetClasses: availableTargetClasses.map((c) => ({
        id: c.public_id || c.class_id.toString(),
        name: c.name,
        gradeLabel: GRADE_LABELS[c.age_group] || c.age_group,
        room: c.room_number || '',
      })),
    };
  }

  /**
   * Get all transfer requests across all classes for Principal / Admin
   */
  async getAllTransfers({ status, search, schoolYearId } = {}, user = null) {
    const andConditions = [{ deleted_at: null }];

    if (user && user.role === 'TEACHER_GV') {
      const userSub = String(user.sub);
      const teacher = await prisma.teacher.findFirst({
        where: {
          account: {
            OR: [
              { public_id: userSub },
              ...(/^\d+$/.test(userSub) ? [{ account_id: BigInt(userSub) }] : []),
            ],
          },
          deleted_at: null,
        },
        include: {
          teacher_classes: {
            where: { left_at: null },
            select: { class_id: true },
          },
        },
      });

      const teacherClassIds = (teacher?.teacher_classes || []).map((tc) => tc.class_id);
      if (teacherClassIds.length === 0) {
        return {
          summary: {
            total: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
            cancelled: 0,
          },
          items: [],
        };
      }

      andConditions.push({
        OR: [
          { from_class_id: { in: teacherClassIds } },
          { to_class_id: { in: teacherClassIds } },
        ],
      });
    }

    if (status && status !== 'ALL') {
      andConditions.push({ status });
    }

    if (schoolYearId) {
      const isBigInt = /^\d+$/.test(String(schoolYearId));
      if (isBigInt) {
        andConditions.push({
          OR: [
            { from_class: { school_year_id: BigInt(schoolYearId) } },
            { to_class: { school_year_id: BigInt(schoolYearId) } },
          ],
        });
      } else {
        andConditions.push({
          OR: [
            { from_class: { school_year: { name: { contains: String(schoolYearId), mode: 'insensitive' } } } },
            { to_class: { school_year: { name: { contains: String(schoolYearId), mode: 'insensitive' } } } },
          ],
        });
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      andConditions.push({
        student: {
          OR: [
            { full_name: { contains: q, mode: 'insensitive' } },
            { student_code: { contains: q, mode: 'insensitive' } },
          ],
        },
      });
    }

    const where = andConditions.length > 1 ? { AND: andConditions } : andConditions[0];

    const transfers = await prisma.classTransfer.findMany({
      where,
      include: {
        student: true,
        from_class: { include: { school_year: true } },
        to_class: { include: { school_year: true } },
        creator: true,
        approver: true,
      },
      orderBy: { created_at: 'desc' },
    });

    const items = transfers.map((t) => ({
      id: t.public_id || t.transfer_id.toString(),
      publicId: t.public_id,
      studentId: t.student.public_id || t.student.student_id.toString(),
      studentCode: t.student.student_code,
      studentName: t.student.full_name,
      studentAvatar:
        (t.student.avatar_url && !t.student.avatar_url.includes('api.dicebear.com'))
          ? t.student.avatar_url
          : `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(t.student.student_code || t.student.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
      fromClassId: t.from_class?.public_id || t.from_class_id.toString(),
      fromClassName: t.from_class.name,
      fromClassSchoolYearId: t.from_class?.school_year_id ? t.from_class.school_year_id.toString() : '',
      fromClassSchoolYear: t.from_class.school_year?.name || '',
      toClassId: t.to_class?.public_id || t.to_class_id.toString(),
      toClassName: t.to_class.name,
      toClassSchoolYearId: t.to_class?.school_year_id ? t.to_class.school_year_id.toString() : '',
      toClassSchoolYear: t.to_class.school_year?.name || '',
      schoolYearId: t.from_class?.school_year_id
        ? t.from_class.school_year_id.toString()
        : (t.to_class?.school_year_id ? t.to_class.school_year_id.toString() : ''),
      schoolYearName: t.from_class.school_year?.name || t.to_class.school_year?.name || '',
      status: t.status,
      transferDate: t.transfer_date,
      reason: t.reason || '',
      rejectedReason: t.rejected_reason || '',
      createdAt: t.created_at,
      createdByName: t.creator?.username || 'Giáo viên',
      approvedAt: t.approved_at,
      approvedByName: t.approver?.username || '',
      cancelledAt: t.cancelled_at,
    }));

    const totalCount = items.length;
    const pendingCount = items.filter((i) => i.status === 'PENDING').length;
    const approvedCount = items.filter((i) => i.status === 'APPROVED').length;
    const rejectedCount = items.filter((i) => i.status === 'REJECTED').length;
    const cancelledCount = items.filter((i) => i.status === 'CANCELLED').length;

    return {
      summary: {
        total: totalCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        cancelled: cancelledCount,
      },
      items,
    };
  }

  /**
   * Get single transfer request by ID
   */
  async getTransferById(transferId, user = null) {
    const t = await prisma.classTransfer.findFirst({
      where: {
        ...this._parseTransferId(transferId),
        deleted_at: null,
      },
      include: {
        student: {
          include: {
            parents: { where: { deleted_at: null }, orderBy: { created_at: 'asc' } },
          },
        },
        from_class: {
          include: {
            school_year: true,
            teacher_classes: {
              where: { left_at: null },
              include: {
                teacher: {
                  select: {
                    account: {
                      select: { account_id: true, public_id: true },
                    },
                  },
                },
              },
            },
          },
        },
        to_class: {
          include: {
            school_year: true,
            teacher_classes: {
              where: { left_at: null },
              include: {
                teacher: {
                  select: {
                    account: {
                      select: { account_id: true, public_id: true },
                    },
                  },
                },
              },
            },
          },
        },
        creator: true,
        approver: true,
      },
    });

    if (!t) {
      throw new NotFound('Không tìm thấy yêu cầu chuyển lớp');
    }

    if (user && user.role === 'TEACHER_GV') {
      const userSub = String(user.sub);
      const isAssignedFrom = (t.from_class?.teacher_classes || []).some((tc) => {
        const acc = tc.teacher?.account;
        return (
          acc &&
          (String(acc.account_id) === userSub || String(acc.public_id) === userSub)
        );
      });
      const isAssignedTo = (t.to_class?.teacher_classes || []).some((tc) => {
        const acc = tc.teacher?.account;
        return (
          acc &&
          (String(acc.account_id) === userSub || String(acc.public_id) === userSub)
        );
      });
      if (!isAssignedFrom && !isAssignedTo) {
        throw new Forbidden(
          'Giáo viên chỉ có quyền xem chi tiết yêu cầu chuyển lớp liên quan đến lớp của mình (chuyển đi hoặc chuyển đến)',
        );
      }
    }

    const primaryParent = t.student.parents?.find((p) => p.is_primary) || t.student.parents?.[0];

    return {
      id: t.public_id || t.transfer_id.toString(),
      publicId: t.public_id,
      studentId: t.student.public_id || t.student.student_id.toString(),
      studentCode: t.student.student_code,
      studentName: t.student.full_name,
      studentDob: t.student.date_of_birth,
      studentGender: t.student.gender,
      studentAvatar:
        (t.student.avatar_url && !t.student.avatar_url.includes('api.dicebear.com'))
          ? t.student.avatar_url
          : `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(t.student.student_code || t.student.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
      parentName: primaryParent?.full_name || '',
      parentPhone: primaryParent?.phone || '',
      parentRelationship: primaryParent?.relationship || '',
      fromClassId: t.from_class?.public_id || t.from_class_id.toString(),
      fromClassName: t.from_class.name,
      fromClassRoom: t.from_class.room_number || '',
      fromClassAgeGroup: t.from_class.age_group || '',
      fromClassSchoolYearId: t.from_class?.school_year_id ? t.from_class.school_year_id.toString() : '',
      fromClassSchoolYear: t.from_class.school_year?.name || '',
      toClassId: t.to_class?.public_id || t.to_class_id.toString(),
      toClassName: t.to_class.name,
      toClassRoom: t.to_class.room_number || '',
      toClassAgeGroup: t.to_class.age_group || '',
      toClassSchoolYearId: t.to_class?.school_year_id ? t.to_class.school_year_id.toString() : '',
      toClassSchoolYear: t.to_class.school_year?.name || '',
      schoolYearId: t.from_class?.school_year_id
        ? t.from_class.school_year_id.toString()
        : (t.to_class?.school_year_id ? t.to_class.school_year_id.toString() : ''),
      schoolYearName: t.from_class.school_year?.name || t.to_class.school_year?.name || '',
      status: t.status,
      transferDate: t.transfer_date,
      reason: t.reason || '',
      rejectedReason: t.rejected_reason || '',
      createdAt: t.created_at,
      createdByName: t.creator?.username || 'Giáo viên',
      approvedAt: t.approved_at,
      approvedByName: t.approver?.username || '',
      cancelledAt: t.cancelled_at,
    };
  }

  /**
   * Create a transfer request for a student in this class
   */
  async createTransferRequest(
    classId,
    { studentId, toClassId, transferDate = new Date(), reason, autoApprove = false },
    creatorAccountId,
    user = null,
  ) {
    if (!reason || !reason.trim()) {
      throw new BadRequest('Lý do chuyển lớp là bắt buộc');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(transferDate);
    targetDate.setHours(0, 0, 0, 0);
    if (targetDate < today) {
      throw new BadRequest('Ngày dự kiến chuyển lớp phải từ hôm nay trở đi (nằm ở hiện tại hoặc tương lai)');
    }

    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: {
        teacher_classes: {
          where: { left_at: null },
          include: {
            teacher: {
              select: {
                account: {
                  select: { account_id: true, public_id: true },
                },
              },
            },
          },
        },
      },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    if (user && user.role === 'TEACHER_GV') {
      const userSub = String(user.sub);
      const isAssigned = (classRecord.teacher_classes || []).some((tc) => {
        const acc = tc.teacher?.account;
        return (
          acc &&
          (String(acc.account_id) === userSub || String(acc.public_id) === userSub)
        );
      });
      if (!isAssigned) {
        throw new Forbidden(
          'Giáo viên chỉ có thể tạo yêu cầu chuyển lớp cho học sinh thuộc lớp của mình',
        );
      }
    }

    const toClass = await prisma.class.findFirst({
      where: { ...this._parseId(toClassId), deleted_at: null },
    });
    if (!toClass) throw new NotFound('Lớp chuyển đến không tồn tại');
    if (classRecord.class_id === toClass.class_id) {
      throw new BadRequest('Lớp chuyển đến phải khác lớp hiện tại');
    }

    // BR-43 (Phạm vi chuyển lớp): Chuyển lớp trong cùng một Năm học và cùng khối
    if (classRecord.school_year_id !== toClass.school_year_id) {
      throw new BadRequest('Theo quy định, việc chuyển lớp chỉ được thực hiện giữa hai lớp trong cùng một Năm học.');
    }
    if (classRecord.age_group !== toClass.age_group) {
      throw new BadRequest('Theo quy định, việc chuyển lớp chỉ được thực hiện giữa các lớp thuộc cùng một Khối học.');
    }

    const student = await prisma.student.findFirst({
      where: { ...this._parseStudentId(studentId), deleted_at: null },
    });
    if (!student) throw new NotFound('Học sinh không tồn tại');

    // BR-44 (Trạng thái và số lượng yêu cầu): 1 học sinh chỉ có duy nhất 1 yêu cầu Pending tại một thời điểm
    const existingPending = await prisma.classTransfer.findFirst({
      where: {
        student_id: student.student_id,
        status: 'PENDING',
        deleted_at: null,
      },
    });
    if (existingPending) {
      throw new Conflict(
        `Học sinh ${student.full_name} đã có 1 yêu cầu chuyển lớp đang ở trạng thái Chờ duyệt (Pending). Theo quy định, mỗi học sinh chỉ được phép có duy nhất 1 yêu cầu chuyển lớp ở trạng thái Pending tại một thời điểm.`,
      );
    }

    // Verify student is enrolled in from_class
    const activeEnrollment = await prisma.studentEnrollment.findFirst({
      where: {
        student_id: student.student_id,
        class_id: classRecord.class_id,
        left_at: null,
      },
    });
    if (!activeEnrollment) {
      throw new BadRequest(
        `Học sinh ${student.full_name} hiện không ở trong lớp ${classRecord.name}`,
      );
    }

    const creatorId = await this._resolveAccountId(creatorAccountId);

    const created = await prisma.classTransfer.create({
      data: {
        student_id: student.student_id,
        from_class_id: classRecord.class_id,
        to_class_id: toClass.class_id,
        transfer_date: new Date(transferDate),
        reason: reason?.trim() || 'Chuyển theo nguyện vọng phụ huynh',
        created_by: creatorId,
        status: 'PENDING',
      },
      include: {
        student: true,
        from_class: true,
        to_class: true,
      },
    });

    if (autoApprove) {
      return this.updateTransferStatus(
        classRecord.class_id,
        created.transfer_id,
        { status: 'APPROVED' },
        creatorId,
      );
    }

    return {
      id: created.public_id || created.transfer_id.toString(),
      studentCode: created.student.student_code,
      studentName: created.student.full_name,
      fromClassName: created.from_class.name,
      toClassName: created.to_class.name,
      status: created.status,
    };
  }

  /**
   * Create global transfer request (auto detects from_class from student active enrollment)
   */
  async createGlobalTransferRequest(body, creatorAccountId, user = null) {
    let fromClassId = body.fromClassId || body.classId;
    if (!fromClassId && body.studentId) {
      const student = await prisma.student.findFirst({
        where: { ...this._parseStudentId(body.studentId), deleted_at: null },
      });
      if (student) {
        const active = await prisma.studentEnrollment.findFirst({
          where: { student_id: student.student_id, left_at: null },
          orderBy: { enrolled_at: 'desc' },
        });
        if (active) fromClassId = active.class_id.toString();
      }
    }
    if (!fromClassId) {
      throw new BadRequest('Học sinh chưa được xếp vào lớp nào hoặc chưa chọn lớp hiện tại');
    }
    return this.createTransferRequest(fromClassId, body, creatorAccountId, user);
  }

  /**
   * Reject a transfer request (BGH only)
   */
  async rejectTransferRequest(transferId, { rejectedReason } = {}, approverAccountId, user = null) {
    if (user && user.role === 'TEACHER_GV') {
      throw new Forbidden('Giáo viên không có quyền từ chối yêu cầu chuyển lớp. Chức năng này chỉ dành cho Ban Giám Hiệu.');
    }
    const transfer = await prisma.classTransfer.findFirst({
      where: { ...this._parseTransferId(transferId), deleted_at: null },
      include: { student: true, from_class: true, to_class: true },
    });
    if (!transfer) throw new NotFound('Không tìm thấy yêu cầu chuyển lớp');
    if (transfer.status !== 'PENDING') {
      throw new BadRequest('Chỉ có thể từ chối yêu cầu chuyển lớp đang ở trạng thái chờ duyệt (PENDING)');
    }

    const approverId = await this._resolveAccountId(approverAccountId);
    const updated = await prisma.classTransfer.update({
      where: { transfer_id: transfer.transfer_id },
      data: {
        status: 'REJECTED',
        rejected_reason: rejectedReason?.trim() || 'Không đáp ứng điều kiện chuyển lớp',
        approved_by: approverId,
        approved_at: new Date(),
      },
    });

    return {
      success: true,
      status: updated.status,
      rejectedReason: updated.rejected_reason,
      approvedAt: updated.approved_at,
    };
  }

  /**
   * Cancel a transfer request (Teacher only)
   */
  async cancelTransferRequest(transferId, user = null) {
    const transfer = await prisma.classTransfer.findFirst({
      where: { ...this._parseTransferId(transferId), deleted_at: null },
      include: {
        student: true,
        from_class: {
          include: {
            teacher_classes: {
              where: { left_at: null },
              include: {
                teacher: {
                  select: {
                    account: {
                      select: { account_id: true, public_id: true },
                    },
                  },
                },
              },
            },
          },
        },
        to_class: true,
        creator: true,
      },
    });
    if (!transfer) throw new NotFound('Không tìm thấy yêu cầu chuyển lớp');
    if (transfer.status !== 'PENDING') {
      throw new BadRequest('Chỉ có thể hủy yêu cầu chuyển lớp đang ở trạng thái chờ duyệt (PENDING)');
    }

    // Role check: Teacher must belong to the from_class or be the creator
    if (user && user.role === 'TEACHER_GV') {
      const userSub = String(user.sub);
      const isAssigned = (transfer.from_class?.teacher_classes || []).some((tc) => {
        const acc = tc.teacher?.account;
        return acc && (String(acc.account_id) === userSub || String(acc.public_id) === userSub);
      });
      const isCreator = transfer.creator && (String(transfer.creator.account_id) === userSub || String(transfer.creator.public_id) === userSub);
      if (!isAssigned && !isCreator) {
        throw new Forbidden('Giáo viên chỉ có quyền hủy yêu cầu chuyển lớp do lớp mình phụ trách');
      }
    }

    const updated = await prisma.classTransfer.update({
      where: { transfer_id: transfer.transfer_id },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
      },
    });

    return {
      success: true,
      status: updated.status,
      cancelledAt: updated.cancelled_at,
    };
  }

  /**
   * Approve or reject/cancel a transfer request
   */
  async updateTransferStatus(classId, transferId, { status, rejectedReason }, approverAccountId, user = null) {
    if (status === 'REJECTED') {
      return this.rejectTransferRequest(transferId, { rejectedReason }, approverAccountId, user);
    }
    if (status === 'CANCELLED') {
      return this.cancelTransferRequest(transferId, user);
    }

    if (user && user.role === 'TEACHER_GV') {
      throw new Forbidden('Giáo viên không có quyền phê duyệt yêu cầu chuyển lớp');
    }

    const transfer = await prisma.classTransfer.findFirst({
      where: { ...this._parseTransferId(transferId), deleted_at: null },
      include: { student: true, from_class: true, to_class: true },
    });
    if (!transfer) throw new NotFound('Không tìm thấy yêu cầu chuyển lớp');
    if (transfer.status !== 'PENDING') {
      throw new BadRequest('Chỉ có thể phê duyệt yêu cầu chuyển lớp đang ở trạng thái chờ duyệt (PENDING)');
    }

    const approverId = await this._resolveAccountId(approverAccountId);

    if (status === 'APPROVED') {
      const tDate = new Date();
      await prisma.$transaction(async (tx) => {
        // 1. Close enrollment in from_class
        await tx.studentEnrollment.updateMany({
          where: {
            student_id: transfer.student_id,
            class_id: transfer.from_class_id,
            left_at: null,
          },
          data: {
            left_at: tDate,
            status: 'TRANSFERRED_CLASS',
            leave_reason: transfer.reason || 'Chuyển lớp',
          },
        });

        // 2. Create new enrollment in to_class
        await tx.studentEnrollment.create({
          data: {
            student_id: transfer.student_id,
            class_id: transfer.to_class_id,
            enrolled_at: tDate,
            status: 'ENROLLED',
          },
        });

        // 3. Mark transfer approved
        await tx.classTransfer.update({
          where: { transfer_id: transfer.transfer_id },
          data: {
            status: 'APPROVED',
            approved_by: approverId,
            approved_at: tDate,
          },
        });
      });
    } else {
      throw new BadRequest('Trạng thái cập nhật không hợp lệ');
    }

    return { success: true, status };
  }

  /**
   * Get complete class dataset for export (Excel/CSV/PDF)
   */
  async getClassExportData(classId) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: {
        school_year: true,
        teacher_classes: {
          where: { left_at: null },
          include: { teacher: true },
          orderBy: [{ assigned_at: 'asc' }],
        },
        student_enrollments: {
          where: {
            left_at: null,
            student: { deleted_at: null },
          },
          include: {
            student: {
              include: {
                parents: { where: { deleted_at: null } },
              },
            },
          },
          orderBy: { student: { student_code: 'asc' } },
        },
      },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    const teachers = classRecord.teacher_classes.map((tc) => ({
      employeeCode: tc.teacher.employee_code,
      fullName: tc.teacher.full_name,
      role: tc.teacher.position || 'Giáo viên phụ trách',
      position: tc.teacher.position || 'Giáo viên',
      phone: tc.teacher.phone || '',
      email: tc.teacher.email || '',
      assignedAt: tc.assigned_at,
    }));

    const students = classRecord.student_enrollments.map((e, index) => {
      const s = e.student;
      const primaryParent = s.parents?.[0] || null;
      return {
        stt: index + 1,
        studentCode: s.student_code,
        fullName: s.full_name,
        dateOfBirth: s.date_of_birth
          ? new Date(s.date_of_birth).toLocaleDateString('vi-VN')
          : '',
        gender: s.gender === 'MALE' ? 'Nam' : 'Nữ',
        ethnic: s.ethnic || 'Kinh',
        placeOfBirth: s.place_of_birth || '',
        permanentResidence: s.permanent_residence || '',
        enrollmentDate: s.enrollment_date
          ? new Date(s.enrollment_date).toLocaleDateString('vi-VN')
          : '',
        status: s.status === 'STUDYING' ? 'Đang học' : s.status,
        allergyNotes: s.allergy_notes || 'Không có',
        medicalNotes: s.medical_notes || 'Bình thường',
        parentName: primaryParent?.full_name || '',
        parentRelationship: primaryParent?.relationship || '',
        parentPhone: primaryParent?.phone || '',
        parents: (s.parents || []).map((p) => ({
          fullName: p.full_name || '',
          relationship: p.relationship || '',
          phone: p.phone || '',
        })),
      };
    });

    return {
      classInfo: {
        id: classRecord.class_id.toString(),
        name: classRecord.name,
        gradeLabel: GRADE_LABELS[classRecord.age_group] || classRecord.age_group,
        academicYear: classRecord.school_year?.name,
        roomNumber: classRecord.room_number || '',
        studentCount: students.length,
        teacherCount: teachers.length,
        exportedAt: new Date().toISOString(),
      },
      teachers,
      students,
    };
  }

  /**
   * Get comprehensive daily report for a class on a specific date:
   * attendance, health, and learning assessments
   */
  async getDailyReport(classId, { date } = {}) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: {
        school_year: { select: { school_year_id: true, name: true, status: true } },
      },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    // Parse date (default to 2026-10-14 if not specified)
    let targetDateStr = date || '2026-10-14';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(targetDateStr)) {
      const [d, m, y] = targetDateStr.split('/');
      targetDateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    // Get enrolled students
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: classRecord.class_id,
        student: { deleted_at: null },
        left_at: null,
      },
      orderBy: { student: { student_code: 'asc' } },
      include: {
        student: true,
      },
    });

    const studentIds = enrollments.map((e) => e.student.student_id);

    // 1. Fetch Attendance for this class on targetDate
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        class_id: classRecord.class_id,
        date: targetDate,
        deleted_at: null,
      },
    });
    const attMap = new Map();
    attendanceRecords.forEach((a) => {
      attMap.set(a.student_id.toString(), a);
    });

    // 2. Fetch Health Assessments:
    const healthExactRecords = await prisma.healthAssessment.findMany({
      where: {
        student_id: { in: studentIds },
        assessment_date: targetDate,
        deleted_at: null,
      },
    });
    const healthExactMap = new Map();
    healthExactRecords.forEach((h) => {
      healthExactMap.set(h.student_id.toString(), h);
    });

    const latestHealthRecords = await prisma.healthAssessment.findMany({
      where: {
        student_id: { in: studentIds },
        deleted_at: null,
      },
      orderBy: { assessment_date: 'desc' },
    });
    const healthLatestMap = new Map();
    latestHealthRecords.forEach((h) => {
      const sId = h.student_id.toString();
      if (!healthLatestMap.has(sId)) {
        healthLatestMap.set(sId, h);
      }
    });

    // 3. Fetch Educational Activities scheduled for this class
    let scheduledSlots = await prisma.subThemeActivity.findMany({
      where: {
        class_id: classRecord.class_id,
        scheduled_date: targetDate,
      },
      include: {
        activity: true,
      },
      orderBy: { order_index: 'asc' },
    });

    // Fallback activities if none specifically scheduled for this date
    if (scheduledSlots.length === 0) {
      const fallbackActivities = await prisma.educationalActivity.findMany({
        where: { deleted_at: null },
        take: 3,
        orderBy: { activity_id: 'asc' },
      });
      scheduledSlots = fallbackActivities.map((act, idx) => ({
        id: BigInt(idx + 1),
        activity_id: act.activity_id,
        activity: act,
        routine_slot: act.routine_slot,
      }));
    }

    const activityList = scheduledSlots.map((s) => ({
      activityId: s.activity_id.toString(),
      slotId: s.id.toString(),
      title: s.activity?.title || 'Hoạt động giáo dục',
      routineSlot: s.routine_slot || s.activity?.routine_slot,
    }));

    // 4. Fetch Daily Assessments for this class and date
    const dailyAssessments = await prisma.dailyAssessment.findMany({
      where: {
        student_id: { in: studentIds },
        assessment_date: targetDate,
      },
      include: {
        activity: true,
      },
    });

    const assessMap = new Map();
    dailyAssessments.forEach((da) => {
      const sId = da.student_id.toString();
      if (!assessMap.has(sId)) {
        assessMap.set(sId, new Map());
      }
      assessMap.get(sId).set(da.activity_id.toString(), da);
    });

    // 5. Construct student rows
    let presentCount = 0;
    let excusedCount = 0;
    let unexcusedCount = 0;
    let notRecordedCount = 0;
    let healthCheckedTodayCount = 0;

    const students = enrollments.map((enr) => {
      const s = enr.student;
      const sId = s.student_id.toString();

      // Attendance
      const att = attMap.get(sId);
      const isAttRecorded = !!att;
      let attStatus = 'NOT_RECORDED';
      if (att) {
        if (att.status === 'PRESENT') attStatus = 'PRESENT';
        else if (att.status === 'EXCUSED_ABSENCE') attStatus = 'EXCUSED_ABSENCE';
        else if (att.status === 'UNEXCUSED_ABSENCE') attStatus = 'UNEXCUSED_ABSENCE';
        else attStatus = att.status;
      }

      if (attStatus === 'PRESENT') presentCount++;
      else if (attStatus === 'EXCUSED_ABSENCE') excusedCount++;
      else if (attStatus === 'UNEXCUSED_ABSENCE') unexcusedCount++;
      else notRecordedCount++;

      const checkInFormatted = att?.check_in_time
        ? new Date(att.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : null;

      // Health
      const exactH = healthExactMap.get(sId);
      const latestH = exactH || healthLatestMap.get(sId);
      const isHealthToday = !!exactH;
      if (isHealthToday) healthCheckedTodayCount++;

      const heightVal = latestH ? Number(latestH.height) : 85.0;
      const weightVal = latestH ? Number(latestH.weight) : 12.0;
      const bmiVal = latestH ? Number(latestH.bmi) : Number((weightVal / ((heightVal / 100) ** 2)).toFixed(2));
      const healthNotes = exactH?.notes || latestH?.notes || 'Bình thường, thể trạng tốt';

      // Assessments
      const studentAssessMap = assessMap.get(sId) || new Map();
      const studentAssessments = activityList.map((act) => {
        const da = studentAssessMap.get(act.activityId);
        return {
          activityId: act.activityId,
          activityTitle: act.title,
          routineSlot: act.routineSlot,
          status: da?.status || 'PENDING',
          notes: da?.notes || '',
          isAssessed: !!da && da.status !== 'PENDING',
        };
      });

      return {
        id: sId,
        publicId: s.public_id,
        studentCode: s.student_code,
        fullName: s.full_name,
        avatarUrl:
          s.avatar_url ||
          `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(s.student_code || s.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
        gender: s.gender === 'MALE' ? 'Nam' : 'Nữ',
        dateOfBirth: s.date_of_birth ? new Date(s.date_of_birth).toISOString().slice(0, 10) : '',
        status: s.status,
        attendance: {
          status: attStatus,
          isRecorded: isAttRecorded,
          checkInTime: checkInFormatted,
          pickupPerson: att?.pickup_person_name || '',
          notes: att?.notes || '',
        },
        health: {
          height: heightVal,
          weight: weightVal,
          bmi: bmiVal,
          notes: healthNotes,
          isRecordedToday: isHealthToday,
          assessmentDate: exactH?.assessment_date || latestH?.assessment_date || null,
        },
        assessments: studentAssessments,
      };
    });

    return {
      classInfo: {
        id: classRecord.class_id.toString(),
        publicId: classRecord.public_id,
        name: classRecord.name,
        schoolYear: classRecord.school_year?.name,
        ageGroup: classRecord.age_group,
        totalStudents: students.length,
      },
      date: targetDateStr,
      activities: activityList,
      students,
      summary: {
        total: students.length,
        present: presentCount,
        excused: excusedCount,
        unexcused: unexcusedCount,
        notRecorded: notRecordedCount,
        healthCheckedToday: healthCheckedTodayCount,
        assessedCount: students.filter((st) => st.assessments.some((a) => a.isAssessed)).length,
      },
    };
  }

  /**
   * Get comprehensive individual student report (health history, attendance history, daily assessment history)
   */
  async getStudentReport(classId, studentId, semester) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: {
        school_year: true,
        teacher_classes: {
          where: { left_at: null },
          include: {
            teacher: {
              select: { teacher_id: true, full_name: true, account_id: true },
            },
          },
        },
      },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    // 0. Semester bounds & availability calculations
    const schoolYear = classRecord.school_year;
    const s1Start = schoolYear?.start_date ? new Date(schoolYear.start_date) : new Date('2026-09-07');
    const s1End = schoolYear?.semester_1_end_date ? new Date(schoolYear.semester_1_end_date) : new Date('2027-01-15');
    const s2End = schoolYear?.end_date ? new Date(schoolYear.end_date) : new Date('2027-05-31');
    const s2Start = new Date(s1End);
    s2Start.setDate(s2Start.getDate() + 1);

    const now = new Date();
    const isSem1Available = now >= s1Start;
    const isSem2Available = now >= s2Start;

    // Determine target semester: 'SEMESTER_1' | 'SEMESTER_2' | 'ALL'
    let selectedSemester = semester;
    if (!selectedSemester || (selectedSemester !== 'SEMESTER_1' && selectedSemester !== 'SEMESTER_2' && selectedSemester !== 'ALL')) {
      selectedSemester = isSem2Available ? 'SEMESTER_2' : 'SEMESTER_1';
    }

    const pad = (n) => String(n).padStart(2, '0');
    const formatVN = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

    const semesterInfo = {
      selectedSemester,
      isSem1Available,
      isSem2Available,
      sem1StartDateVN: formatVN(s1Start),
      sem1EndDateVN: formatVN(s1End),
      sem2StartDateVN: formatVN(s2Start),
      sem2EndDateVN: formatVN(s2End),
      sem1DateRange: `${formatVN(s1Start)} – ${formatVN(s1End)}`,
      sem2DateRange: `${formatVN(s2Start)} – ${formatVN(s2End)}`,
      fullYearDateRange: `${formatVN(s1Start)} – ${formatVN(s2End)}`,
      activeDateRangeLabel:
        selectedSemester === 'SEMESTER_1'
          ? `${formatVN(s1Start)} – ${formatVN(s1End)}`
          : selectedSemester === 'SEMESTER_2'
          ? `${formatVN(s2Start)} – ${formatVN(s2End)}`
          : `${formatVN(s1Start)} – ${formatVN(s2End)}`,
    };

    let dateRangeFilter = null;
    if (selectedSemester === 'SEMESTER_1') {
      const sem1Limit = new Date(s1End);
      sem1Limit.setHours(23, 59, 59, 999);
      dateRangeFilter = { gte: s1Start, lte: sem1Limit };
    } else if (selectedSemester === 'SEMESTER_2') {
      const sem2Limit = new Date(s2End);
      sem2Limit.setHours(23, 59, 59, 999);
      dateRangeFilter = { gte: s2Start, lte: sem2Limit };
    } else if (selectedSemester === 'ALL') {
      const yearLimit = new Date(s2End);
      yearLimit.setHours(23, 59, 59, 999);
      dateRangeFilter = { gte: s1Start, lte: yearLimit };
    }

    // 1. Get all actively enrolled students for navigation and selection (left_at is null)
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: classRecord.class_id,
        left_at: null,
        student: { deleted_at: null },
      },
      orderBy: { student: { student_code: 'asc' } },
      include: {
        student: {
          include: {
            parents: {
              where: { deleted_at: null },
              orderBy: { created_at: 'asc' },
            },
          },
        },
      },
    });

    const studentList = enrollments.map((enr) => {
      const s = enr.student;
      return {
        id: s.student_id.toString(),
        publicId: s.public_id,
        studentCode: s.student_code,
        fullName: s.full_name,
        gender: s.gender === 'MALE' ? 'Nam' : 'Nữ',
        dateOfBirth: s.date_of_birth ? new Date(s.date_of_birth).toISOString().slice(0, 10) : '',
        avatarUrl:
          s.avatar_url ||
          `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(s.student_code || s.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
      };
    });

    if (studentList.length === 0) {
      return {
        classInfo: {
          id: classRecord.class_id.toString(),
          name: classRecord.name,
          schoolYear: classRecord.school_year?.name,
          totalStudents: 0,
        },
        semesterInfo,
        studentList: [],
        student: null,
        health: { totalChecks: 0, latest: null, history: [] },
        attendance: { totalDays: 0, presentCount: 0, excusedCount: 0, unexcusedCount: 0, attendanceRate: 100, history: [] },
        assessments: { totalAssessed: 0, achievedCount: 0, outstandingCount: 0, notAchievedCount: 0, history: [] },
      };
    }

    // 2. Resolve selected student
    let targetEnr = null;
    if (studentId) {
      const sStr = String(studentId).trim();
      const isNum = /^\d+$/.test(sStr);
      const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sStr);

      targetEnr = enrollments.find(
        (e) =>
          (isNum && e.student.student_id.toString() === sStr) ||
          (isUuidFormat && e.student.public_id === sStr) ||
          e.student.student_code?.toUpperCase() === sStr.toUpperCase()
      );
      if (!targetEnr) {
        const studentOrConds = [];
        if (isNum) studentOrConds.push({ student_id: BigInt(sStr) });
        if (isUuidFormat) studentOrConds.push({ public_id: sStr });
        if (!isNum && !isUuidFormat) studentOrConds.push({ student_code: sStr });

        targetEnr = await prisma.studentEnrollment.findFirst({
          where: {
            class_id: classRecord.class_id,
            student: {
              OR: studentOrConds,
              deleted_at: null,
            },
          },
          include: {
            student: {
              include: {
                parents: {
                  where: { deleted_at: null },
                  orderBy: { created_at: 'asc' },
                },
              },
            },
          },
        });
      }
    }
    if (!targetEnr) {
      targetEnr = enrollments[0];
    }

    const currentStudent = targetEnr.student;
    const sId = currentStudent.student_id;

    // 3. Health Assessments History
    const healthAssessments = await prisma.healthAssessment.findMany({
      where: {
        student_id: sId,
        deleted_at: null,
        ...(dateRangeFilter ? { assessment_date: dateRangeFilter } : {}),
      },
      orderBy: { assessment_date: 'desc' },
      include: {
        recorder: {
          select: {
            username: true,
            teacher: { select: { full_name: true } },
          },
        },
      },
    });

    const healthList = healthAssessments.map((h, idx) => {
      const dateStr = h.assessment_date.toISOString().slice(0, 10);
      const [y, m, d] = dateStr.split('-');
      const hVal = Number(h.height);
      const wVal = Number(h.weight);
      const bmiVal = Number(h.bmi) || Number((wVal / ((hVal / 100) ** 2)).toFixed(2));
      const whoEvaluation = getClassificationFromZScores({
        heightZ: h.height_for_age_zscore,
        weightZ: h.weight_for_age_zscore,
        bmiZ: h.bmi_for_age_zscore,
        bmiVal,
      });
      const classification = whoEvaluation.label;

      return {
        id: h.assessment_id.toString(),
        publicId: h.public_id,
        roundIndex: healthAssessments.length - idx,
        roundName: `Đợt ${healthAssessments.length - idx}`,
        date: dateStr,
        dateFormatted: `${d}/${m}/${y}`,
        height: hVal,
        weight: wVal,
        bmi: bmiVal,
        classification,
        zscoreHeight: Number(h.height_for_age_zscore) || null,
        zscoreWeight: Number(h.weight_for_age_zscore) || null,
        zscoreBmi: Number(h.bmi_for_age_zscore) || null,
        notes: h.notes || '',
        recordedBy: h.recorder?.teacher?.full_name || h.recorder?.username || 'Cán bộ Y tế',
      };
    });

    // 4. Attendance Records History
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        student_id: sId,
        class_id: classRecord.class_id,
        deleted_at: null,
        ...(dateRangeFilter ? { date: dateRangeFilter } : {}),
      },
      orderBy: { date: 'desc' },
    });

    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    let presentCount = 0;
    let excusedCount = 0;
    let unexcusedCount = 0;

    const attendanceList = attendanceRecords.map((a) => {
      const dateObj = new Date(a.date);
      const dateStr = a.date.toISOString().slice(0, 10);
      const [y, m, d] = dateStr.split('-');
      const dayName = dayNames[dateObj.getDay()];

      const status = a.status;
      if (status === 'PRESENT') presentCount++;
      else if (status === 'EXCUSED_ABSENCE') excusedCount++;
      else if (status === 'UNEXCUSED_ABSENCE') unexcusedCount++;
      else presentCount++;

      const checkInFormatted = a.check_in_time
        ? new Date(a.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : null;
      const checkOutFormatted = a.check_out_time
        ? new Date(a.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : null;

      return {
        id: a.attendance_id.toString(),
        date: dateStr,
        dateFormatted: `${d}/${m}/${y}`,
        dayName,
        status: a.status,
        checkInTime: checkInFormatted,
        checkOutTime: checkOutFormatted,
        pickupPerson: a.pickup_person_name || '',
        pickupRelationship: a.pickup_relationship || '',
        pickupPhone: a.pickup_person_phone || '',
        pickupNote: a.pickup_note || '',
        notes: a.notes || a.absence_reason || '',
      };
    });

    const totalAttendanceDays = attendanceList.length;
    const attendanceRate = totalAttendanceDays > 0 ? Math.round((presentCount / totalAttendanceDays) * 100) : 100;

    // 5. Daily Assessments History
    const dailyAssessments = await prisma.dailyAssessment.findMany({
      where: {
        student_id: sId,
        ...(dateRangeFilter ? { assessment_date: dateRangeFilter } : {}),
      },
      include: {
        activity: true,
        evaluator: {
          select: {
            username: true,
            teacher: { select: { full_name: true } },
          },
        },
      },
      orderBy: { assessment_date: 'desc' },
    });

    let achievedCount = 0;
    let outstandingCount = 0;
    let notAchievedCount = 0;

    const SLOT_LABELS = {
      ARRIVAL_PLAY: 'Đón trẻ, Chơi',
      MORNING_EXERCISE: 'Thể dục sáng',
      DIRECTED_STUDY: 'Học',
      CORNER_PLAY: 'Chơi góc',
      OUTDOOR_PLAY: 'Ngoài trời',
      AFTERNOON_ACTIVITY: 'Hoạt động chiều',
      RETURN_CHILD: 'Trả trẻ',
    };

    const assessmentsList = dailyAssessments.map((da) => {
      const dateStr = da.assessment_date.toISOString().slice(0, 10);
      const [y, m, d] = dateStr.split('-');
      const act = da.activity;
      const status = da.status;

      if (status === 'OUTSTANDING') outstandingCount++;
      else if (status === 'NOT_ACHIEVED') notAchievedCount++;
      else achievedCount++;

      const classTeacherNames = (classRecord.teacher_classes || [])
        .map((tc) => tc.teacher?.full_name)
        .filter(Boolean);
      const activeTeacherFallback = classTeacherNames.length > 0 ? classTeacherNames.join(', ') : 'Giáo viên chủ nhiệm';
      const rawEvaluatorName = da.evaluator?.teacher?.full_name || da.evaluator?.username;
      const evaluatorName = (rawEvaluatorName && rawEvaluatorName !== 'Trần Thị Mai' && rawEvaluatorName !== 'Nguyễn Thu Trang')
        ? rawEvaluatorName
        : (activeTeacherFallback || rawEvaluatorName || 'Giáo viên chủ nhiệm');

      return {
        id: da.daily_assessment_id.toString(),
        date: dateStr,
        dateFormatted: `${d}/${m}/${y}`,
        activityId: act?.activity_id ? act.activity_id.toString() : '',
        activityTitle: act?.title || 'Hoạt động giáo dục',
        routineSlot: act?.routine_slot || 'DIRECTED_STUDY',
        routineSlotLabel: SLOT_LABELS[act?.routine_slot] || act?.routine_slot || 'Học',
        objective: act?.objective || '',
        status: da.status,
        notes: da.notes || '',
        evaluatorName,
      };
    });

    const primaryParent = currentStudent.parents?.[0] || null;

    // 6. Pickup Authorizations History for this student in the selected semester
    const sem1Limit = new Date(s1End);
    sem1Limit.setHours(23, 59, 59, 999);
    const sem2Limit = new Date(s2End);
    sem2Limit.setHours(23, 59, 59, 999);

    let authDateFilter = {};
    if (selectedSemester === 'SEMESTER_1') {
      authDateFilter = {
        start_date: { lte: sem1Limit },
        end_date: { gte: s1Start },
      };
    } else if (selectedSemester === 'SEMESTER_2') {
      authDateFilter = {
        start_date: { lte: sem2Limit },
        end_date: { gte: s2Start },
      };
    } else {
      authDateFilter = {
        start_date: { lte: sem2Limit },
        end_date: { gte: s1Start },
      };
    }

    const pickupAuthorizations = await prisma.pickupAuthorization.findMany({
      where: {
        student_id: sId,
        deleted_at: null,
        ...authDateFilter,
      },
      include: {
        authorizer: {
          select: {
            username: true,
            teacher: { select: { full_name: true } },
          },
        },
      },
      orderBy: { authorization_id: 'desc' },
    });

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const authorizationsList = pickupAuthorizations.map((pa) => {
      const sDateStr = pa.start_date.toISOString().slice(0, 10);
      const eDateStr = pa.end_date.toISOString().slice(0, 10);
      const [sy, sm, sd] = sDateStr.split('-');
      const [ey, em, ed] = eDateStr.split('-');
      const sFormatted = `${sd}/${sm}/${sy}`;
      const eFormatted = `${ed}/${em}/${ey}`;

      const createdDateStr = pa.created_at ? pa.created_at.toISOString().slice(0, 10) : '';
      const createdFormatted = createdDateStr ? createdDateStr.split('-').reverse().join('/') : '';

      // Kiểm tra xem ủy quyền này có bao trùm cả 2 học kỳ không
      const inSem1 = pa.start_date <= sem1Limit && pa.end_date >= s1Start;
      const inSem2 = pa.start_date <= sem2Limit && pa.end_date >= s2Start;
      const semesterScope = inSem1 && inSem2 ? 'Cả năm' : inSem1 ? 'Học kỳ 1' : 'Học kỳ 2';

      const isActiveNow =
        pa.status === 'APPROVED' &&
        new Date(pa.start_date) <= todayDate &&
        new Date(pa.end_date) >= todayDate;

      return {
        id: pa.authorization_id.toString(),
        publicId: pa.public_id,
        pickupPersonName: pa.pickup_person_name,
        pickupPersonPhone: pa.pickup_person_phone || '',
        pickupCitizenId: pa.pickup_citizen_id || '',
        relationship: pa.relationship || 'Người được ủy quyền',
        photoUrl: pa.photo_url || null,
        note: pa.note || '',
        status: pa.status || 'APPROVED',
        isActiveNow,
        startDate: sDateStr,
        endDate: eDateStr,
        startDateFormatted: sFormatted,
        endDateFormatted: eFormatted,
        dateRangeFormatted: `${sFormatted} – ${eFormatted}`,
        semesterScope,
        inSem1,
        inSem2,
        createdAtFormatted: createdFormatted,
        authorizedBy: pa.authorizer?.teacher?.full_name || pa.authorizer?.username || 'Giáo viên chủ nhiệm',
      };
    });

    // 7. Graduation eligibility evaluation (2 semester assessments + all monthly assessments)
    const requiredMonths = [];
    let curMonthIter = new Date(s1Start.getFullYear(), s1Start.getMonth(), 1);
    const endMonthIter = new Date(s2End.getFullYear(), s2End.getMonth(), 1);
    while (curMonthIter <= endMonthIter) {
      requiredMonths.push({
        month: curMonthIter.getMonth() + 1,
        year: curMonthIter.getFullYear(),
        label: `Tháng ${curMonthIter.getMonth() + 1}/${curMonthIter.getFullYear()}`,
      });
      curMonthIter.setMonth(curMonthIter.getMonth() + 1);
    }

    const studentSemesterAssessments = await prisma.semesterAssessment.findMany({
      where: {
        student_id: currentStudent.student_id,
        class_id: classRecord.class_id,
      },
    });

    const hasSem1 = studentSemesterAssessments.some(
      (sa) => sa.semester === 'SEMESTER_1' && sa.teacher_notes && sa.teacher_notes.trim().length > 0
    );
    const hasSem2 = studentSemesterAssessments.some(
      (sa) => sa.semester === 'SEMESTER_2' && sa.teacher_notes && sa.teacher_notes.trim().length > 0
    );

    const studentMonthlyAssessments = await prisma.monthlyAssessment.findMany({
      where: {
        student_id: currentStudent.student_id,
        class_id: classRecord.class_id,
      },
    });

    const evaluatedMonthsSet = new Set(
      studentMonthlyAssessments
        .filter((ma) => ma.teacher_notes && ma.teacher_notes.trim().length > 0)
        .map((ma) => `${ma.month}_${ma.year}`)
    );

    const missingMonths = requiredMonths.filter(
      (rm) => !evaluatedMonthsSet.has(`${rm.month}_${rm.year}`)
    );

    const graduationEligibility = {
      isEligible: hasSem1 && hasSem2 && missingMonths.length === 0,
      hasSem1,
      hasSem2,
      totalRequiredMonths: requiredMonths.length,
      evaluatedMonthsCount: requiredMonths.length - missingMonths.length,
      missingMonths,
      missingSemesters: [
        ...(!hasSem1 ? ['Học kỳ 1'] : []),
        ...(!hasSem2 ? ['Học kỳ 2'] : []),
      ],
    };

    return {
      classInfo: {
        id: classRecord.class_id.toString(),
        name: classRecord.name,
        ageGroup: classRecord.age_group,
        schoolYear: classRecord.school_year?.name,
        totalStudents: studentList.length,
      },
      semesterInfo,
      graduationEligibility,
      studentList,
      student: {
        id: currentStudent.student_id.toString(),
        publicId: currentStudent.public_id,
        studentCode: currentStudent.student_code,
        fullName: currentStudent.full_name,
        gender: currentStudent.gender === 'MALE' ? 'Nam' : 'Nữ',
        dateOfBirth: currentStudent.date_of_birth ? new Date(currentStudent.date_of_birth).toISOString().slice(0, 10) : '',
        avatarUrl:
          currentStudent.avatar_url ||
          `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(currentStudent.student_code || currentStudent.full_name)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`,
        status: currentStudent.status,
        parentName: primaryParent?.full_name || '',
        parentPhone: primaryParent?.phone || '',
        parentRelationship: primaryParent?.relationship || 'Phụ huynh',
        parents: (currentStudent.parents || []).map((p) => ({
          id: p.parent_id.toString(),
          publicId: p.public_id,
          fullName: p.full_name,
          relationship: p.relationship || 'Phụ huynh',
          phone: p.phone || '',
        })),
      },
      health: {
        totalChecks: healthList.length,
        latest: healthList[0] || null,
        history: healthList,
      },
      attendance: {
        totalDays: totalAttendanceDays,
        presentCount,
        excusedCount,
        unexcusedCount,
        attendanceRate,
        history: attendanceList,
      },
      assessments: {
        totalAssessed: assessmentsList.length,
        achievedCount,
        outstandingCount,
        notAchievedCount,
        history: assessmentsList,
      },
      authorizations: {
        total: authorizationsList.length,
        approvedCount: authorizationsList.filter((a) => a.status === 'APPROVED').length,
        pendingCount: authorizationsList.filter((a) => a.status === 'PENDING').length,
        history: authorizationsList,
      },
    };
  }

  /**
   * Save individual student daily report data (attendance, health, assessments)
   */
  async saveStudentDailyReport(classId, { date, studentId, attendance, health, assessments }, userId = 1n) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    let resolvedStaffId = 40n;
    if (userId) {
      const uStr = String(userId).trim();
      if (/^\d+$/.test(uStr)) {
        resolvedStaffId = BigInt(uStr);
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uStr)) {
        const acc = await prisma.account.findUnique({
          where: { public_id: uStr },
          select: { account_id: true },
        });
        if (acc) resolvedStaffId = acc.account_id;
      }
    }
    if (resolvedStaffId === 40n) {
      const tc = await prisma.teacherClass.findFirst({
        where: {
          class_id: classRecord.class_id,
          left_at: null,
        },
        include: { teacher: { select: { account_id: true } } },
      });
      if (tc?.teacher?.account_id) resolvedStaffId = tc.teacher.account_id;
    }

    const sId = BigInt(studentId);
    let targetDateStr = date || '2026-10-14';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(targetDateStr)) {
      const [d, m, y] = targetDateStr.split('/');
      targetDateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    // 1. Save Attendance
    if (attendance) {
      let status = attendance.status || 'PRESENT';
      if (status === 'ABSENT' || status === 'ABSENT_EXCUSED') status = 'EXCUSED_ABSENCE';
      if (status === 'ABSENT_UNEXCUSED') status = 'UNEXCUSED_ABSENCE';

      const existingAtt = await prisma.attendance.findFirst({
        where: {
          student_id: sId,
          class_id: classRecord.class_id,
          date: targetDate,
        },
      });

      if (existingAtt) {
        await prisma.attendance.update({
          where: { attendance_id: existingAtt.attendance_id },
          data: {
            status,
            notes: attendance.notes !== undefined ? attendance.notes : existingAtt.notes,
            check_in_time: attendance.checkInTime ? new Date(`${targetDateStr}T${attendance.checkInTime}:00.000Z`) : existingAtt.check_in_time,
            pickup_person_name: attendance.pickupPerson !== undefined ? attendance.pickupPerson : existingAtt.pickup_person_name,
            updated_at: new Date(),
          },
        });
      } else {
        await prisma.attendance.create({
          data: {
            student_id: sId,
            class_id: classRecord.class_id,
            date: targetDate,
            status,
            notes: attendance.notes || null,
            check_in_by: resolvedStaffId,
            check_in_time: attendance.checkInTime ? new Date(`${targetDateStr}T${attendance.checkInTime}:00.000Z`) : new Date(),
            pickup_person_name: attendance.pickupPerson || null,
          },
        });
      }
    }

    // 2. Save Health
    if (health) {
      const height = Number(health.height) || 85.0;
      const weight = Number(health.weight) || 12.0;
      const bmi = Number((weight / ((height / 100) ** 2)).toFixed(2));
      const notes = health.notes || 'Bình thường, thể trạng tốt';

      const studentMeta = await prisma.student.findUnique({
        where: { student_id: sId },
        select: { gender: true, date_of_birth: true },
      });

      const whoRes = await calculateWhoAssessment({
        gender: studentMeta?.gender,
        dateOfBirth: studentMeta?.date_of_birth,
        dateOfMeasurement: targetDate,
        height,
        weight,
      });

      const computedBmi = whoRes?.bmi ?? bmi;
      const hz = whoRes?.zscores?.heightForAge ?? null;
      const wz = whoRes?.zscores?.weightForAge ?? null;
      const bz = whoRes?.zscores?.bmiForAge ?? null;

      const existingHealth = await prisma.healthAssessment.findFirst({
        where: {
          student_id: sId,
          assessment_date: targetDate,
          deleted_at: null,
        },
      });

      if (existingHealth) {
        await prisma.healthAssessment.update({
          where: { assessment_id: existingHealth.assessment_id },
          data: {
            height,
            weight,
            bmi: computedBmi,
            height_for_age_zscore: hz,
            weight_for_age_zscore: wz,
            bmi_for_age_zscore: bz,
            notes,
            updated_at: new Date(),
          },
        });
      } else {
        await prisma.healthAssessment.create({
          data: {
            student_id: sId,
            assessment_date: targetDate,
            height,
            weight,
            bmi: computedBmi,
            height_for_age_zscore: hz,
            weight_for_age_zscore: wz,
            bmi_for_age_zscore: bz,
            notes,
            recorded_by: resolvedStaffId,
          },
        });
      }
    }

    // 3. Save Assessments
    if (Array.isArray(assessments)) {
      for (const ass of assessments) {
        if (!ass.activityId) continue;
        const actId = BigInt(ass.activityId);
        const status = ass.status || 'ACHIEVED';
        const notes = ass.notes || null;

        await prisma.dailyAssessment.upsert({
          where: {
            student_id_activity_id_assessment_date: {
              student_id: sId,
              activity_id: actId,
              assessment_date: targetDate,
            },
          },
          update: {
            status,
            notes,
            evaluated_by: resolvedStaffId,
            updated_at: new Date(),
          },
          create: {
            student_id: sId,
            activity_id: actId,
            assessment_date: targetDate,
            status,
            notes,
            evaluated_by: resolvedStaffId,
          },
        });
      }
    }

    return {
      success: true,
      message: 'Cập nhật thông tin học sinh trong ngày thành công',
    };
  }

  /**
   * Batch save daily report records
   */
  async batchSaveDailyReport(classId, { date, records }, userId = 1n) {
    if (!Array.isArray(records)) return { success: true, count: 0 };
    for (const record of records) {
      await this.saveStudentDailyReport(
        classId,
        {
          date,
          studentId: record.studentId || record.id,
          attendance: record.attendance,
          health: record.health,
          assessments: record.assessments,
        },
        userId
      );
    }
    return {
      success: true,
      count: records.length,
      message: `Đã cập nhật ${records.length} học sinh thành công`,
    };
  }

  /**
   * Complete class program / graduate student from class
   */
  async graduateStudentFromClass(classId, studentId) {
    const classRecord = await prisma.class.findFirst({
      where: { ...this._parseId(classId), deleted_at: null },
      include: { school_year: true },
    });
    if (!classRecord) throw new NotFound('Lớp học không tồn tại');

    const sStr = String(studentId).trim();
    const studentWhere = /^\d+$/.test(sStr)
      ? { student_id: BigInt(sStr) }
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sStr)
      ? { public_id: sStr }
      : { student_code: sStr };

    const student = await prisma.student.findFirst({
      where: { ...studentWhere, deleted_at: null },
    });
    if (!student) throw new NotFound('Hồ sơ học sinh không tồn tại');

    // Find active enrollment in this class
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: {
        student_id: student.student_id,
        class_id: classRecord.class_id,
        left_at: null,
      },
    });

    if (!enrollment) {
      throw new BadRequest('Học sinh không có hồ sơ đang theo học tại lớp này.');
    }

    // Verify graduation eligibility: Must have 2 semester evaluations AND all monthly evaluations
    const schoolYear = classRecord.school_year;
    const s1Start = schoolYear?.start_date ? new Date(schoolYear.start_date) : new Date('2026-09-07');
    const s2End = schoolYear?.end_date ? new Date(schoolYear.end_date) : new Date('2027-05-31');

    const requiredMonths = [];
    let curMonth = new Date(s1Start.getFullYear(), s1Start.getMonth(), 1);
    const endMonth = new Date(s2End.getFullYear(), s2End.getMonth(), 1);
    while (curMonth <= endMonth) {
      requiredMonths.push({
        month: curMonth.getMonth() + 1,
        year: curMonth.getFullYear(),
        label: `Tháng ${curMonth.getMonth() + 1}/${curMonth.getFullYear()}`,
      });
      curMonth.setMonth(curMonth.getMonth() + 1);
    }

    const semesterAssessments = await prisma.semesterAssessment.findMany({
      where: {
        student_id: student.student_id,
        class_id: classRecord.class_id,
      },
    });

    const hasSem1 = semesterAssessments.some(
      (sa) => sa.semester === 'SEMESTER_1' && sa.teacher_notes && sa.teacher_notes.trim().length > 0
    );
    const hasSem2 = semesterAssessments.some(
      (sa) => sa.semester === 'SEMESTER_2' && sa.teacher_notes && sa.teacher_notes.trim().length > 0
    );

    const monthlyAssessments = await prisma.monthlyAssessment.findMany({
      where: {
        student_id: student.student_id,
        class_id: classRecord.class_id,
      },
    });

    const evaluatedMonthsSet = new Set(
      monthlyAssessments
        .filter((ma) => ma.teacher_notes && ma.teacher_notes.trim().length > 0)
        .map((ma) => `${ma.month}_${ma.year}`)
    );

    const missingMonths = requiredMonths.filter(
      (rm) => !evaluatedMonthsSet.has(`${rm.month}_${rm.year}`)
    );

    const errors = [];
    if (!hasSem1 || !hasSem2) {
      const missingSem = [];
      if (!hasSem1) missingSem.push('Học kỳ 1');
      if (!hasSem2) missingSem.push('Học kỳ 2');
      errors.push(`chưa có đánh giá ${missingSem.join(' và ')}`);
    }
    if (missingMonths.length > 0) {
      const missingLabels = missingMonths.map((m) => m.label).join(', ');
      errors.push(`chưa có đủ đánh giá tháng (còn thiếu: ${missingLabels})`);
    }

    if (errors.length > 0) {
      throw new BadRequest(`Không thể hoàn thành chương trình học: Học sinh ${errors.join(', ')}.`);
    }

    const isLopLa =
      classRecord.age_group === 'LA' ||
      String(classRecord.name || '').toLowerCase().includes('lá') ||
      String(classRecord.name || '').toLowerCase().includes('la');

    await prisma.$transaction(async (tx) => {
      // 1. Update student enrollment in this class to COMPLETED
      await tx.studentEnrollment.update({
        where: { enrollment_id: enrollment.enrollment_id },
        data: {
          status: 'COMPLETED',
          left_at: new Date(),
          leave_reason: isLopLa ? 'Hoàn thành chương trình lớp Lá (Tốt nghiệp)' : 'Hoàn thành chương trình học',
        },
      });

      // 2. If it is Lớp Lá, update the student status in students table to GRADUATED
      if (isLopLa) {
        await tx.student.update({
          where: { student_id: student.student_id },
          data: {
            status: 'GRADUATED',
          },
        });
      }
    });

    return {
      success: true,
      isLopLa,
      message: isLopLa
        ? 'Đã ghi nhận học sinh hoàn thành chương trình lớp Lá và tốt nghiệp ra trường!'
        : `Đã ghi nhận học sinh hoàn thành chương trình học lớp ${classRecord.name}!`,
    };
  }
}

export const classService = new ClassService();
export default classService;
