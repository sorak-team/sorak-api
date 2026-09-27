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

  async _generateStudentCode(enrollmentDate, schoolYearStartYear) {
    let admissionYear;
    if (enrollmentDate) {
      if (typeof enrollmentDate === 'string' && enrollmentDate.includes('/')) {
        const parts = enrollmentDate.split('/');
        if (parts.length === 3) admissionYear = parseInt(parts[2], 10);
      } else {
        const d = new Date(enrollmentDate);
        if (!isNaN(d.getTime())) admissionYear = d.getFullYear();
      }
    }
    if (!admissionYear || isNaN(admissionYear)) {
      admissionYear = schoolYearStartYear || new Date().getFullYear();
    }

    // Quy tắc: Mã số học sinh tối thiểu là từ năm 2000 (HS00xxx)
    if (admissionYear < 2000) {
      admissionYear = 2000;
    }

    const yearSuffix = String(admissionYear).slice(-2);
    const prefix = `HS${yearSuffix}`;

    const existing = await prisma.student.findMany({
      where: { student_code: { startsWith: prefix, mode: 'insensitive' } },
      select: { student_code: true },
    });

    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}(\\d{3})$`, 'i');
    for (const s of existing) {
      const match = s.student_code.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }

    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    return `${prefix}${nextSeq}`;
  }

  async createStudent(payload) {
    const {
      studentCode,
      fullName,
      dateOfBirth,
      gender,
      ethnic,
      nationality = 'Việt Nam',
      placeOfBirth,
      permanentResidence,
      currentResidence,
      status = 'STUDYING',
      enrollmentDate,
      allergyNotes,
      medicalNotes,
      notes,
      avatarUrl,
      classId,
      enrolledAt = new Date(),
      parents = [],
    } = payload;

    // Validate class if provided
    let targetClass = null;
    if (classId) {
      const isNumeric = /^\d+$/.test(String(classId));
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(classId),
      );
      if (isNumeric) {
        targetClass = await prisma.class.findFirst({
          where: { class_id: BigInt(classId), deleted_at: null },
          include: { school_year: true },
        });
      } else if (isUuid) {
        targetClass = await prisma.class.findFirst({
          where: { public_id: String(classId), deleted_at: null },
          include: { school_year: true },
        });
      } else {
        // Fallback for mock IDs like 'nt-a1' or matching by name
        targetClass = await prisma.class.findFirst({
          where: {
            OR: [
              { name: { contains: String(classId), mode: 'insensitive' } },
              { age_group: { contains: String(classId), mode: 'insensitive' } },
            ],
            deleted_at: null,
          },
          include: { school_year: true },
        });
      }
      if (!targetClass && (isNumeric || isUuid)) {
        throw new NotFound(`Lớp học (ID: ${classId}) không tồn tại`);
      }
    }

    // Auto-generate or format studentCode (HS + YY + 001..999 per admission year)
    let finalStudentCode;
    if (!studentCode || String(studentCode).trim().toUpperCase().startsWith('HS')) {
      const startYear = targetClass?.school_year?.start_date
        ? new Date(targetClass.school_year.start_date).getFullYear()
        : null;
      finalStudentCode = await this._generateStudentCode(
        enrollmentDate,
        startYear,
      );
    } else {
      finalStudentCode = String(studentCode).trim().toUpperCase();
    }

    // Check studentCode uniqueness
    const existingCode = await prisma.student.findUnique({
      where: { student_code: finalStudentCode },
    });
    if (existingCode) {
      throw new Conflict(`Mã học sinh '${finalStudentCode}' đã tồn tại trên hệ thống`);
    }

    // Execute atomic creation (Profile SSOT without auto-creating account)
    const created = await prisma.$transaction(async (tx) => {
      // 1. Create Student (Profile SSOT with account_id: null)
      const student = await tx.student.create({
        data: {
          account_id: null,
          student_code: finalStudentCode,
          full_name: fullName,
          avatar_url: avatarUrl || null,
          date_of_birth: new Date(dateOfBirth),
          gender,
          ethnic: ethnic || null,
          nationality,
          place_of_birth: placeOfBirth || null,
          permanent_residence: permanentResidence || null,
          current_residence: currentResidence || null,
          status,
          enrollment_date: new Date(enrollmentDate),
          allergy_notes: allergyNotes || null,
          medical_notes: medicalNotes || null,
          previous_school: payload.previousSchool || notes || null,
        },
      });

      // 2. Create Parents
      if (Array.isArray(parents) && parents.length > 0) {
        for (const p of parents) {
          if (p.fullName && p.fullName.trim()) {
            await tx.parent.create({
              data: {
                student_id: student.student_id,
                full_name: p.fullName.trim(),
                relationship: p.relationship || 'Bố',
                phone: p.phone || '',
                can_pickup: p.canPickup !== undefined ? Boolean(p.canPickup) : true,
              },
            });
          }
        }
      }

      // 3. Initial Class Enrollment if provided
      if (targetClass) {
        await tx.studentEnrollment.create({
          data: {
            student_id: student.student_id,
            class_id: targetClass.class_id,
            enrolled_at: new Date(enrolledAt),
          },
        });
      }

      return student;
    });

    logger.info(`[StudentService] Created student ${created.student_code} (${created.full_name})`);
    return this.getStudentById(created.public_id || created.student_id.toString());
  }
}
export const studentService = new StudentService();
export default studentService;
