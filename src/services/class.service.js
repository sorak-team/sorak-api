import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { teacherService } from './teacher.service.js';

const GRADE_LABELS = { NHA_TRE: 'Khối Nhà trẻ', MAM: 'Khối Mầm', CHOI: 'Khối Chồi', LA: 'Khối Lá' };
const GRADE_COLORS = { NHA_TRE: 'amber', MAM: 'blue', CHOI: 'coral', LA: 'emerald' };
const GRADE_PLANET_KEYS = { NHA_TRE: 'nhatre', MAM: 'mam', CHOI: 'choi', LA: 'la' };
const getClassPlanetUrl = (ageGroup, theme = 'light') => {
  const key = GRADE_PLANET_KEYS[ageGroup] || 'nhatre';
  const t = theme === 'dark' ? 'dark' : 'light';
  return `/planets/${key}-${t}.svg`;
};

export class ClassService {
  _parseId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
  }
  _parseTeacherId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
  }
  _parseTransferId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
  }
  _parseStudentId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^[A-Za-z0-9_-]+$/.test(str) && !/^\d+$/.test(str)) return { student_code: str };
    return { student_id: BigInt(str) };
  }

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
        isPrimary: tc.is_primary,
        avatar: tc.teacher.avatar_url || null,
        phone: tc.teacher.phone || null,
      }));

      const primaryTeacher = activeTeachers.find((t) => t.isPrimary) || activeTeachers[0];
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
        teacher: primaryTeacher?.fullName || 'Chưa phân công',
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

  async getClassById(id) {
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
                  select: { is_active: true },
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
      throw new NotFound('Lớp học không tồn tại trên hệ thống');
    }

    const activeAllocations = c.teacher_classes.filter((tc) => tc.left_at === null);
    const primaryTeacher =
      activeAllocations.find((tc) => tc.is_primary)?.teacher || activeAllocations[0]?.teacher;

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
      teacher: primaryTeacher?.full_name || 'Chưa phân công',
      activeTeachers: activeAllocations.map((tc) => ({
        allocationId: tc.id.toString(),
        teacherId: tc.teacher.public_id || tc.teacher.teacher_id.toString(),
        employeeCode: tc.teacher.employee_code,
        fullName: tc.teacher.full_name,
        position: tc.teacher.position,
        isPrimary: tc.is_primary,
        email: tc.teacher.email || '',
        phone: tc.teacher.phone || '',
        avatar: tc.teacher.avatar_url || null,
      })),
      assignmentHistory: c.teacher_classes.map((tc) => ({
        allocationId: tc.id.toString(),
        teacherId: tc.teacher.public_id || tc.teacher.teacher_id.toString(),
        fullName: tc.teacher.full_name,
        employeeCode: tc.teacher.employee_code,
        isPrimary: tc.is_primary,
        assignedAt: tc.assigned_at,
        leftAt: tc.left_at,
        isActive: tc.left_at === null,
      })),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    };
  }

  async createClass(data) {
    let schoolYearId = data.schoolYearId;
    if (!schoolYearId) {
      const activeYear = await prisma.schoolYear.findFirst({
        where: { status: 'ACTIVE', deleted_at: null },
      });
      if (!activeYear) {
        throw new BadRequest('Chưa có năm học nào đang kích hoạt. Vui lòng chọn năm học.');
      }
      schoolYearId = activeYear.school_year_id;
    } else {
      schoolYearId = BigInt(schoolYearId);
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

  async updateClass(id, data) {
    const where = { ...this._parseId(id), deleted_at: null };
    const classRecord = await prisma.class.findFirst({ where });
    if (!classRecord) {
      throw new NotFound('Lớp học không tồn tại');
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
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.ageGroup !== undefined) updateData.age_group = data.ageGroup;
    if (data.roomNumber !== undefined) updateData.room_number = data.roomNumber?.trim() || null;
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;

    const updated = await prisma.class.update({
      where: { class_id: classRecord.class_id },
      data: updateData,
    });

    return this.getClassById(updated.public_id || updated.class_id.toString());
  }

  async deleteClass(id) {
    const where = { ...this._parseId(id), deleted_at: null };
    const classRecord = await prisma.class.findFirst({ where });
    if (!classRecord) {
      throw new NotFound('Lớp học không tồn tại');
    }

    await prisma.$transaction(async (tx) => {
      // 1. Soft delete class
      await tx.class.update({
        where: { class_id: classRecord.class_id },
        data: { deleted_at: new Date() },
      });

      // 2. Close active teacher assignments
      await tx.teacherClass.updateMany({
        where: { class_id: classRecord.class_id, left_at: null },
        data: { left_at: new Date() },
      });
    });

    return { success: true, message: 'Đã xóa lớp học thành công' };
  }

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
          isPrimary: false,
          assignedAt: body.assignedAt,
        });
        results.push(res);
      }
      return results;
    }

    const targetTeacherId = body.teacherId || body.id;
    return teacherService.assignTeacherToClass(targetTeacherId, {
      classId: classRecord.class_id,
      isPrimary: Boolean(body.isPrimary),
      assignedAt: body.assignedAt,
    });
  }

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
      orderBy: [{ is_primary: 'desc' }, { assigned_at: 'asc' }],
    });

    const activeTeachers = activeAllocations.map((tc) => ({
      allocationId: tc.id.toString(),
      teacherId: tc.teacher.public_id || tc.teacher.teacher_id.toString(),
      employeeCode: tc.teacher.employee_code,
      fullName: tc.teacher.full_name,
      isPrimary: tc.is_primary,
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

    const primaryTeacher = activeTeachers.find((t) => t.isPrimary) || null;
    const assistantTeachers = activeTeachers.filter((t) => !t.isPrimary);

    return {
      class: {
        id: classRecord.public_id || classRecord.class_id.toString(),
        name: classRecord.name,
        gradeLabel: GRADE_LABELS[classRecord.age_group] || classRecord.age_group,
        academicYear: classRecord.school_year?.name,
      },
      summary: {
        total: activeTeachers.length,
        hasPrimary: !!primaryTeacher,
        primaryTeacherName: primaryTeacher?.fullName || 'Chưa phân công',
        assistantCount: assistantTeachers.length,
        recommendedCount: 2,
      },
      activeTeachers,
      poolTeachers,
    };
  }
}
export const classService = new ClassService();
export default classService;
