import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { teacherService } from './teacher.service.js';

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

  _parseStudentId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (isUuid) return { public_id: str };
      if (/^[A-Za-z0-9_-]+$/.test(str) && !/^\d+$/.test(str)) return { student_code: str };
      return { public_id: '00000000-0000-0000-0000-000000000000' };
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

  async removeTeacher(classId, teacherId) {
      const classRecord = await prisma.class.findFirst({
        where: { ...this._parseId(classId), deleted_at: null },
      });
      if (!classRecord) throw new NotFound('Lớp học không tồn tại');
  
      return teacherService.removeTeacherFromClass(teacherId, classRecord.class_id);
    }

  _calculateSuitableGrade(dob) {
      if (!dob) return { key: 'NHA_TRE', label: 'Nhà trẻ' };
      const birthDate = new Date(dob);
      const birthYear = birthDate.getFullYear();
      // In Sorak system:
      // Children born 2023-2025 -> Nhà trẻ (12–36+ tháng)
      // Children born 2022 -> Mầm (3–4 tuổi)
      // Children born 2021 -> Chồi (4–5 tuổi)
      // Children born 2020 or earlier -> Lá (5–6 tuổi)
      if (birthYear >= 2023) {
        return { key: 'NHA_TRE', label: 'Nhà trẻ' };
      } else if (birthYear === 2022) {
        return { key: 'MAM', label: 'Mầm' };
      } else if (birthYear === 2021) {
        return { key: 'CHOI', label: 'Chồi' };
      } else {
        return { key: 'LA', label: 'Lá' };
      }
    }

  async getClassStudents(classId, { search } = {}) {
      const classRecord = await prisma.class.findFirst({
        where: { ...this._parseId(classId), deleted_at: null },
        include: {
          school_year: { select: { school_year_id: true, name: true, status: true } },
        },
      });
      if (!classRecord) throw new NotFound('Lớp học không tồn tại');
  
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

}
export const classService = new ClassService();
export default classService;
