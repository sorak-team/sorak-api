import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

const CLASS_TIER_ORDER = { NHA_TRE: 1, MAM: 2, CHOI: 3, LA: 4 };

export class StudentService {
  _parseId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) return { public_id: str };
    if (/^\d+$/.test(str)) return { student_id: BigInt(str) };
    if (/^[A-Za-z0-9_-]+$/.test(str)) return { student_code: str };
    return { public_id: '00000000-0000-0000-0000-000000000000' };
  }
  _parseParentId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
  }
  _getDefaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed || 'student')}`;
  }
  _findClass(classId) {
    return prisma.class.findFirst({ where: { ...this._parseId(classId), deleted_at: null } });
  }

  async listStudents({ page = 1, limit = 20, search, status, gender, classId, schoolYearId, sortBy = 'newest' }) {
    const skip = (Math.max(1, page) - 1) * limit;

    const where = {
      deleted_at: null,
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { student_code: { contains: q, mode: 'insensitive' } },
        { account: { username: { contains: q, mode: 'insensitive' } } },
        {
          parents: {
            some: {
              OR: [
                { full_name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (gender && gender !== 'ALL') {
      where.gender = gender;
    }

    if (classId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(classId),
      );
      const targetClass = await prisma.class.findFirst({
        where: isUuid ? { public_id: String(classId) } : { class_id: BigInt(classId) },
        include: { school_year: true },
      });
      const isCompleted = targetClass?.school_year?.status === 'COMPLETED';

      where.student_enrollments = {
        some: {
          class: isUuid ? { public_id: String(classId) } : { class_id: BigInt(classId) },
          ...(isCompleted ? {} : { left_at: null }),
        },
      };
    } else if (schoolYearId) {
      const isSyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(schoolYearId),
      );
      where.student_enrollments = {
        some: {
          class: {
            OR: [
              ...(isSyUuid
                ? [{ school_year: { public_id: String(schoolYearId) } }]
                : [{ school_year_id: BigInt(schoolYearId) }]),
              { school_year: { name: { contains: String(schoolYearId) } } },
            ],
          },
        },
      };
    }

    let orderBy = { created_at: 'desc' };
    switch (sortBy) {
      case 'oldest':
        orderBy = { created_at: 'asc' };
        break;
      case 'name':
        orderBy = { full_name: 'asc' };
        break;
      case 'code':
        orderBy = { student_code: 'asc' };
        break;
      case 'dob':
        orderBy = { date_of_birth: 'desc' };
        break;
      case 'enrollmentDate':
        orderBy = { enrollment_date: 'desc' };
        break;
      case 'newest':
      default:
        orderBy = { created_at: 'desc' };
        break;
    }

    const [total, items] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
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
          parents: {
            where: { deleted_at: null },
            orderBy: { created_at: 'asc' },
          },
          student_enrollments: {
            orderBy: { enrolled_at: 'desc' },
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
      }),
    ]);

    const formatted = items.map((s) => this._formatStudentSummary(s, schoolYearId));

    // Default sort by class age tier (smallest to largest: Nhà trẻ -> Mầm -> Chồi -> Lá)
    if (!sortBy || sortBy === 'classTier' || sortBy === 'newest') {
      const CLASS_TIER_ORDER = {
        NHA_TRE: 1,
        MAM: 2,
        CHOI: 3,
        LA: 4,
      };

      const getTier = (s) => {
        if (!s.currentClass) return 999;
        const grp = String(s.currentClass.ageGroup || '')
          .toUpperCase()
          .trim();
        if (CLASS_TIER_ORDER[grp]) return CLASS_TIER_ORDER[grp];
        const name = String(s.currentClass.className || '').toLowerCase();
        if (name.includes('nhà trẻ') || name.includes('nha tre')) return 1;
        if (name.includes('mầm') || name.includes('mam')) return 2;
        if (name.includes('chồi') || name.includes('choi')) return 3;
        if (name.includes('lá') || name.includes('la')) return 4;
        return 500;
      };

      formatted.sort((a, b) => {
        const tierA = getTier(a);
        const tierB = getTier(b);
        if (tierA !== tierB) return tierA - tierB;

        const codeA = String(a.studentCode || a.code || '').trim();
        const codeB = String(b.studentCode || b.code || '').trim();
        const codeComp = codeA.localeCompare(codeB, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (codeComp !== 0) return codeComp;

        const classA = a.currentClass?.className || '';
        const classB = b.currentClass?.className || '';
        const cComp = classA.localeCompare(classB, 'vi');
        if (cComp !== 0) return cComp;

        const nameA = a.fullName || a.studentCode || '';
        const nameB = b.fullName || b.studentCode || '';
        return nameA.localeCompare(nameB, 'vi');
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

  async getStudentById(id) {
    const where = { ...this._parseId(id), deleted_at: null };

    const student = await prisma.student.findFirst({
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
            created_at: true,
          },
        },
        parents: {
          where: { deleted_at: null },
          orderBy: { created_at: 'asc' },
        },
        student_enrollments: {
          orderBy: { enrolled_at: 'desc' },
          include: {
            class: {
              select: {
                class_id: true,
                public_id: true,
                name: true,
                room_number: true,
                age_group: true,
                school_year: {
                  select: { school_year_id: true, name: true, status: true },
                },
              },
            },
          },
        },
        class_transfers: {
          orderBy: { transfer_date: 'desc' },
          include: {
            from_class: {
              select: { class_id: true, public_id: true, name: true, room_number: true },
            },
            to_class: {
              select: { class_id: true, public_id: true, name: true, room_number: true },
            },
            creator: {
              select: { account_id: true, public_id: true, username: true, role: true },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFound('Hồ sơ học sinh không tồn tại hoặc đã bị xóa');
    }

    return this._formatStudentDetail(student);
  }
}
export const studentService = new StudentService();
export default studentService;
