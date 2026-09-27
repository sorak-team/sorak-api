import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class StudentService {
  /**
   * Helper to parse student identifier (uuid or student_code)
   * Strictly rejects internal numeric sequence IDs to prevent enumeration.
   */
  _parseId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) {
      return { public_id: str };
    }
    // Reject pure numeric database sequence IDs
    if (/^\d+$/.test(str)) {
      return { public_id: '00000000-0000-0000-0000-000000000000' };
    }
    // Allow student code (e.g. HS24001)
    if (/^[A-Za-z0-9_-]+$/.test(str)) {
      return { student_code: str };
    }
    return { public_id: '00000000-0000-0000-0000-000000000000' };
  }

  /**
   * Helper to parse parent identifier (uuid only)
   */
  _parseParentId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
  }

  /**
   * Default DiceBear Critters avatar for student profile
   */
  _getDefaultAvatar(seed) {
    const safeSeed = (seed || 'student').toString().trim();
    return `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(safeSeed)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`;
  }

  /**
   * List students with pagination, search, status, gender, schoolYearId, and class filtering
   */
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

  /**
   * Get single student by ID with full profile, parents, and enrollment/transfer history
   */
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

  /**
   * Auto-generate student code based on admission year (Cohort): HS + YY + (001 -> 999)
   * Minimum year is 2000 (HS00xxx).
   */
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

  /**
   * Create a new student profile (without auto-creating account; accounts are created separately in Account module)
   */
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

  /**
   * Update student profile information
   */
  async updateStudent(id, payload) {
    const student = await prisma.student.findFirst({
      where: { ...this._parseId(id), deleted_at: null },
    });
    if (!student) {
      throw new NotFound('Hồ sơ học sinh không tồn tại');
    }

    const {
      fullName,
      dateOfBirth,
      gender,
      ethnic,
      nationality,
      placeOfBirth,
      permanentResidence,
      currentResidence,
      status,
      enrollmentDate,
      allergyNotes,
      medicalNotes,
      notes,
      avatarUrl,
      phone,
    } = payload;

    const studentUpdateData = {};
    if (fullName !== undefined) studentUpdateData.full_name = fullName;
    if (dateOfBirth !== undefined) studentUpdateData.date_of_birth = new Date(dateOfBirth);
    if (gender !== undefined) studentUpdateData.gender = gender;
    if (ethnic !== undefined) studentUpdateData.ethnic = ethnic || null;
    if (nationality !== undefined) studentUpdateData.nationality = nationality;
    if (placeOfBirth !== undefined) studentUpdateData.place_of_birth = placeOfBirth || null;
    if (avatarUrl !== undefined) studentUpdateData.avatar_url = avatarUrl || null;
    if (permanentResidence !== undefined)
      studentUpdateData.permanent_residence = permanentResidence || null;
    if (currentResidence !== undefined)
      studentUpdateData.current_residence = currentResidence || null;
    if (status !== undefined) studentUpdateData.status = status;
    if (enrollmentDate !== undefined) studentUpdateData.enrollment_date = new Date(enrollmentDate);
    if (allergyNotes !== undefined) studentUpdateData.allergy_notes = allergyNotes || null;
    if (medicalNotes !== undefined) studentUpdateData.medical_notes = medicalNotes || null;
    if (payload.previousSchool !== undefined || notes !== undefined) {
      studentUpdateData.previous_school = payload.previousSchool || notes || null;
    }

    if (Object.keys(studentUpdateData).length > 0) {
      await prisma.student.update({
        where: { student_id: student.student_id },
        data: studentUpdateData,
      });

      // Synchronize active enrollment status if global student status changes
      if (status !== undefined) {
        if (status === 'RESERVED') {
          await prisma.studentEnrollment.updateMany({
            where: { student_id: student.student_id, left_at: null },
            data: { left_at: new Date(), status: 'RESERVED', leave_reason: payload.leaveReason || 'Bảo lưu' },
          });
        } else if (status === 'TRANSFERRED') {
          await prisma.studentEnrollment.updateMany({
            where: { student_id: student.student_id, left_at: null },
            data: { left_at: new Date(), status: 'TRANSFERRED_SCHOOL', leave_reason: payload.leaveReason || 'Chuyển trường' },
          });
        } else if (status === 'DROPPED_OUT') {
          await prisma.studentEnrollment.updateMany({
            where: { student_id: student.student_id, left_at: null },
            data: { left_at: new Date(), status: 'DROPPED_OUT', leave_reason: payload.leaveReason || 'Thôi học' },
          });
        } else if (status === 'STUDYING') {
          // If returning to studying and has an active enrollment
          await prisma.studentEnrollment.updateMany({
            where: { student_id: student.student_id, left_at: null },
            data: { status: 'ENROLLED', leave_reason: null },
          });
        }
      }
    }

    if (Array.isArray(payload.parents)) {
      await prisma.$transaction(async (tx) => {
        await tx.parent.deleteMany({
          where: { student_id: student.student_id },
        });
        for (const p of payload.parents) {
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
      });
    }

    return this.getStudentById(student.public_id || student.student_id.toString());
  }

  /**
   * Soft delete student profile and associated account
   */
  async deleteStudent(id) {
    const student = await prisma.student.findFirst({
      where: { ...this._parseId(id), deleted_at: null },
    });
    if (!student) {
      throw new NotFound('Hồ sơ học sinh không tồn tại');
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();

      // 1. Soft delete student
      await tx.student.update({
        where: { student_id: student.student_id },
        data: {
          deleted_at: now,
          status: 'DROPPED_OUT',
        },
      });

      // 2. Close active enrollments
      await tx.studentEnrollment.updateMany({
        where: { student_id: student.student_id, left_at: null },
        data: { left_at: now, status: 'DROPPED_OUT', leave_reason: 'Thôi học' },
      });

      // 3. Deactivate associated account if exists
      if (student.account_id) {
        await tx.account.update({
          where: { account_id: student.account_id },
          data: { is_active: false, deleted_at: now },
        });
      }
    });

    logger.info(`[StudentService] Soft deleted student ID: ${student.student_id}`);
    return { success: true, message: 'Đã xóa hồ sơ học sinh thành công' };
  }

  /**
   * Enroll student into a class
   */
  async enrollStudent(id, { classId, enrolledAt = new Date() }) {
    const student = await prisma.student.findFirst({
      where: { ...this._parseId(id), deleted_at: null },
    });
    if (!student) throw new NotFound('Hồ sơ học sinh không tồn tại');

    const isNumeric = /^\d+$/.test(String(classId));
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(classId),
    );
    const targetClass = await prisma.class.findFirst({
      where: isNumeric
        ? { class_id: BigInt(classId), deleted_at: null }
        : isUuid
          ? { public_id: String(classId), deleted_at: null }
          : { deleted_at: null },
    });
    if (!targetClass) throw new NotFound('Lớp học không tồn tại');

    // Close any previous active enrollment
    await prisma.$transaction(async (tx) => {
      await tx.studentEnrollment.updateMany({
        where: { student_id: student.student_id, left_at: null },
        data: { left_at: new Date(enrolledAt), status: 'COMPLETED', leave_reason: 'Phân lớp mới' },
      });

      await tx.studentEnrollment.create({
        data: {
          student_id: student.student_id,
          class_id: targetClass.class_id,
          enrolled_at: new Date(enrolledAt),
          status: 'ENROLLED',
        },
      });
    });

    return this.getStudentById(student.student_id.toString());
  }

  /**
   * Helper to find class by ID (bigint), UUID (public_id), or name/grade keyword
   */
  async _findClass(idOrKey) {
    if (!idOrKey) return null;
    const str = String(idOrKey).trim();
    const isNumeric = /^\d+$/.test(str);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (isNumeric) {
      return prisma.class.findFirst({
        where: { class_id: BigInt(str), deleted_at: null },
      });
    }
    if (isUuid) {
      return prisma.class.findFirst({
        where: { public_id: str, deleted_at: null },
      });
    }
    return prisma.class.findFirst({
      where: {
        OR: [
          { name: { contains: str, mode: 'insensitive' } },
          { age_group: { contains: str, mode: 'insensitive' } },
        ],
        deleted_at: null,
      },
    });
  }

  /**
   * Transfer student from one class to another with audit tracking
   */
  async transferStudent(
    id,
    { fromClassId, toClassId, transferDate = new Date(), reason, autoApprove = false },
    creatorAccountId,
  ) {
    const student = await prisma.student.findFirst({
      where: { ...this._parseId(id), deleted_at: null },
    });
    if (!student) throw new NotFound('Hồ sơ học sinh không tồn tại');

    const fromClass = await this._findClass(fromClassId);
    if (!fromClass) throw new NotFound('Lớp chuyển đi không tồn tại');

    const toClass = await this._findClass(toClassId);
    if (!toClass) throw new NotFound('Lớp chuyển đến không tồn tại');

    if (fromClass.class_id === toClass.class_id) {
      throw new BadRequest('Lớp chuyển đi và lớp chuyển đến không được trùng nhau');
    }

    let creatorId = creatorAccountId;
    if (!creatorId) {
      const defaultAdmin = await prisma.account.findFirst({ where: { role: 'PRINCIPAL_BGH' } });
      creatorId = defaultAdmin?.account_id || 1n;
    }

    const tDate = new Date(transferDate);

    if (autoApprove) {
      await prisma.$transaction(async (tx) => {
        // 1. Close active enrollment in from_class
        await tx.studentEnrollment.updateMany({
          where: {
            student_id: student.student_id,
            class_id: fromClass.class_id,
            left_at: null,
          },
          data: { left_at: tDate, status: 'TRANSFERRED_CLASS', leave_reason: reason || 'Chuyển lớp' },
        });

        // 2. Open new enrollment in to_class
        await tx.studentEnrollment.create({
          data: {
            student_id: student.student_id,
            class_id: toClass.class_id,
            enrolled_at: tDate,
            status: 'ENROLLED',
          },
        });

        // 3. Create ClassTransfer audit log as APPROVED
        await tx.classTransfer.create({
          data: {
            student_id: student.student_id,
            from_class_id: fromClass.class_id,
            to_class_id: toClass.class_id,
            transfer_date: tDate,
            reason: reason || null,
            created_by: BigInt(creatorId),
            status: 'APPROVED',
            approved_by: BigInt(creatorId),
            approved_at: tDate,
          },
        });
      });

      logger.info(
        `[StudentService] Transferred student ${student.student_code} from class ${fromClass.name} to ${toClass.name}`,
      );
    } else {
      // Create transfer request as PENDING without touching current student enrollment
      await prisma.classTransfer.create({
        data: {
          student_id: student.student_id,
          from_class_id: fromClass.class_id,
          to_class_id: toClass.class_id,
          transfer_date: tDate,
          reason: reason || null,
          created_by: BigInt(creatorId),
          status: 'PENDING',
        },
      });

      logger.info(
        `[StudentService] Created PENDING transfer request for student ${student.student_code} from class ${fromClass.name} to ${toClass.name}`,
      );
    }

    return this.getStudentById(student.student_id.toString());
  }

  /**
   * Add a parent/guardian to student
   */
  async addParent(studentId, parentData) {
    const student = await prisma.student.findFirst({
      where: { ...this._parseId(studentId), deleted_at: null },
    });
    if (!student) throw new NotFound('Hồ sơ học sinh không tồn tại');

    const created = await prisma.parent.create({
      data: {
        student_id: student.student_id,
        full_name: parentData.fullName,
        relationship: parentData.relationship,
        phone: parentData.phone,
        can_pickup: parentData.canPickup !== undefined ? Boolean(parentData.canPickup) : true,
        avatar_url: parentData.avatarUrl || null,
      },
    });

    return {
      id: created.parent_id.toString(),
      publicId: created.public_id,
      fullName: created.full_name,
      relationship: created.relationship,
      phone: created.phone,
      canPickup: created.can_pickup,
      avatarUrl: created.avatar_url || null,
    };
  }

  /**
   * Update parent record
   */
  async updateParent(studentId, parentId, parentData) {
    const parent = await prisma.parent.findFirst({
      where: { ...this._parseParentId(parentId), deleted_at: null },
    });
    if (!parent) throw new NotFound('Thông tin phụ huynh không tồn tại');

    const updateData = {};
    if (parentData.fullName !== undefined) updateData.full_name = parentData.fullName;
    if (parentData.relationship !== undefined) updateData.relationship = parentData.relationship;
    if (parentData.phone !== undefined) updateData.phone = parentData.phone;
    if (parentData.canPickup !== undefined) updateData.can_pickup = Boolean(parentData.canPickup);
    if (parentData.avatarUrl !== undefined) updateData.avatar_url = parentData.avatarUrl || null;

    const updated = await prisma.parent.update({
      where: { parent_id: parent.parent_id },
      data: updateData,
    });

    return {
      id: updated.public_id || updated.parent_id.toString(),
      publicId: updated.public_id,
      fullName: updated.full_name,
      relationship: updated.relationship,
      phone: updated.phone,
      canPickup: updated.can_pickup,
      avatarUrl: updated.avatar_url || null,
    };
  }

  /**
   * Delete parent record
   */
  async deleteParent(studentId, parentId) {
    const parent = await prisma.parent.findFirst({
      where: { ...this._parseParentId(parentId), deleted_at: null },
    });
    if (!parent) throw new NotFound('Thông tin phụ huynh không tồn tại');

    await prisma.parent.update({
      where: { parent_id: parent.parent_id },
      data: { deleted_at: new Date() },
    });

    return { success: true, message: 'Đã xóa thông tin phụ huynh' };
  }

  /**
   * Format student summary (for list views & tables)
   */
  _formatStudentSummary(s, schoolYearId) {
    let activeEnrollment = s.student_enrollments?.[0];
    if (schoolYearId) {
      const matching = s.student_enrollments?.find(
        (e) =>
          String(e.class?.school_year?.school_year_id) === String(schoolYearId) ||
          String(e.class?.school_year_id) === String(schoolYearId) ||
          String(e.class?.school_year?.public_id) === String(schoolYearId) ||
          e.class?.school_year?.name?.includes(String(schoolYearId))
      );
      if (matching) activeEnrollment = matching;
    }
    const primaryParent = s.parents?.find((p) => p.is_primary) || s.parents?.[0];

    return {
      id: s.public_id || s.student_id.toString(),
      publicId: s.public_id,
      studentCode: s.student_code,
      fullName: s.full_name,
      dateOfBirth: s.date_of_birth,
      gender: s.gender,
      ethnic: s.ethnic,
      nationality: s.nationality,
      status: s.status,
      enrollmentDate: s.enrollment_date,
      allergyNotes: s.allergy_notes,
      medicalNotes: s.medical_notes,
      previousSchool: s.previous_school,
      avatarUrl:
        s.avatar_url && !s.avatar_url.includes('api.dicebear.com')
          ? s.avatar_url
          : this._getDefaultAvatar(s.student_code || s.full_name),
      currentClass: activeEnrollment
        ? {
            classId: activeEnrollment.class.public_id || activeEnrollment.class.class_id.toString(),
            className: activeEnrollment.class.name,
            roomNumber: activeEnrollment.class.room_number,
            ageGroup: activeEnrollment.class.age_group,
            schoolYearName: activeEnrollment.class.school_year?.name,
            enrollmentStatus: activeEnrollment.status,
            leaveReason: activeEnrollment.leave_reason,
          }
        : null,
      enrollmentHistory: (s.student_enrollments || []).map((e) => ({
        enrollmentId: e.enrollment_id.toString(),
        classId: e.class?.public_id || e.class?.class_id?.toString() || e.class_id?.toString(),
        className: e.class?.name,
        roomNumber: e.class?.room_number,
        ageGroup: e.class?.age_group,
        schoolYearName: e.class?.school_year?.name,
        enrolledAt: e.enrolled_at,
        leftAt: e.left_at,
        isActive: e.left_at === null,
        status: e.status,
        leaveReason: e.leave_reason,
      })),
      primaryParent: primaryParent
        ? {
            id: primaryParent.public_id || primaryParent.parent_id.toString(),
            fullName: primaryParent.full_name,
            relationship: primaryParent.relationship,
            phone: primaryParent.phone,
            isPrimary: true,
            canPickup: primaryParent.can_pickup,
            avatarUrl: primaryParent.avatar_url || null,
          }
        : null,
      parents: (s.parents || []).map((p, idx) => ({
        id: p.public_id || p.parent_id.toString(),
        publicId: p.public_id,
        fullName: p.full_name,
        relationship: p.relationship,
        phone: p.phone,
        isPrimary: p.is_primary || idx === 0,
        canPickup: p.can_pickup,
        avatarUrl: p.avatar_url || null,
      })),
      parentCount: s.parents?.length || 0,
      account: s.account
        ? {
            id: s.account.public_id || s.account.account_id.toString(),
            publicId: s.account.public_id,
            username: s.account.username,
            role: s.account.role,
            isActive: s.account.is_active,
          }
        : null,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    };
  }

  /**
   * Format full student detail (for overview & drawer editing)
   */
  _formatStudentDetail(s) {
    const activeEnrollment = s.student_enrollments?.find((e) => e.left_at === null);
    const primaryParent = s.parents?.find((p) => p.is_primary) || s.parents?.[0];

    return {
      id: s.public_id || s.student_id.toString(),
      publicId: s.public_id,
      studentCode: s.student_code,
      fullName: s.full_name,
      dateOfBirth: s.date_of_birth,
      gender: s.gender,
      ethnic: s.ethnic,
      nationality: s.nationality,
      placeOfBirth: s.place_of_birth,
      permanentResidence: s.permanent_residence,
      currentResidence: s.current_residence,
      status: s.status,
      enrollmentDate: s.enrollment_date,
      allergyNotes: s.allergy_notes,
      medicalNotes: s.medical_notes,
      previousSchool: s.previous_school,
      notes: s.previous_school,
      avatarUrl:
        s.avatar_url && !s.avatar_url.includes('api.dicebear.com')
          ? s.avatar_url
          : this._getDefaultAvatar(s.student_code || s.full_name),
      primaryParent: primaryParent
        ? {
            id: primaryParent.public_id || primaryParent.parent_id.toString(),
            fullName: primaryParent.full_name,
            relationship: primaryParent.relationship,
            phone: primaryParent.phone,
            isPrimary: true,
            canPickup: primaryParent.can_pickup,
            avatarUrl: primaryParent.avatar_url || null,
          }
        : null,
      account: s.account
        ? {
            id: s.account.public_id || s.account.account_id.toString(),
            publicId: s.account.public_id,
            username: s.account.username,
            isActive: s.account.is_active,
            lastLoginAt: s.account.last_login_at,
          }
        : null,
      currentClass: activeEnrollment
        ? {
            enrollmentId: activeEnrollment.enrollment_id.toString(),
            classId: activeEnrollment.class.public_id || activeEnrollment.class.class_id.toString(),
            className: activeEnrollment.class.name,
            roomNumber: activeEnrollment.class.room_number,
            ageGroup: activeEnrollment.class.age_group,
            schoolYearName: activeEnrollment.class.school_year?.name,
            enrolledAt: activeEnrollment.enrolled_at,
          }
        : null,
      parents: (s.parents || []).map((p, idx) => ({
        id: p.public_id || p.parent_id.toString(),
        publicId: p.public_id,
        fullName: p.full_name,
        relationship: p.relationship,
        phone: p.phone,
        isPrimary: idx === 0,
        canPickup: p.can_pickup,
        avatarUrl: p.avatar_url || null,
      })),
      enrollmentHistory: (s.student_enrollments || []).map((e) => ({
        enrollmentId: e.enrollment_id.toString(),
        classId: e.class.public_id || e.class.class_id.toString(),
        className: e.class.name,
        roomNumber: e.class.room_number,
        ageGroup: e.class.age_group,
        schoolYearName: e.class.school_year?.name,
        enrolledAt: e.enrolled_at,
        leftAt: e.left_at,
        isActive: e.left_at === null,
        status: e.status,
        leaveReason: e.leave_reason,
      })),
      transferHistory: (s.class_transfers || []).map((t) => ({
        transferId: t.public_id || t.transfer_id.toString(),
        publicId: t.public_id,
        fromClass: {
          classId: t.from_class.public_id || t.from_class.class_id.toString(),
          name: t.from_class.name,
        },
        toClass: {
          classId: t.to_class.public_id || t.to_class.class_id.toString(),
          name: t.to_class.name,
        },
        transferDate: t.transfer_date,
        reason: t.reason,
        status: t.status,
        createdBy: t.creator ? t.creator.username : null,
      })),
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    };
  }
}

export const studentService = new StudentService();
export default studentService;
