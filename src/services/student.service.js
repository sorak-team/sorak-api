import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { classService } from './class.service.js';

export class StudentService {

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

  _parseParentId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
    }

  _getDefaultAvatar(seed) {
      const safeSeed = (seed || 'student').toString().trim();
      return `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(safeSeed)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`;
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
        where.status = String(status).toUpperCase();
      }
  
      if (gender && gender !== 'ALL') {
        where.gender = gender;
      }
  
      let targetSyId = schoolYearId;
      if (!targetSyId && !classId) {
        const activeYear = await prisma.schoolYear.findFirst({
          where: { status: 'ACTIVE', deleted_at: null },
        });
        if (activeYear) targetSyId = activeYear.school_year_id.toString();
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
      } else if (targetSyId && !['RESERVED', 'TRANSFERRED', 'DROPPED_OUT', 'GRADUATED'].includes(where.status)) {
        const isSyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(targetSyId),
        );

        const syFilter = isSyUuid
          ? { school_year: { public_id: String(targetSyId) } }
          : { school_year_id: BigInt(targetSyId) };

        where.OR = [
          // 1. Học sinh đang có phân lớp trong năm học được chọn
          {
            student_enrollments: {
              some: {
                class: {
                  OR: [
                    syFilter,
                    { school_year: { name: { contains: String(targetSyId) } } },
                  ],
                },
              },
            },
          },
          // 2. Học sinh chưa phân lớp (chưa có lớp nào còn đang theo học)
          {
            student_enrollments: {
              none: {
                left_at: null,
              },
            },
          },
          // 3. Học sinh có trạng thái phi học tập (Bảo lưu, Chuyển trường, Thôi học, Tốt nghiệp)
          {
            status: {
              in: ['RESERVED', 'TRANSFERRED', 'DROPPED_OUT', 'GRADUATED'],
            },
          },
        ];
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
  
      const formatted = items.map((s) => this._formatStudentSummary(s, targetSyId));
  
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
  
      // New students are admitted as unassigned ("Chưa phân lớp"). Class allocation is performed via Class Management.
      let targetClass = null;
  
      if (fullName && /\s{2,}/.test(fullName)) {
      throw new BadRequest('Họ tên không được chứa nhiều khoảng trắng liên tiếp.');
    }
    if (dateOfBirth && new Date(dateOfBirth).getTime() > Date.now()) {
      throw new BadRequest('Ngày sinh không được lớn hơn ngày hiện tại.');
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
  
        // 2. Validate & Create Parents
        if (!Array.isArray(parents) || parents.length === 0) {
          throw new BadRequest('Vui lòng bổ sung ít nhất một phụ huynh/người giám hộ trước khi tạo học sinh.');
        }
        if (parents.length > 2) {
          throw new BadRequest('Mỗi học sinh chỉ có tối đa 2 phụ huynh/người giám hộ.');
        }
        if (Array.isArray(parents) && parents.length > 0) {
          const cccds = parents
            .map((p) => (p.citizenId || p.citizen_id || '').trim())
            .filter(Boolean);
          if (new Set(cccds).size !== cccds.length) {
            throw new BadRequest('Số CCCD của các phụ huynh/người giám hộ không được trùng nhau.');
          }

          for (const p of parents) {
            if (p.fullName && p.fullName.trim()) {
              await tx.parent.create({
                data: {
                  student_id: student.student_id,
                  full_name: p.fullName.trim(),
                  relationship: p.relationship || 'Bố',
                  phone: p.phone || '',
                  citizen_id: (p.citizenId || p.citizen_id || '').trim() || null,
                },
              });
            }
          }
        }
  
        // 3. Newly created students strictly default to unassigned (Chưa phân lớp).
        // Class assignment must be performed explicitly via the Class Allocation function.
  
        return student;
      });
  
      logger.info(`[StudentService] Created student ${created.student_code} (${created.full_name})`);
      return this.getStudentById(created.public_id || created.student_id.toString());
    }

  async updateStudent(id, payload) {
      const student = await prisma.student.findFirst({
        where: { ...this._parseId(id), deleted_at: null },
      });
      if (!student) {
        throw new NotFound('Hồ sơ học sinh không tồn tại');
      }

      // Nếu trạng thái ở student là đã tốt nghiệp thì không thể chỉnh sửa được nữa
      if (student.status === 'GRADUATED') {
        throw new BadRequest('Học sinh đã tốt nghiệp không thể chỉnh sửa hồ sơ hoặc trạng thái.');
      }

      // CR-18 Optimistic Concurrency Control
      if (payload.updatedAt || payload.updated_at) {
        const clientTime = new Date(payload.updatedAt || payload.updated_at).getTime();
        const serverTime = new Date(student.updated_at).getTime();
        if (!isNaN(clientTime) && !isNaN(serverTime) && Math.abs(serverTime - clientTime) > 1000) {
          throw new Conflict('Dữ liệu đã được cập nhật trong một phiên khác. Thay đổi của bạn chưa được lưu. Vui lòng tải lại dữ liệu mới nhất và thực hiện lại.');
        }
      }

      // Prevent direct status change to GRADUATED from regular edit form
      if (payload.status === 'GRADUATED' && student.status !== 'GRADUATED') {
        throw new BadRequest('Trạng thái Đã tốt nghiệp chỉ được cập nhật thông qua quy trình xác nhận hoàn thành chương trình học của nhà trường.');
      }

      if (payload.fullName && /\s{2,}/.test(payload.fullName)) {
        throw new BadRequest('Họ tên không được chứa nhiều khoảng trắng liên tiếp.');
      }
      if (payload.dateOfBirth && new Date(payload.dateOfBirth).getTime() > Date.now()) {
        throw new BadRequest('Ngày sinh không được lớn hơn ngày hiện tại.');
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
  
        // Synchronize enrollment status in current active school year if global student status changes
        if (status !== undefined) {
          // Tìm năm học đang hoạt động hiện tại
          const activeSchoolYear = await prisma.schoolYear.findFirst({
            where: { status: 'ACTIVE', deleted_at: null },
          });

          // Tìm lớp học sinh đang theo học ở năm học hiện tại
          let enrollmentToSync = await prisma.studentEnrollment.findFirst({
            where: {
              student_id: student.student_id,
              left_at: null,
              ...(activeSchoolYear
                ? {
                    class: {
                      school_year_id: activeSchoolYear.school_year_id,
                      deleted_at: null,
                    },
                  }
                : {}),
            },
            include: { class: true },
          });

          // Fallback nếu không có ràng buộc school_year
          if (!enrollmentToSync) {
            enrollmentToSync = await prisma.studentEnrollment.findFirst({
              where: { student_id: student.student_id, left_at: null },
              include: { class: true },
            });
          }

          if (enrollmentToSync) {
            if (status === 'RESERVED') {
              await prisma.studentEnrollment.update({
                where: { enrollment_id: enrollmentToSync.enrollment_id },
                data: {
                  left_at: new Date(),
                  status: 'RESERVED',
                  leave_reason: payload.leaveReason || 'Bảo lưu',
                },
              });
            } else if (status === 'TRANSFERRED') {
              await prisma.studentEnrollment.update({
                where: { enrollment_id: enrollmentToSync.enrollment_id },
                data: {
                  left_at: new Date(),
                  status: 'TRANSFERRED_SCHOOL',
                  leave_reason: payload.leaveReason || 'Chuyển trường',
                },
              });
            } else if (status === 'DROPPED_OUT') {
              await prisma.studentEnrollment.update({
                where: { enrollment_id: enrollmentToSync.enrollment_id },
                data: {
                  left_at: new Date(),
                  status: 'DROPPED_OUT',
                  leave_reason: payload.leaveReason || 'Nghỉ học / Thôi học',
                },
              });
            } else if (status === 'GRADUATED') {
              await prisma.studentEnrollment.update({
                where: { enrollment_id: enrollmentToSync.enrollment_id },
                data: {
                  left_at: new Date(),
                  status: 'COMPLETED',
                  leave_reason: 'Tốt nghiệp ra trường',
                },
              });
            }
          }
        }
      }
  
      if (Array.isArray(payload.parents)) {
        if (payload.parents.length === 0) {
          throw new BadRequest('Vui lòng bổ sung ít nhất một phụ huynh/người giám hộ trước khi lưu học sinh.');
        }
        if (payload.parents.length > 2) {
          throw new BadRequest('Mỗi học sinh chỉ có tối đa 2 phụ huynh/người giám hộ.');
        }
        // Check upcoming dates so adding parents doesn't exceed 4 people total (max 4 - parents per day)
        const newParentCount = payload.parents.length;
        const maxAllowed = 4 - newParentCount;
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const upcomingAuths = await prisma.pickupAuthorization.findMany({
          where: {
            student_id: student.student_id,
            end_date: { gte: today },
            status: { in: ['PENDING', 'APPROVED'] },
            deleted_at: null,
          },
        });
        const dayCounts = {};
        for (const a of upcomingAuths) {
          const startKey = a.start_date.toISOString().split('T')[0];
          const endKey = a.end_date.toISOString().split('T')[0];
          const loopStart = startKey < today.toISOString().split('T')[0] ? today.toISOString().split('T')[0] : startKey;
          const cur = new Date(`${loopStart}T00:00:00.000Z`);
          const e = new Date(`${endKey}T00:00:00.000Z`);
          while (cur <= e) {
            const k = cur.toISOString().split('T')[0];
            dayCounts[k] = (dayCounts[k] || 0) + 1;
            if (dayCounts[k] > maxAllowed) {
              throw new BadRequest(`Không thể cập nhật danh sách phụ huynh do ngày ${k} đã có ${dayCounts[k]} người ủy quyền đón (vượt quá hạn mức ${maxAllowed} người/ngày).`);
            }
            cur.setUTCDate(cur.getUTCDate() + 1);
          }
        }
        const cccds = payload.parents
          .map((p) => (p.citizenId || p.citizen_id || '').trim())
          .filter(Boolean);
        if (new Set(cccds).size !== cccds.length) {
          throw new BadRequest('Số CCCD của các phụ huynh/người giám hộ không được trùng nhau.');
        }

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
                  citizen_id: (p.citizenId || p.citizen_id || '').trim() || null,
                },
              });
            }
          }
        });
      }
  
      return this.getStudentById(student.public_id || student.student_id.toString());
    }

  async deleteStudent(id) {
    // 1. Query student existence
    const where = { ...this._parseId(id), deleted_at: null };
    const student = await prisma.student.findFirst({ where });
    if (!student) {
      throw new NotFound('Hồ sơ học sinh không tồn tại');
    }

    // 2. Query related study data counts
    const relatedCounts = await prisma.student.findUnique({
      where: { student_id: student.student_id },
      select: {
        _count: {
          select: {
            student_enrollments: true,
            attendances: true,
            health_assessments: true,
            daily_assessments: true,
            monthly_assessments: true,
            semester_assessments: true,
            pickup_authorizations: true,
            class_transfers: true,
          },
        },
      },
    });

    const counts = relatedCounts?._count || {};
    const totalRelated = Object.values(counts).reduce((acc, c) => acc + (c || 0), 0);
    if (totalRelated > 0) {
      throw new BadRequest(
        'Không thể xóa học sinh đã có dữ liệu học tập phát sinh (phân lớp, điểm danh, đánh giá, sức khỏe...). Vui lòng chuyển trạng thái sang Thôi học.'
      );
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();

      // 1. Soft delete student
      await tx.student.update({
        where: { student_id: student.student_id },
        data: {
          deleted_at: now,
        },
      });

      // 2. Soft delete associated parents
      await tx.parent.updateMany({
        where: { student_id: student.student_id, deleted_at: null },
        data: { deleted_at: now },
      });

      // 3. Deactivate and soft delete associated account if exists
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

  async addParent(studentId, parentData) {
      const student = await prisma.student.findFirst({
        where: { ...this._parseId(studentId), deleted_at: null },
      });
      if (!student) throw new NotFound('Hồ sơ học sinh không tồn tại');

      const activeParentsCount = await prisma.parent.count({
        where: { student_id: student.student_id, deleted_at: null },
      });
      if (activeParentsCount >= 2) {
        throw new BadRequest('Mỗi học sinh chỉ có tối đa 2 phụ huynh/người giám hộ.');
      }

      // Check upcoming dates so adding a 2nd parent doesn't violate 4 - 2 = 2 delegates/day
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const upcomingAuths = await prisma.pickupAuthorization.findMany({
        where: {
          student_id: student.student_id,
          end_date: { gte: today },
          status: { in: ['PENDING', 'APPROVED'] },
          deleted_at: null,
        },
      });
      const dayCounts = {};
      for (const a of upcomingAuths) {
        const startKey = a.start_date.toISOString().split('T')[0];
        const endKey = a.end_date.toISOString().split('T')[0];
        const loopStart = startKey < today.toISOString().split('T')[0] ? today.toISOString().split('T')[0] : startKey;
        const cur = new Date(`${loopStart}T00:00:00.000Z`);
        const e = new Date(`${endKey}T00:00:00.000Z`);
        while (cur <= e) {
          const k = cur.toISOString().split('T')[0];
          dayCounts[k] = (dayCounts[k] || 0) + 1;
          if (dayCounts[k] > 2) {
            throw new BadRequest(`Không thể thêm phụ huynh thứ 2 do ngày ${k} đã có ${dayCounts[k]} người ủy quyền đón (vượt quá hạn mức tối đa 2 người ủy quyền/ngày).`);
          }
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      }

      const cccd = (parentData.citizenId || parentData.citizen_id || '').trim();
      if (cccd) {
        const existingInStudent = await prisma.parent.findFirst({
          where: { student_id: student.student_id, citizen_id: cccd, deleted_at: null },
        });
        if (existingInStudent) {
          throw new BadRequest('Số CCCD đã tồn tại trong danh sách phụ huynh của học sinh này.');
        }
      }

      const created = await prisma.parent.create({
        data: {
          student_id: student.student_id,
          full_name: parentData.fullName,
          relationship: parentData.relationship,
          phone: parentData.phone,
          citizen_id: cccd || null,
          avatar_url: parentData.avatarUrl || null,
        },
      });

      return {
        id: created.parent_id.toString(),
        publicId: created.public_id,
        fullName: created.full_name,
        relationship: created.relationship,
        phone: created.phone,
        citizenId: created.citizen_id || '',
        avatarUrl: created.avatar_url || null,
      };
    }

  async updateParent(studentId, parentId, parentData) {
      const parent = await prisma.parent.findFirst({
        where: { ...this._parseParentId(parentId), deleted_at: null },
      });
      if (!parent) throw new NotFound('Thông tin phụ huynh không tồn tại');

      const updateData = {};
      if (parentData.fullName !== undefined) updateData.full_name = parentData.fullName;
      if (parentData.relationship !== undefined) updateData.relationship = parentData.relationship;
      if (parentData.phone !== undefined) updateData.phone = parentData.phone;
      if (parentData.avatarUrl !== undefined) updateData.avatar_url = parentData.avatarUrl || null;
      if (parentData.citizenId !== undefined || parentData.citizen_id !== undefined) {
        const cccd = (parentData.citizenId !== undefined ? parentData.citizenId : parentData.citizen_id || '').trim();
        updateData.citizen_id = cccd || null;
      }

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
        citizenId: updated.citizen_id || '',
        avatarUrl: updated.avatar_url || null,
      };
    }

  async deleteParent(studentId, parentId) {
      const parent = await prisma.parent.findFirst({
        where: { ...this._parseParentId(parentId), deleted_at: null },
      });
      if (!parent) throw new NotFound('Thông tin phụ huynh không tồn tại');

      const activeParentsCount = await prisma.parent.count({
        where: { student_id: parent.student_id, deleted_at: null },
      });
      if (activeParentsCount <= 1) {
        throw new BadRequest('Mỗi học sinh phải có tối thiểu 1 phụ huynh/người giám hộ. Không thể xóa phụ huynh duy nhất này.');
      }
  
      await prisma.parent.update({
        where: { parent_id: parent.parent_id },
        data: { deleted_at: new Date() },
      });
  
      return { success: true, message: 'Đã xóa thông tin phụ huynh' };
    }

  async enrollStudent(studentId, { classId, enrolledAt }) {
    const student = await prisma.student.findFirst({
      where: { ...this._parseId(studentId), deleted_at: null },
      include: {
        student_enrollments: {
          where: { left_at: null },
        },
      },
    });
    if (!student) throw new NotFound('Hồ sơ học sinh không tồn tại');

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(classId));
    const targetClass = await prisma.class.findFirst({
      where: isUuid ? { public_id: String(classId), deleted_at: null } : { class_id: BigInt(classId), deleted_at: null },
    });
    if (!targetClass) throw new NotFound('Lớp học không tồn tại');

    if (student.student_enrollments?.length > 0) {
      await prisma.studentEnrollment.updateMany({
        where: { student_id: student.student_id, left_at: null },
        data: { left_at: new Date() },
      });
    }

    await prisma.studentEnrollment.create({
      data: {
        student_id: student.student_id,
        class_id: targetClass.class_id,
        enrolled_at: enrolledAt ? new Date(enrolledAt) : new Date(),
        status: 'ENROLLED',
      },
    });

    return this.getStudentById(student.public_id);
  }

  async transferStudent(studentId, { fromClassId, toClassId, transferDate, reason, autoApprove }, creatorAccountId, user = null) {
    const student = await prisma.student.findFirst({
      where: { ...this._parseId(studentId), deleted_at: null },
      include: {
        student_enrollments: {
          where: { left_at: null },
          orderBy: { enrolled_at: 'desc' },
        },
      },
    });
    if (!student) throw new NotFound('Học sinh không tồn tại');

    let effectiveFromClassId = fromClassId;
    if (!effectiveFromClassId) {
      const activeEnrollment = student.student_enrollments?.[0];
      if (!activeEnrollment) {
        throw new BadRequest('Học sinh chưa được xếp vào lớp nào');
      }
      effectiveFromClassId = activeEnrollment.class_id.toString();
    }

    return classService.createTransferRequest(
      effectiveFromClassId,
      { studentId: student.public_id, toClassId, transferDate, reason, autoApprove },
      creatorAccountId,
      user,
    );
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
   * Format student summary (for list views and tables)
   */
  _formatStudentSummary(s, schoolYearId) {
    let activeEnrollment = s.student_enrollments?.find((e) => e.left_at === null) || s.student_enrollments?.[0];
    if (schoolYearId) {
      const matching = s.student_enrollments?.find(
        (e) =>
          (String(e.class?.school_year?.school_year_id) === String(schoolYearId) ||
          String(e.class?.school_year_id) === String(schoolYearId) ||
          String(e.class?.school_year?.public_id) === String(schoolYearId) ||
          e.class?.school_year?.name?.includes(String(schoolYearId))) &&
          e.left_at === null
      ) || s.student_enrollments?.find(
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
            citizenId: primaryParent.citizen_id || '',
            isPrimary: true,
            avatarUrl: primaryParent.avatar_url || null,
          }
        : null,
      parents: (s.parents || []).map((p, idx) => ({
        id: p.public_id || p.parent_id.toString(),
        publicId: p.public_id,
        fullName: p.full_name,
        relationship: p.relationship,
        phone: p.phone,
        citizenId: p.citizen_id || '',
        isPrimary: p.is_primary || idx === 0,
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
            citizenId: primaryParent.citizen_id || '',
            isPrimary: true,
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
        citizenId: p.citizen_id || '',
        isPrimary: idx === 0,
        avatarUrl: p.avatar_url || null,
      })),
      enrollmentHistory: (s.student_enrollments || []).map((e) => ({
        enrollmentId: e.enrollment_id.toString(),
        classId: e.class?.public_id || e.class?.class_id?.toString(),
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
      transferHistory: (s.class_transfers || []).map((t) => ({
        transferId: t.public_id || t.transfer_id.toString(),
        publicId: t.public_id,
        fromClass: {
          classId: t.from_class?.public_id || t.from_class?.class_id?.toString(),
          name: t.from_class?.name,
        },
        toClass: {
          classId: t.to_class?.public_id || t.to_class?.class_id?.toString(),
          name: t.to_class?.name,
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
