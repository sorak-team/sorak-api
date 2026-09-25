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
  
        const suitable = this._calculateSuitableGrade(s.date_of_birth);
  
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

  async allocateStudents(classId, { studentIds }) {
      const classRecord = await prisma.class.findFirst({
        where: { ...this._parseId(classId), deleted_at: null },
        include: {
          school_year: true,
          student_enrollments: {
            where: { left_at: null, student: { deleted_at: null } },
          },
        },
      });
      if (!classRecord) throw new NotFound('Lớp học không tồn tại');
  
      const capacity = 24;
      const currentCount = classRecord.student_enrollments.length;
      const remainingSlots = Math.max(0, capacity - currentCount);
  
      if (studentIds.length > remainingSlots) {
        throw new BadRequest(
          `Lớp học chỉ còn ${remainingSlots} chỗ trống (sĩ số tối đa ${capacity}). Không thể thêm ${studentIds.length} học sinh.`
        );
      }
  
      // Resolve student records
      const students = await prisma.student.findMany({
        where: {
          OR: studentIds.map((id) =>
            /^\d+$/.test(String(id)) ? { student_id: BigInt(id) } : { public_id: String(id) }
          ),
          deleted_at: null,
        },
        select: { student_id: true, public_id: true, full_name: true },
      });
  
      if (students.length === 0) {
        throw new BadRequest('Không tìm thấy học sinh hợp lệ để thêm vào lớp');
      }
  
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        for (const s of students) {
          // Close active enrollments in other classes for this school year
          await tx.studentEnrollment.updateMany({
            where: {
              student_id: s.student_id,
              left_at: null,
              class: {
                school_year_id: classRecord.school_year_id,
                class_id: { not: classRecord.class_id },
              },
            },
            data: { left_at: now },
          });
  
          // Upsert into target class
          const existing = await tx.studentEnrollment.findUnique({
            where: {
              student_id_class_id: {
                student_id: s.student_id,
                class_id: classRecord.class_id,
              },
            },
          });
  
          if (existing) {
            await tx.studentEnrollment.update({
              where: { enrollment_id: existing.enrollment_id },
              data: { left_at: null, enrolled_at: now },
            });
          } else {
            await tx.studentEnrollment.create({
              data: {
                student_id: s.student_id,
                class_id: classRecord.class_id,
                enrolled_at: now,
                left_at: null,
              },
            });
          }
  
          // Ensure student status is STUDYING when admitted into active class
          await tx.student.update({
            where: { student_id: s.student_id },
            data: { status: 'STUDYING' },
          });
        }
      });
  
      return this.getClassStudents(classRecord.public_id || classRecord.class_id.toString());
    }

  async removeStudents(classId, { studentIds }) {
      const classRecord = await prisma.class.findFirst({
        where: { ...this._parseId(classId), deleted_at: null },
      });
      if (!classRecord) throw new NotFound('Lớp học không tồn tại');
  
      const students = await prisma.student.findMany({
        where: {
          OR: studentIds.map((id) =>
            /^\d+$/.test(String(id)) ? { student_id: BigInt(id) } : { public_id: String(id) }
          ),
        },
        select: { student_id: true },
      });
  
      const targetStudentIds = students.map((s) => s.student_id);
  
      await prisma.studentEnrollment.updateMany({
        where: {
          class_id: classRecord.class_id,
          student_id: { in: targetStudentIds },
          left_at: null,
        },
        data: {
          left_at: new Date(),
        },
      });
  
      return this.getClassStudents(classRecord.public_id || classRecord.class_id.toString());
    }

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

  async updateTeacherRole(classId, teacherId, { isPrimary }) {
      const classRecord = await prisma.class.findFirst({
        where: { ...this._parseId(classId), deleted_at: null },
      });
      if (!classRecord) throw new NotFound('Lớp học không tồn tại');
  
      const teacher = await prisma.teacher.findFirst({
        where: { ...this._parseTeacherId(teacherId), deleted_at: null },
      });
      if (!teacher) throw new NotFound('Giáo viên không tồn tại');
  
      const allocation = await prisma.teacherClass.findFirst({
        where: {
          class_id: classRecord.class_id,
          teacher_id: teacher.teacher_id,
          left_at: null,
        },
      });
      if (!allocation) {
        throw new NotFound('Giáo viên chưa được phân công vào lớp này');
      }
  
      await prisma.$transaction(async (tx) => {
        if (isPrimary) {
          // Demote existing primary teachers in this class
          await tx.teacherClass.updateMany({
            where: {
              class_id: classRecord.class_id,
              left_at: null,
              is_primary: true,
            },
            data: { is_primary: false },
          });
        }
  
        await tx.teacherClass.update({
          where: { id: allocation.id },
          data: { is_primary: !!isPrimary },
        });
      });
  
      return this.getClassTeachers(classRecord.public_id || classRecord.class_id.toString());
    }

  async getClassTransfers(classId, { status, direction, search } = {}) {
      const classRecord = await prisma.class.findFirst({
        where: { ...this._parseId(classId), deleted_at: null },
        include: { school_year: true },
      });
      if (!classRecord) throw new NotFound('Lớp học không tồn tại');
  
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
        };
      });
  
      const totalCount = items.length;
      const pendingCount = items.filter((i) => i.status === 'PENDING').length;
      const approvedCount = items.filter((i) => i.status === 'APPROVED').length;
      const rejectedCount = items.filter((i) => i.status === 'REJECTED').length;
  
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

  async getAllTransfers({ status, search, schoolYearId } = {}) {
      const andConditions = [{ deleted_at: null }];
  
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
      }));
  
      const totalCount = items.length;
      const pendingCount = items.filter((i) => i.status === 'PENDING').length;
      const approvedCount = items.filter((i) => i.status === 'APPROVED').length;
      const rejectedCount = items.filter((i) => i.status === 'REJECTED').length;
  
      return {
        summary: {
          total: totalCount,
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
        },
        items,
      };
    }

  async getTransferById(transferId) {
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
          from_class: { include: { school_year: true } },
          to_class: { include: { school_year: true } },
          creator: true,
          approver: true,
        },
      });
  
      if (!t) {
        throw new NotFound('Không tìm thấy yêu cầu chuyển lớp');
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
      };
    }

  async createGlobalTransferRequest(body, creatorAccountId) {
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
      return this.createTransferRequest(fromClassId, body, creatorAccountId);
    }

  async updateTransferStatus(classId, transferId, { status, rejectedReason }, approverAccountId) {
      const transfer = await prisma.classTransfer.findFirst({
        where: { ...this._parseTransferId(transferId), deleted_at: null },
        include: { student: true, from_class: true, to_class: true },
      });
      if (!transfer) throw new NotFound('Không tìm thấy yêu cầu chuyển lớp');
  
      let approverId = approverAccountId;
      if (!approverId) {
        const defaultAdmin = await prisma.account.findFirst({ where: { role: 'PRINCIPAL_BGH' } });
        approverId = defaultAdmin?.account_id || 1n;
      }
  
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
  
          // 2. Open enrollment in to_class
          const existingEnrollment = await tx.studentEnrollment.findFirst({
            where: {
              student_id: transfer.student_id,
              class_id: transfer.to_class_id,
            },
          });
          if (existingEnrollment) {
            await tx.studentEnrollment.update({
              where: { enrollment_id: existingEnrollment.enrollment_id },
              data: { left_at: null, status: 'ENROLLED', leave_reason: null },
            });
          } else {
            await tx.studentEnrollment.create({
              data: {
                student_id: transfer.student_id,
                class_id: transfer.to_class_id,
                enrolled_at: tDate,
                status: 'ENROLLED',
              },
            });
          }
  
          // 3. Mark transfer approved
          await tx.classTransfer.update({
            where: { transfer_id: transfer.transfer_id },
            data: {
              status: 'APPROVED',
              approved_by: BigInt(approverId),
              approved_at: tDate,
            },
          });
        });
      } else if (status === 'REJECTED') {
        await prisma.classTransfer.update({
          where: { transfer_id: transfer.transfer_id },
          data: {
            status: 'REJECTED',
            rejected_reason: rejectedReason?.trim() || 'Không đáp ứng điều kiện chuyển lớp',
            approved_by: BigInt(approverId),
            approved_at: new Date(),
          },
        });
      } else {
        throw new BadRequest('Trạng thái cập nhật không hợp lệ');
      }
  
      return { success: true, status };
    }

}
export const classService = new ClassService();
export default classService;
