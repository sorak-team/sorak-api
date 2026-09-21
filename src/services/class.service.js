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

}
export const classService = new ClassService();
export default classService;
