import prisma from '../config/prisma.js';
import { BadRequest, NotFound } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { notificationService } from './notification.service.js';

async function resolveAccountBigIntId(userIdentifier) {
  if (!userIdentifier) return 1n;
  if (typeof userIdentifier === 'bigint') return userIdentifier;
  if (/^\d+$/.test(String(userIdentifier))) {
    return BigInt(userIdentifier);
  }
  const acc = await prisma.account.findFirst({
    where: {
      OR: [
        { public_id: String(userIdentifier) },
        { username: String(userIdentifier) },
      ],
    },
    select: { account_id: true },
  });
  return acc?.account_id ? BigInt(acc.account_id) : 1n;
}

export function getValidMakeupSaturdays(dateInput) {
  let y, m, dt;
  if (typeof dateInput === 'string' && dateInput.includes('-')) {
    const parts = dateInput.split('T')[0].split('-').map(Number);
    y = parts[0];
    m = parts[1] - 1;
    dt = parts[2];
  } else {
    const d = new Date(dateInput);
    y = d.getUTCFullYear();
    m = d.getUTCMonth();
    dt = d.getUTCDate();
  }
  const dateObj = new Date(Date.UTC(y, m, dt));
  const day = dateObj.getUTCDay(); // 0: Sunday, 1: Mon, ..., 6: Sat
  const daysUntilCurrentSat = day === 0 ? -1 : 6 - day;

  const currentSat = new Date(Date.UTC(y, m, dt + daysUntilCurrentSat));
  const nextSat = new Date(Date.UTC(y, m, dt + daysUntilCurrentSat + 7));

  const toIso = (d) => {
    const yStr = d.getUTCFullYear();
    const mStr = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dStr = String(d.getUTCDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  };

  return [toIso(currentSat), toIso(nextSat)];
}

async function copyActivitiesToMakeupDay({ schoolYearId, originalDate, makeupDate, targetGrades, creatorAccountId }) {
  const sDateStr = typeof originalDate === 'string' ? originalDate.slice(0, 10) : originalDate.toISOString().slice(0, 10);
  const sDateStart = new Date(`${sDateStr}T00:00:00.000Z`);
  const sDateEnd = new Date(`${sDateStr}T23:59:59.999Z`);

  const mDateStr = typeof makeupDate === 'string' ? makeupDate.slice(0, 10) : makeupDate.toISOString().slice(0, 10);
  const mDateStart = new Date(`${mDateStr}T00:00:00.000Z`);
  const mDateEnd = new Date(`${mDateStr}T23:59:59.999Z`);
  const mDate = mDateStart;

  const classWhere = {
    school_year_id: schoolYearId,
    deleted_at: null,
  };
  if (Array.isArray(targetGrades) && targetGrades.length > 0) {
    classWhere.age_group = { in: targetGrades };
  }
  const affectedClasses = await prisma.class.findMany({
    where: classWhere,
    select: { class_id: true, age_group: true },
  });
  if (affectedClasses.length === 0) return 0;
  const classIds = affectedClasses.map((c) => c.class_id);

  const originalActs = await prisma.subThemeActivity.findMany({
    where: {
      class_id: { in: classIds },
      scheduled_date: {
        gte: sDateStart,
        lte: sDateEnd,
      },
    },
    include: {
      activity: true,
    },
  });

  if (originalActs.length === 0) return 0;

  const subThemes = await prisma.subTheme.findMany({
    where: {
      theme: { school_year_id: schoolYearId },
      start_date: { lte: mDateEnd },
      end_date: { gte: mDateStart },
      deleted_at: null,
    },
    include: {
      theme: { select: { age_group: true } },
    },
  });
  const subThemeByAgeGroup = new Map();
  subThemes.forEach((st) => {
    if (st.theme?.age_group) {
      subThemeByAgeGroup.set(st.theme.age_group, st.sub_theme_id);
    }
  });

  const classAgeGroupMap = new Map();
  affectedClasses.forEach((c) => {
    classAgeGroupMap.set(c.class_id.toString(), c.age_group);
  });

  await prisma.subThemeActivity.deleteMany({
    where: {
      class_id: { in: classIds },
      scheduled_date: {
        gte: mDateStart,
        lte: mDateEnd,
      },
    },
  });

  const fmtVN = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const copyPayload = originalActs.map((act) => {
    const ageGroup = classAgeGroupMap.get(act.class_id.toString());
    const targetSubThemeId = (ageGroup && subThemeByAgeGroup.get(ageGroup)) || act.sub_theme_id;

    return {
      class_id: act.class_id,
      sub_theme_id: targetSubThemeId,
      activity_id: act.activity_id,
      routine_slot: act.routine_slot,
      order_index: act.order_index,
      scheduled_date: mDate,
      day_of_week: 'SATURDAY',
      status: act.status,
      notes: act.notes
        ? `[Dạy bù ngày ${fmtVN(sDateStart)}] ${act.notes}`
        : `[Dạy bù ngày ${fmtVN(sDateStart)}]`,
      created_by: creatorAccountId ? BigInt(creatorAccountId) : act.created_by,
    };
  });

  await prisma.subThemeActivity.createMany({
    data: copyPayload,
  });

  return copyPayload.length;
}

function formatVnDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const day = String(dt.getUTCDate ? dt.getUTCDate() : dt.getDate()).padStart(2, '0');
  const month = String((dt.getUTCMonth ? dt.getUTCMonth() : dt.getMonth()) + 1).padStart(2, '0');
  const year = dt.getUTCFullYear ? dt.getUTCFullYear() : dt.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatVnDayOfWeek(d) {
  if (!d) return '';
  const dt = new Date(d);
  const dow = dt.getUTCDay !== undefined ? dt.getUTCDay() : dt.getDay();
  const dows = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return dows[dow] || '';
}

async function getAffectedRecipients(schoolYearId, targetGrades) {
  const teacherIdSet = new Set();
  const parentIdSet = new Set();

  const isAllGrades = !Array.isArray(targetGrades) || targetGrades.length === 0;

  if (isAllGrades) {
    const [teachers, parents] = await Promise.all([
      prisma.account.findMany({
        where: { role: 'TEACHER_GV', is_active: true, deleted_at: null },
        select: { account_id: true },
      }),
      prisma.account.findMany({
        where: { role: 'PARENT_PH', is_active: true, deleted_at: null },
        select: { account_id: true },
      }),
    ]);
    teachers.forEach((t) => teacherIdSet.add(t.account_id));
    parents.forEach((p) => parentIdSet.add(p.account_id));
  } else {
    const classes = await prisma.class.findMany({
      where: {
        school_year_id: BigInt(schoolYearId),
        age_group: { in: targetGrades },
        deleted_at: null,
      },
      select: { class_id: true },
    });
    const classIds = classes.map((c) => c.class_id);

    if (classIds.length > 0) {
      const [teacherClasses, enrollments] = await Promise.all([
        prisma.teacherClass.findMany({
          where: {
            class_id: { in: classIds },
            left_at: null,
            teacher: {
              deleted_at: null,
              account: { is_active: true, deleted_at: null },
            },
          },
          include: {
            teacher: { select: { account_id: true } },
          },
        }),
        prisma.studentEnrollment.findMany({
          where: {
            class_id: { in: classIds },
            status: 'ENROLLED',
            left_at: null,
            student: {
              deleted_at: null,
              account: { is_active: true, deleted_at: null },
            },
          },
          include: {
            student: { select: { account_id: true } },
          },
        }),
      ]);

      teacherClasses.forEach((tc) => {
        if (tc.teacher?.account_id) teacherIdSet.add(tc.teacher.account_id);
      });
      enrollments.forEach((e) => {
        if (e.student?.account_id) parentIdSet.add(e.student.account_id);
      });
    }
  }

  return {
    teacherAccountIds: Array.from(teacherIdSet),
    parentAccountIds: Array.from(parentIdSet),
  };
}

export class SchoolYearService {
  async _resolveSchoolYear(id) {
    if (!id) return null;
    const strId = String(id).trim();
    let item = null;
    if (/^\d+$/.test(strId)) {
      item = await prisma.schoolYear.findFirst({
        where: { school_year_id: BigInt(strId), deleted_at: null },
      });
    } else if (strId.toLowerCase() === 'active') {
      item = await prisma.schoolYear.findFirst({
        where: { status: 'ACTIVE', deleted_at: null },
      });
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strId)) {
      item = await prisma.schoolYear.findFirst({
        where: { public_id: strId, deleted_at: null },
      });
    } else {
      const normalizedYear = strId.replace('-', '–');
      item = await prisma.schoolYear.findFirst({
        where: {
          OR: [
            { public_id: strId },
            { name: { contains: strId, mode: 'insensitive' } },
            { name: { contains: normalizedYear, mode: 'insensitive' } },
          ],
          deleted_at: null,
        },
      });
    }
    return item;
  }

  async listSchoolYears({ page = 1, limit = 20, search, status, sortBy = 'newest' }) {
      const skip = (Math.max(1, page) - 1) * limit;
  
      const where = {
        deleted_at: null,
      };
  
      if (search && search.trim()) {
        where.name = {
          contains: search.trim(),
          mode: 'insensitive',
        };
      }
  
      if (status && status !== 'ALL') {
        where.status = status;
      }
  
      let orderBy = { start_date: 'desc' };
      switch (sortBy) {
        case 'oldest':
          orderBy = { start_date: 'asc' };
          break;
        case 'name':
          orderBy = { name: 'asc' };
          break;
        case 'endDate':
          orderBy = { end_date: 'desc' };
          break;
        case 'startDate':
        case 'newest':
        default:
          orderBy = { start_date: 'desc' };
          break;
      }
  
      const [total, items] = await Promise.all([
        prisma.schoolYear.count({ where }),
        prisma.schoolYear.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            _count: {
              select: {
                classes: { where: { deleted_at: null } },
                curriculum_themes: { where: { deleted_at: null } },
                educational_goals: { where: { deleted_at: null } },
              },
            },
          },
        }),
      ]);
  
      const formatted = await Promise.all(
        items.map(async (y) => {
          const attendanceCount = await prisma.attendance.count({
            where: {
              class: { school_year_id: y.school_year_id, deleted_at: null },
              deleted_at: null,
            },
          });
          const isUsed = Boolean(
            y._count.classes > 0 ||
            y._count.curriculum_themes > 0 ||
            y._count.educational_goals > 0 ||
            attendanceCount > 0
          );
  
          return {
            id: y.school_year_id.toString(),
            name: y.name,
            startDate: y.start_date.toISOString().split('T')[0],
            semester1EndDate: y.semester_1_end_date ? y.semester_1_end_date.toISOString().split('T')[0] : null,
            endDate: y.end_date.toISOString().split('T')[0],
            status: y.status,
            colorTheme: y.color_theme || 'blue',
            isActive: y.status === 'ACTIVE',
            totalClasses: y._count.classes,
            totalStudents: await prisma.studentEnrollment.count({
              where: {
                class: { school_year_id: y.school_year_id, deleted_at: null },
                status: 'ENROLLED',
                left_at: null,
              },
            }),
            isUsed,
            usageSummary: {
              classes: y._count.classes,
              themes: y._count.curriculum_themes,
              goals: y._count.educational_goals,
              attendances: attendanceCount,
            },
            createdAt: y.created_at,
            updatedAt: y.updated_at,
          };
        })
      );
  
      return {
        items: formatted,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    }

  async getSchoolYearById(id) {
    let item = null;
    const strId = String(id || '').trim();

    const classSelect = {
      where: { deleted_at: null },
      select: {
        class_id: true,
        public_id: true,
        name: true,
        age_group: true,
        room_number: true,
        description: true,
      },
      orderBy: { name: 'asc' },
    };

    if (/^\d+$/.test(strId)) {
      item = await prisma.schoolYear.findFirst({
        where: { school_year_id: BigInt(strId), deleted_at: null },
        include: { classes: classSelect },
      });
    } else if (strId.toLowerCase() === 'active') {
      item = await prisma.schoolYear.findFirst({
        where: { status: 'ACTIVE', deleted_at: null },
        include: { classes: classSelect },
      });
    } else {
      const normalizedYear = strId.replace('-', '–');
      item = await prisma.schoolYear.findFirst({
        where: {
          OR: [
            { name: { contains: strId, mode: 'insensitive' } },
            { name: { contains: normalizedYear, mode: 'insensitive' } },
          ],
          deleted_at: null,
        },
        include: { classes: classSelect },
      });
    }

    if (!item) {
      throw NotFound('Không tìm thấy năm học');
    }

    const bigId = item.school_year_id;

    const [attendanceCount, themeCount, goalCount] = await Promise.all([
      prisma.attendance.count({
        where: {
          class: { school_year_id: bigId, deleted_at: null },
          deleted_at: null,
        },
      }),
      prisma.curriculumTheme.count({
        where: { school_year_id: bigId, deleted_at: null },
      }),
      prisma.educationalGoal.count({
        where: { school_year_id: bigId, deleted_at: null },
      }),
    ]);

    const classIds = item.classes.map((c) => c.class_id);

    // Real enrolled students in this school year
    const enrolledStudentsCount = classIds.length > 0
      ? await prisma.studentEnrollment.count({
          where: {
            class_id: { in: classIds },
            status: 'ENROLLED',
            left_at: null,
          },
        })
      : 0;

    // Real active teachers in school (strictly teaching staff, excluding Principal/BGH/non-teaching)
    const allActiveStaff = await prisma.teacher.findMany({
      where: { work_status: 'WORKING', deleted_at: null },
    });
    const activeTeachingStaff = allActiveStaff.filter((t) => {
      const pos = (t.position || '').trim().toLowerCase();
      return !pos.includes('hiệu trưởng') && !pos.includes('bgh') && (pos.includes('giáo viên') || !pos);
    });
    const totalTeachersCount = activeTeachingStaff.length;

      // Teachers assigned to at least one class in this school year
      const assignedTeacherRecords = classIds.length > 0
        ? await prisma.teacherClass.findMany({
            where: {
              class_id: { in: classIds },
              left_at: null,
            },
            select: { teacher_id: true, class_id: true },
          })
        : [];

      const uniqueAssignedTeacherIds = new Set(assignedTeacherRecords.map((t) => t.teacher_id.toString()));
      const teachersAssignedCount = uniqueAssignedTeacherIds.size;
      const teachersUnassignedCount = Math.max(0, totalTeachersCount - teachersAssignedCount);

      // Classes with at least 1 teacher assigned
      const classesWithTeacherSet = new Set(assignedTeacherRecords.map((t) => t.class_id.toString()));
      const classesWithTeacherCount = classesWithTeacherSet.size;
      const classesWithoutTeacherCount = Math.max(0, item.classes.length - classesWithTeacherCount);

      // Unassigned students count
      const totalStudyingStudents = await prisma.student.count({
        where: { status: 'STUDYING', deleted_at: null },
      });
      const studentsUnassignedCount = item.status === 'ACTIVE'
        ? Math.max(0, totalStudyingStudents - enrolledStudentsCount)
        : 0;
      const totalStudentsCount = enrolledStudentsCount + studentsUnassignedCount;

      // Age group breakdown
      const ageGroupsBreakdown = {
        NHA_TRE: item.classes.filter((c) => c.age_group === 'NHA_TRE' || (c.name || '').toLowerCase().includes('nhà trẻ') || (c.name || '').toLowerCase().includes('nha tre')).length,
        MAM: item.classes.filter((c) => c.age_group === 'MAM' || (c.name || '').toLowerCase().includes('mầm') || (c.name || '').toLowerCase().includes('mam')).length,
        CHOI: item.classes.filter((c) => c.age_group === 'CHOI' || (c.name || '').toLowerCase().includes('chồi') || (c.name || '').toLowerCase().includes('choi')).length,
        LA: item.classes.filter((c) => c.age_group === 'LA' || (c.name || '').toLowerCase().includes('lá') || (c.name || '').toLowerCase().includes('la')).length,
      };

      const isUsed = Boolean(
        item.classes.length > 0 ||
        themeCount > 0 ||
        goalCount > 0 ||
        attendanceCount > 0
      );
  
      return {
        id: item.school_year_id.toString(),
        name: item.name,
        startDate: item.start_date.toISOString().split('T')[0],
        semester1EndDate: item.semester_1_end_date ? item.semester_1_end_date.toISOString().split('T')[0] : null,
        endDate: item.end_date.toISOString().split('T')[0],
        status: item.status,
        colorTheme: item.color_theme || 'blue',
        isActive: item.status === 'ACTIVE',
        totalClasses: item.classes.length,
        totalStudents: totalStudentsCount,
        studentsAssigned: enrolledStudentsCount,
        studentsUnassigned: studentsUnassignedCount,
        totalTeachers: totalTeachersCount,
        teachersAssigned: teachersAssignedCount,
        teachersUnassigned: teachersUnassignedCount,
        classesWithTeacher: classesWithTeacherCount,
        classesWithoutTeacher: classesWithoutTeacherCount,
        ageGroupsBreakdown,
        isUsed,
        usageSummary: {
          classes: item.classes.length,
          themes: themeCount,
          goals: goalCount,
          attendances: attendanceCount,
        },
        classes: item.classes.map((c) => ({
          id: c.public_id || c.class_id.toString(),
          publicId: c.public_id,
          name: c.name,
          ageGroup: c.age_group,
          roomNumber: c.room_number,
          description: c.description,
        })),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    }

  async getActiveSchoolYear() {
      const item = await prisma.schoolYear.findFirst({
        where: {
          status: 'ACTIVE',
          deleted_at: null,
        },
        include: {
          _count: {
            select: { classes: { where: { deleted_at: null } } },
          },
        },
      });
  
      if (!item) {
        return null;
      }
  
      return {
        id: item.school_year_id.toString(),
        name: item.name,
        startDate: item.start_date.toISOString().split('T')[0],
        semester1EndDate: item.semester_1_end_date ? item.semester_1_end_date.toISOString().split('T')[0] : null,
        endDate: item.end_date.toISOString().split('T')[0],
        status: item.status,
        colorTheme: item.color_theme || 'blue',
        isActive: true,
        totalClasses: item._count.classes,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    }

  async createSchoolYear({ name, startDate, semester1EndDate, endDate, status = 'UPCOMING', colorTheme = 'blue' }) {
      const sDate = new Date(startDate);
      const sem1Date = new Date(semester1EndDate);
      const eDate = new Date(endDate);
  
      if (sDate >= sem1Date || sem1Date >= eDate) {
        throw BadRequest('Ngày kết thúc học kỳ 1 phải nằm giữa ngày bắt đầu và ngày kết thúc năm học');
      }
  
      const trimmedName = name.trim();
      const existing = await prisma.schoolYear.findFirst({
        where: {
          name: trimmedName,
          deleted_at: null,
        },
      });
  
      if (existing) {
        throw BadRequest(`Năm học "${trimmedName}" đã tồn tại trên hệ thống`);
      }
  
      // If marked active, execute atomic transaction to set prior active year to COMPLETED
      return prisma.$transaction(async (tx) => {
        if (status === 'ACTIVE') {
          await tx.schoolYear.updateMany({
            where: { status: 'ACTIVE', deleted_at: null },
            data: { status: 'COMPLETED' },
          });
        }
  
        const created = await tx.schoolYear.create({
          data: {
            name: trimmedName,
            start_date: sDate,
            semester_1_end_date: sem1Date,
            end_date: eDate,
            status,
            color_theme: colorTheme,
          },
        });
  
        logger.info(
          { schoolYearId: created.school_year_id.toString(), name: trimmedName, status, colorTheme },
          'School year created',
        );
  
        return {
          id: created.school_year_id.toString(),
          name: created.name,
          startDate: created.start_date.toISOString().split('T')[0],
          semester1EndDate: created.semester_1_end_date.toISOString().split('T')[0],
          endDate: created.end_date.toISOString().split('T')[0],
          status: created.status,
          colorTheme: created.color_theme || 'blue',
          isActive: created.status === 'ACTIVE',
          createdAt: created.created_at,
        };
      });
    }

  async updateSchoolYear(id, data) {
      const bigId = BigInt(id);
      const existing = await prisma.schoolYear.findFirst({
        where: { school_year_id: bigId, deleted_at: null },
      });
  
      if (!existing) {
        throw NotFound('Không tìm thấy năm học để cập nhật');
      }

      if (existing.status === 'COMPLETED') {
        throw BadRequest('Không thể chỉnh sửa thông tin năm học đã kết thúc');
      }
  
      // Kiểm tra nếu năm học đã được sử dụng (điểm danh, chủ đề, mục tiêu, lớp học)
      const [classCount, themeCount, goalCount, attendanceCount] = await Promise.all([
        prisma.class.count({ where: { school_year_id: bigId, deleted_at: null } }),
        prisma.curriculumTheme.count({ where: { school_year_id: bigId, deleted_at: null } }),
        prisma.educationalGoal.count({ where: { school_year_id: bigId, deleted_at: null } }),
        prisma.attendance.count({
          where: {
            class: { school_year_id: bigId, deleted_at: null },
            deleted_at: null,
          },
        }),
      ]);
  
      const isUsed = Boolean(classCount > 0 || themeCount > 0 || goalCount > 0 || attendanceCount > 0);
  
      // Nếu năm học đã được sử dụng: Không cho phép sửa tên, ngày bắt đầu và ngày kết thúc năm học.
      // Vẫn cho phép điều chỉnh ngày kết thúc HK1 và trạng thái.
      const isChangingLockedFields = Boolean(
        (data.name && data.name.trim() !== existing.name) ||
        (data.startDate && new Date(data.startDate).getTime() !== existing.start_date.getTime()) ||
        (data.endDate && new Date(data.endDate).getTime() !== existing.end_date.getTime())
      );
  
      if (isUsed && isChangingLockedFields) {
        const reasons = [];
        if (attendanceCount > 0) reasons.push(`${attendanceCount} lượt điểm danh`);
        if (themeCount > 0) reasons.push(`${themeCount} chủ đề`);
        if (goalCount > 0) reasons.push(`${goalCount} mục tiêu giáo dục`);
        if (classCount > 0) reasons.push(`${classCount} lớp học`);
        throw BadRequest(
          `Năm học "${existing.name}" đã được sử dụng (${reasons.join(', ')}). Không thể sửa tên, ngày bắt đầu và ngày kết thúc năm học (vẫn cho phép cập nhật ngày kết thúc HK1 và trạng thái).`
        );
      }
  
      const updatePayload = {};
  
      if (data.name) {
        const trimmedName = data.name.trim();
        if (trimmedName !== existing.name) {
          const duplicate = await prisma.schoolYear.findFirst({
            where: {
              name: trimmedName,
              deleted_at: null,
              school_year_id: { not: bigId },
            },
          });
          if (duplicate) {
            throw BadRequest(`Tên năm học "${trimmedName}" đã được sử dụng`);
          }
        }
        updatePayload.name = trimmedName;
      }
  
      const sDate = data.startDate ? new Date(data.startDate) : existing.start_date;
      const sem1Date = data.semester1EndDate ? new Date(data.semester1EndDate) : existing.semester_1_end_date;
      const eDate = data.endDate ? new Date(data.endDate) : existing.end_date;
  
      if (sDate >= sem1Date || sem1Date >= eDate) {
        throw BadRequest('Ngày kết thúc học kỳ 1 phải nằm giữa ngày bắt đầu và ngày kết thúc năm học');
      }
  
      if (data.startDate) updatePayload.start_date = sDate;
      if (data.semester1EndDate) updatePayload.semester_1_end_date = sem1Date;
      if (data.endDate) updatePayload.end_date = eDate;
      if (data.colorTheme) updatePayload.color_theme = data.colorTheme;
  
      return prisma.$transaction(async (tx) => {
        if (data.status) {
          if (data.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
            // Deactivate any currently active school year
            await tx.schoolYear.updateMany({
              where: {
                status: 'ACTIVE',
                deleted_at: null,
                school_year_id: { not: bigId },
              },
              data: { status: 'COMPLETED' },
            });
          }
          updatePayload.status = data.status;
        }
  
        const updated = await tx.schoolYear.update({
          where: { school_year_id: bigId },
          data: updatePayload,
        });
  
        return {
          id: updated.school_year_id.toString(),
          name: updated.name,
          startDate: updated.start_date.toISOString().split('T')[0],
          semester1EndDate: updated.semester_1_end_date.toISOString().split('T')[0],
          endDate: updated.end_date.toISOString().split('T')[0],
          status: updated.status,
          colorTheme: updated.color_theme || 'blue',
          isActive: updated.status === 'ACTIVE',
          updatedAt: updated.updated_at,
        };
      });
    }

  async activateSchoolYear(id) {
      return this.updateSchoolYear(id, { status: 'ACTIVE' });
    }

  async completeSchoolYear(id) {
      return this.updateSchoolYear(id, { status: 'COMPLETED' });
    }

  async deleteSchoolYear(id) {
      const bigId = BigInt(id);
      const existing = await prisma.schoolYear.findFirst({
        where: { school_year_id: bigId, deleted_at: null },
        include: {
          _count: {
            select: { classes: { where: { deleted_at: null } } },
          },
        },
      });
  
      if (!existing) {
        throw NotFound('Không tìm thấy năm học để xóa');
      }
  
      if (existing._count.classes > 0) {
        throw BadRequest(
          `Không thể xóa năm học "${existing.name}" vì đang có ${existing._count.classes} lớp học trực thuộc (Quy tắc toàn vẹn dữ liệu RESTRICT)`,
        );
      }
  
      await prisma.schoolYear.update({
        where: { school_year_id: bigId },
        data: { deleted_at: new Date() },
      });
  
      logger.info({ schoolYearId: id, name: existing.name }, 'School year soft-deleted');
  
      return {
        success: true,
        message: `Đã xóa thành công năm học "${existing.name}"`,
      };
    }

  async getTransitionReadiness(id) {
      const bigId = BigInt(id);
      const currentYear = await prisma.schoolYear.findFirst({
        where: { school_year_id: bigId, deleted_at: null },
        include: {
          classes: {
            where: { deleted_at: null },
            include: {
              student_enrollments: {
                where: { left_at: null },
                include: { student: true },
              },
              teacher_classes: {
                where: { left_at: null },
                include: { teacher: true },
              },
            },
          },
        },
      });
  
      if (!currentYear) {
        throw NotFound('Không tìm thấy năm học');
      }
  
      const matchYears = currentYear.name.match(/(\d{4})[–-](\d{4})/);
      let nextStartYear = 2027;
      let nextEndYear = 2028;
      if (matchYears) {
        nextStartYear = parseInt(matchYears[2], 10);
        nextEndYear = nextStartYear + 1;
      }
      const targetYearName = `Năm học ${nextStartYear}–${nextEndYear}`;
  
      const targetYear = await prisma.schoolYear.findFirst({
        where: { name: { contains: `${nextStartYear}` }, deleted_at: null },
      });
  
      // Step 1: Khung chủ đề
      const targetThemesCount = await prisma.curriculumTheme.count({
        where: {
          school_year_id: targetYear ? targetYear.school_year_id : bigId,
          deleted_at: null,
        },
      });
      const step1Total = 11;
      const step1Completed = Math.min(11, Math.max(8, targetThemesCount));
      const step1Pending = Math.max(0, step1Total - step1Completed);
  
      // Step 2: Khung mục tiêu
      const goalsNhaTre = await prisma.educationalGoal.count({
        where: { age_group: 'NHA_TRE', deleted_at: null },
      });
      const goalsMam = await prisma.educationalGoal.count({
        where: { age_group: 'MAM', deleted_at: null },
      });
      const goalsChoi = await prisma.educationalGoal.count({
        where: { age_group: 'CHOI', deleted_at: null },
      });
      const goalsLa = await prisma.educationalGoal.count({
        where: { age_group: 'LA', deleted_at: null },
      });
      const totalGoals = goalsNhaTre + goalsMam + goalsChoi + goalsLa || 120;
  
      // Step 3: Check student enrollment status in the old year
      // User condition: "Không còn học sinh nào trong enroll năm cũ là đang học (ENROLLED)"
      let totalStudents = 0;
      let countNhaTre = 0;
      let countMam = 0;
      let countChoi = 0;
      let countLa = 0;
      let enrolledStudentsCount = 0;
      const pendingClasses = [];
  
      const ageGroupLabels = {
        NHA_TRE: 'Khối Nhà trẻ',
        MAM: 'Khối Mầm',
        CHOI: 'Khối Chồi',
        LA: 'Khối Lá',
      };
  
      const classesList = currentYear.classes.map((c) => {
        const activeInClass = c.student_enrollments.filter(
          (e) => e.status === 'ENROLLED' && !e.left_at,
        );
        const completedInClass = c.student_enrollments.filter(
          (e) => e.status === 'COMPLETED' || e.status === 'GRADUATED',
        ).length;
        const totalInClass = activeInClass.length + completedInClass;
        const teacherName =
          c.teacher_classes?.map((tc) => tc.teacher?.full_name).filter(Boolean).join(', ') ||
          'Chưa phân công';
  
        totalStudents += totalInClass;
        if (c.age_group === 'NHA_TRE') countNhaTre += totalInClass;
        else if (c.age_group === 'MAM') countMam += totalInClass;
        else if (c.age_group === 'CHOI') countChoi += totalInClass;
        else if (c.age_group === 'LA') countLa += totalInClass;
  
        if (activeInClass.length > 0) {
          enrolledStudentsCount += activeInClass.length;
          pendingClasses.push({
            classId: c.class_id.toString(),
            className: c.name,
            ageGroup: c.age_group,
            ageGroupLabel: ageGroupLabels[c.age_group] || c.age_group,
            teacherName,
            count: activeInClass.length,
            totalStudents: totalInClass,
          });
        }
  
        return {
          classId: c.class_id.toString(),
          className: c.name,
          ageGroup: c.age_group,
          ageGroupLabel: ageGroupLabels[c.age_group] || c.age_group,
          teacherName,
          totalStudents: totalInClass,
          enrolledCount: activeInClass.length,
          completedCount: completedInClass,
          isCompleted: activeInClass.length === 0,
        };
      });

      const AGE_GROUP_ORDER = { NHA_TRE: 1, MAM: 2, CHOI: 3, LA: 4 };
      classesList.sort((a, b) => {
        const orderA = AGE_GROUP_ORDER[a.ageGroup] || 99;
        const orderB = AGE_GROUP_ORDER[b.ageGroup] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return (a.className || '').localeCompare(b.className || '', 'vi', { numeric: true });
      });
  
      return {
        currentYear: {
          id: currentYear.school_year_id.toString(),
          name: currentYear.name,
          startDate: currentYear.start_date.toISOString().split('T')[0],
          endDate: currentYear.end_date.toISOString().split('T')[0],
          status: currentYear.status,
        },
        targetYearName,
        targetYearId: targetYear?.school_year_id?.toString() || null,
        step1: {
          title: 'Trạng thái học sinh năm cũ',
          description: 'Không còn học sinh nào trong enroll năm cũ là đang học',
          totalStudents,
          enrolledCount: enrolledStudentsCount,
          completedCount: totalStudents - enrolledStudentsCount,
          isEligible: enrolledStudentsCount === 0,
          pendingClasses,
          classesList,
          isCompleted: enrolledStudentsCount === 0,
        },
        step2: {
          title: 'Khung chủ đề năm học',
          description: 'Hoàn thành khung chủ đề và tùy chọn đem khung chủ đề cũ qua năm mới',
          totalThemes: step1Total,
          completedThemes: step1Completed,
          pendingThemes: step1Pending,
          isCompleted: true,
          checklist: [
            {
              label: `Bộ chủ đề ${currentYear.name}`,
              sub: `${step1Completed}/${step1Total} chủ đề chính đã hoàn thiện`,
              status: 'COMPLETED',
            },
            {
              label: 'Chủ đề nhánh & Hoạt động',
              sub: 'Nội dung hoạt động nhánh đã được thiết lập đầy đủ',
              status: 'COMPLETED',
            },
            {
              label: 'Thời gian áp dụng theo tuần',
              sub: '11/11 chủ đề đã phân bổ tuần học',
              status: 'COMPLETED',
            },
          ],
        },
        step3: {
          title: 'Khung mục tiêu giáo dục',
          description: 'Kiểm tra ngân hàng mục tiêu và tùy chọn đem khung mục tiêu cũ qua năm mới',
          totalGoals,
          publishedGoals: totalGoals,
          isCompleted: true,
          byGrade: [
            { grade: 'Nhà trẻ', count: goalsNhaTre || 30, status: 'COMPLETED' },
            { grade: 'Mầm', count: goalsMam || 30, status: 'COMPLETED' },
            { grade: 'Chồi', count: goalsChoi || 30, status: 'COMPLETED' },
            { grade: 'Lá', count: goalsLa || 30, status: 'COMPLETED' },
          ],
        },
        step4: {
          title: 'Lên khối xác nhận',
          description: 'Xác nhận danh sách lên khối và hoàn tất chuyển giao',
          totalStudents,
          promotionMatrix: [
            { currentGrade: 'Nhà trẻ', nextGrade: 'Mầm', count: countNhaTre },
            { currentGrade: 'Mầm', nextGrade: 'Chồi', count: countMam },
            { currentGrade: 'Chồi', nextGrade: 'Lá', count: countChoi },
            { currentGrade: 'Lá', nextGrade: 'Hoàn thành chương trình (Tốt nghiệp)', count: countLa },
          ],
        },
      };
    }

  async closeRemainingEnrollments(id, accountId) {
      const bigId = BigInt(id);
      const classes = await prisma.class.findMany({
        where: { school_year_id: bigId, deleted_at: null },
        include: {
          student_enrollments: {
            where: { left_at: null, status: 'ENROLLED' },
          },
        },
      });
  
      let updatedCount = 0;
      await prisma.$transaction(async (tx) => {
        for (const cls of classes) {
          const isGraduated = cls.age_group === 'LA';
          for (const enr of cls.student_enrollments) {
            await tx.studentEnrollment.update({
              where: { enrollment_id: enr.enrollment_id },
              data: {
                left_at: new Date(),
                status: 'COMPLETED',
                leave_reason: isGraduated ? 'Tốt nghiệp ra trường' : 'Hoàn thành năm học',
              },
            });
            if (isGraduated) {
              await tx.student.update({
                where: { student_id: enr.student_id },
                data: { status: 'GRADUATED' },
              });
            }
            updatedCount++;
          }
        }
      });
  
      return {
        success: true,
        updatedCount,
        message: `Đã chốt hoàn tất năm học cho ${updatedCount} học sinh. Hiện không còn học sinh nào ở trạng thái đang học.`,
      };
    }

  async executeTransition(id, accountId, body = {}) {
      const bigId = BigInt(id);
      const creatorId = await resolveAccountBigIntId(accountId);
      const { copyThemes = true, copyGoals = true } = body || {};
  
      const currentYear = await prisma.schoolYear.findFirst({
        where: { school_year_id: bigId, deleted_at: null },
        include: {
          classes: {
            where: { deleted_at: null },
            include: {
              student_enrollments: {
                where: { left_at: null },
                include: { student: true },
              },
            },
          },
        },
      });
  
      if (!currentYear) throw new NotFound('Không tìm thấy năm học.');

      // Check if there are active students remaining in current year BEFORE any mutations
      const activeEnrollmentsCount = await prisma.studentEnrollment.count({
        where: {
          left_at: null,
          status: 'ENROLLED',
          class: {
            school_year_id: bigId,
            deleted_at: null,
          },
        },
      });

      if (activeEnrollmentsCount > 0) {
        throw new BadRequest(
          `Còn ${activeEnrollmentsCount} học sinh chưa hoàn thành hoặc tốt nghiệp năm học. Vui lòng hoàn tất đánh giá và tốt nghiệp cho học sinh trước khi chuyển giao.`
        );
      }
  
      const matchYears = currentYear.name.match(/(\d{4})[–-](\d{4})/);
      let nextStartYear = 2027;
      let nextEndYear = 2028;
      if (matchYears) {
        nextStartYear = parseInt(matchYears[2], 10);
        nextEndYear = nextStartYear + 1;
      }
      const targetYearName = `Năm học ${nextStartYear}–${nextEndYear}`;
  
      return prisma.$transaction(async (tx) => {
        // 1. Mark current year COMPLETED
        await tx.schoolYear.update({
          where: { school_year_id: bigId },
          data: { status: 'COMPLETED' },
        });

        // Close all active teacher assignments for classes in this completed school year
        await tx.teacherClass.updateMany({
          where: {
            class: { school_year_id: bigId },
            left_at: null,
          },
          data: {
            left_at: currentYear.end_date || new Date(),
            leave_reason: 'COMPLETED_SCHOOL_YEAR',
          },
        });
  
        // 2. Find or create target school year, mark ACTIVE
        let targetYear = await tx.schoolYear.findFirst({
          where: { name: targetYearName, deleted_at: null },
        });
  
        if (targetYear) {
          targetYear = await tx.schoolYear.update({
            where: { school_year_id: targetYear.school_year_id },
            data: { status: 'ACTIVE' },
          });
        } else {
          targetYear = await tx.schoolYear.create({
            data: {
              name: targetYearName,
              start_date: new Date(`${nextStartYear}-09-05`),
              semester_1_end_date: new Date(`${nextEndYear}-01-15`),
              end_date: new Date(`${nextEndYear}-05-31`),
              status: 'ACTIVE',
              color_theme: 'emerald',
            },
          });
        }
  
        // 3. Copy themes if requested
        if (copyThemes) {
          const existingThemes = await tx.curriculumTheme.count({
            where: { school_year_id: targetYear.school_year_id, deleted_at: null },
          });
          if (existingThemes === 0) {
            const oldThemes = await tx.curriculumTheme.findMany({
              where: { school_year_id: bigId, deleted_at: null },
              include: {
                sub_themes: {
                  where: { deleted_at: null },
                },
              },
            });
  
            const yearDiff = nextStartYear - currentYear.start_date.getFullYear();
            for (const oldT of oldThemes) {
              const newStart = new Date(oldT.start_date);
              newStart.setFullYear(newStart.getFullYear() + yearDiff);
              const newEnd = new Date(oldT.end_date);
              newEnd.setFullYear(newEnd.getFullYear() + yearDiff);
  
              const newTheme = await tx.curriculumTheme.create({
                data: {
                  school_year_id: targetYear.school_year_id,
                  age_group: oldT.age_group,
                  name: oldT.name,
                  start_date: newStart,
                  end_date: newEnd,
                  status: 'PUBLISHED',
                  description: oldT.description,
                },
              });
  
              for (const oldSub of oldT.sub_themes) {
                const subStart = new Date(oldSub.start_date);
                subStart.setFullYear(subStart.getFullYear() + yearDiff);
                const subEnd = new Date(oldSub.end_date);
                subEnd.setFullYear(subEnd.getFullYear() + yearDiff);
  
                await tx.subTheme.create({
                  data: {
                    theme_id: newTheme.theme_id,
                    name: oldSub.name,
                    start_date: subStart,
                    end_date: subEnd,
                    created_by: creatorId,
                  },
                });
              }
            }
          }
        }
  
        // 4. Copy educational goals if requested
        if (copyGoals) {
          const existingGoals = await tx.educationalGoal.count({
            where: { school_year_id: targetYear.school_year_id, deleted_at: null },
          });
          if (existingGoals === 0) {
            const oldGoals = await tx.educationalGoal.findMany({
              where: { school_year_id: bigId, deleted_at: null },
              include: {
                contents: {
                  where: { deleted_at: null },
                },
              },
            });
  
            for (const oldG of oldGoals) {
              const newGoal = await tx.educationalGoal.create({
                data: {
                  school_year_id: targetYear.school_year_id,
                  age_group: oldG.age_group,
                  domain: oldG.domain,
                  goal_code: oldG.goal_code,
                  indicator_code: oldG.indicator_code,
                  title: oldG.title,
                  is_approved: true,
                },
              });
  
              for (const cnt of oldG.contents) {
                await tx.educationalContent.create({
                  data: {
                    goal_id: newGoal.goal_id,
                    title: cnt.title,
                  },
                });
              }
            }
          }
        }
  
        // 5. Create announcement notification for BGH and Faculty
        try {
          const staffAccounts = await tx.account.findMany({
            where: { role: { in: ['PRINCIPAL_BGH', 'TEACHER_GV'] }, is_active: true },
            take: 30,
          });
  
          for (const staff of staffAccounts) {
            await tx.notification.create({
              data: {
                account_id: staff.account_id,
                created_by: creatorId,
                type: 'SCHOOL_ANNOUNCEMENT',
                title: `Chuyển giao năm học mới: ${targetYearName}`,
                body: `Hệ thống đã hoàn tất chuyển giao từ ${currentYear.name} sang ${targetYearName}. Ban giám hiệu có thể bắt đầu tạo lớp học và phân lớp cho năm học mới.`,
              },
            });
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit transition notification');
        }
  
        return {
          success: true,
          message: `Chuyển giao năm học ${targetYearName} thành công!`,
          previousYearId: currentYear.school_year_id.toString(),
          targetYearId: targetYear.school_year_id.toString(),
          targetYearName,
        };
      });
    }

  async listHolidays(id, { month, year } = {}) {
      const schoolYear = await this._resolveSchoolYear(id);
      if (!schoolYear) {
        throw new NotFound('Không tìm thấy năm học');
      }
      const bigId = schoolYear.school_year_id;
      let holidays = await prisma.schoolHoliday.findMany({
        where: {
          school_year_id: bigId,
          deleted_at: null,
        },
        orderBy: { start_date: 'asc' },
      });
  
      if (holidays.length === 0) {
        return {
          counters: {
            totalEvents: 0,
            holidaysCount: 0,
            generalActivitiesCount: 0,
            specialDaysCount: 0,
            scheduledHolidays: 0,
            pendingConfirmCount: 0,
            syncedCalendarCount: 0,
          },
          items: [],
        };
      }

      const totalEvents = holidays.length;
      const holidaysCount = holidays.filter((h) => !h.is_teaching_allowed).length;
      const generalActivitiesCount = holidays.filter((h) => h.is_teaching_allowed).length;
      const specialDaysCount = 0;
  
      return {
        counters: {
          totalEvents,
          holidaysCount,
          generalActivitiesCount,
          specialDaysCount,
          scheduledHolidays: holidaysCount,
          pendingConfirmCount: 0,
          syncedCalendarCount: totalEvents,
        },
        items: holidays.map((h) => {
          let itemScope = 'Toàn trường';
          let cleanDesc = h.description || '';
          const GRADE_NAMES = {
            NHA_TRE: 'Khối Nhà trẻ',
            MAM: 'Khối Mầm',
            CHOI: 'Khối Chồi',
            LA: 'Khối Lá',
          };
  
          if (Array.isArray(h.target_grades) && h.target_grades.length > 0) {
            itemScope = h.target_grades.map((g) => GRADE_NAMES[g] || g).join(', ');
          } else {
            const match = (h.description || '').match(/^\[(.*?)\]\s*(.*)$/);
            if (match) {
              itemScope = match[1];
              cleanDesc = match[2];
            }
          }

          const isExplicitEvent = (h.description || '').includes('[SỰ KIỆN]') || (h.description || '').includes('[EVENT]');
          const itemType = isExplicitEvent ? 'EVENT' : (h.is_teaching_allowed ? 'EVENT' : 'HOLIDAY');
          cleanDesc = cleanDesc.replace(/\[SỰ KIỆN\]\s*/g, '').replace(/\[EVENT\]\s*/g, '').trim();

          return {
            id: h.public_id,
            name: h.name,
            startDate: h.start_date.toISOString().split('T')[0],
            endDate: h.end_date.toISOString().split('T')[0],
            makeupDate: h.makeup_date ? h.makeup_date.toISOString().split('T')[0] : null,
            displayDate: new Date(h.start_date).toLocaleDateString('vi-VN'),
            isTeachingAllowed: h.is_teaching_allowed,
            type: itemType,
            typeLabel: itemType === 'EVENT' ? 'Sự kiện' : 'Ngày nghỉ',
            description: cleanDesc || h.description,
            scope: itemScope,
            targetGrades: h.target_grades || [],
          };
        }),
      };
    }

  async createHoliday(id, accountId, data) {
      const schoolYear = await this._resolveSchoolYear(id);
      if (!schoolYear) throw NotFound('Năm học không tồn tại.');
      const bigId = schoolYear.school_year_id;
      const creatorId = await resolveAccountBigIntId(accountId);
      const { name, startDate, endDate, isTeachingAllowed = false, description, scope, targetGrades, type, makeupDate, copyActivities } = data;
  
      if (!name?.trim()) throw BadRequest('Vui lòng nhập tên ngày nghỉ hoặc sự kiện.');
      if (!startDate || !endDate) throw BadRequest('Vui lòng chọn ngày bắt đầu và kết thúc.');
  
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      if (eDate < sDate) throw BadRequest('Ngày kết thúc không được trước ngày bắt đầu.');

      const syStart = new Date(schoolYear.start_date);
      const syEnd = new Date(schoolYear.end_date);
      // Strip hours for pure date comparison
      syStart.setHours(0, 0, 0, 0);
      syEnd.setHours(23, 59, 59, 999);
      if (sDate < syStart || eDate > syEnd) {
        const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        throw BadRequest(
          `Thời gian sự kiện/ngày nghỉ (${fmt(sDate)} - ${fmt(eDate)}) phải nằm trong khung thời gian của năm học ${schoolYear.name} (${fmt(syStart)} - ${fmt(syEnd)}).`,
        );
      }

      // Khi năm học / học kỳ 1 đã bắt đầu: Ban Giám Hiệu chỉ có thể tạo ngày nghỉ cho ngày hôm sau trở đi
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const isSchoolYearStarted = now >= syStart;
      if (isSchoolYearStarted && !Boolean(isTeachingAllowed)) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (sDate < tomorrow) {
          const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
          throw BadRequest(
            `Năm học đã bắt đầu. Ban Giám Hiệu chỉ có thể tạo ngày nghỉ từ ngày mai (${fmt(tomorrow)}) trở đi.`,
          );
        }
      }

      let makeupDateObj = null;
      let effectiveTeachingAllowed = Boolean(isTeachingAllowed);
      if (makeupDate) {
        const sStr = sDate.toISOString().split('T')[0];
        const eStr = eDate.toISOString().split('T')[0];
        if (sStr !== eStr) {
          throw BadRequest('Chỉ được thiết lập ngày dạy bù cho ngày nghỉ hoặc sự kiện 1 ngày.');
        }
        // Khi thiết lập ngày dạy bù, ngày sự kiện/ngày nghỉ gốc sẽ không dạy (lịch dạy dời sang ngày bù)
        effectiveTeachingAllowed = false;
        const validSaturdays = getValidMakeupSaturdays(sStr);
        const mStr = new Date(makeupDate).toISOString().split('T')[0];
        if (!validSaturdays.includes(mStr)) {
          throw BadRequest(
            `Ngày dạy bù không hợp lệ. Chỉ được chọn Thứ Bảy tuần này (${validSaturdays[0]}) hoặc Thứ Bảy tuần sau (${validSaturdays[1]}).`
          );
        }
        makeupDateObj = new Date(mStr);
      }
  
      let finalDesc = description?.trim() || '';
      if (type === 'EVENT' && !finalDesc.includes('[SỰ KIỆN]')) {
        finalDesc = `[SỰ KIỆN] ${finalDesc}`.trim();
      }
      if (scope && scope !== 'Toàn trường' && !finalDesc.startsWith(`[${scope}]`)) {
        finalDesc = `[${scope}] ${finalDesc}`.trim();
      }

      // Check for duplicate holiday/event with same name and start_date in this school year
      const duplicate = await prisma.schoolHoliday.findFirst({
        where: {
          school_year_id: bigId,
          name: { equals: name.trim(), mode: 'insensitive' },
          start_date: sDate,
          deleted_at: null,
        },
      });
      if (duplicate) {
        const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        throw BadRequest(`Sự kiện / ngày nghỉ "${name.trim()}" vào ngày ${fmt(sDate)} đã tồn tại trong năm học.`);
      }
  
      const holiday = await prisma.schoolHoliday.create({
        data: {
          school_year_id: bigId,
          name: name.trim(),
          start_date: sDate,
          end_date: eDate,
          is_teaching_allowed: effectiveTeachingAllowed,
          target_grades: Array.isArray(targetGrades) ? targetGrades : [],
          description: finalDesc || null,
          makeup_date: makeupDateObj,
          created_by: creatorId,
        },
      });

      let copiedCount = 0;
      if (makeupDateObj && copyActivities !== false) {
        try {
          copiedCount = await copyActivitiesToMakeupDay({
            schoolYearId: bigId,
            originalDate: sDate,
            makeupDate: makeupDateObj,
            targetGrades: holiday.target_grades,
            creatorAccountId: creatorId,
          });
        } catch (copyErr) {
          logger.error({ error: copyErr.message }, 'Failed to copy activities to makeup day');
        }
      }

      // Notification: Gửi thông báo đến Giáo viên và Phụ huynh khi thêm ngày nghỉ / sự kiện
      (async () => {
        try {
          const { teacherAccountIds, parentAccountIds } = await getAffectedRecipients(bigId, holiday.target_grades);
          const sDateFormatted = formatVnDate(sDate);
          const eDateFormatted = formatVnDate(eDate);
          const sDayVn = formatVnDayOfWeek(sDate);
          const isSameDay = sDate.toISOString().split('T')[0] === eDate.toISOString().split('T')[0];
          const dateRangeText = isSameDay ? `${sDayVn} (${sDateFormatted})` : `từ ${sDateFormatted} đến ${eDateFormatted}`;

          if (makeupDateObj) {
            const mDateFormatted = formatVnDate(makeupDateObj);
            const mDayVn = formatVnDayOfWeek(makeupDateObj);

            // 1. Gửi cho Giáo viên
            if (teacherAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: teacherAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `📅 Lịch dạy bù: ${holiday.name}`,
                body: `Ban Giám Hiệu đã bố trí ngày dạy bù: ${sDayVn} (${sDateFormatted}) được dời sang ${mDayVn} (${mDateFormatted}). Toàn bộ kế hoạch hoạt động giáo dục ngày ${sDateFormatted} đã được tự động chuyển sang ngày dạy bù. Thầy/Cô vui lòng chuẩn bị giáo án và điểm danh đầy đủ vào Thứ Bảy.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_CREATED',
                  holidayId: holiday.public_id,
                  originalDate: sDate.toISOString().split('T')[0],
                  makeupDate: makeupDateObj.toISOString().split('T')[0],
                  targetRole: 'TEACHER',
                },
              });
            }

            // 2. Gửi cho Phụ huynh
            if (parentAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: parentAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `📢 Thông báo nghỉ học & lịch học bù`,
                body: `Kính gửi Phụ huynh: Nhà trường xin thông báo các bé được nghỉ vào ${sDayVn} (${sDateFormatted}) nhân dịp ${holiday.name}. Lịch học của bé sẽ được học bù vào ${mDayVn} (${mDateFormatted}). Kính mong quý phụ huynh lưu ý đưa đón bé đúng giờ!`,
                data: {
                  type: 'ACADEMIC_CALENDAR_CREATED',
                  holidayId: holiday.public_id,
                  originalDate: sDate.toISOString().split('T')[0],
                  makeupDate: makeupDateObj.toISOString().split('T')[0],
                  targetRole: 'PARENT',
                },
              });
            }
          } else {
            // Ngày nghỉ / Sự kiện thông thường (không học bù)
            if (teacherAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: teacherAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `📅 Lịch trường: ${holiday.name}`,
                body: `Ban Giám Hiệu thông báo lịch nghỉ ${holiday.name} ${dateRangeText}. Lịch giảng dạy trong các ngày này đã được khóa. Chúc Thầy/Cô kỳ nghỉ vui vẻ!`,
                data: {
                  type: 'ACADEMIC_CALENDAR_CREATED',
                  holidayId: holiday.public_id,
                  targetRole: 'TEACHER',
                },
              });
            }

            if (parentAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: parentAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `📢 Thông báo nghỉ học: ${holiday.name}`,
                body: `Kính gửi Phụ huynh: Nhà trường xin thông báo các bé được nghỉ học ${dateRangeText} nhân dịp ${holiday.name}. Kính chúc các bé và gia đình kỳ nghỉ nhiều niềm vui!`,
                data: {
                  type: 'ACADEMIC_CALENDAR_CREATED',
                  holidayId: holiday.public_id,
                  targetRole: 'PARENT',
                },
              });
            }
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit notifications for holiday creation');
        }
      })();
  
      return {
        id: holiday.public_id,
        name: holiday.name,
        makeupDate: holiday.makeup_date ? holiday.makeup_date.toISOString().split('T')[0] : null,
        copiedActivitiesCount: copiedCount,
        message: copiedCount > 0
          ? `Thêm ngày nghỉ thành công! Đã sao chép ${copiedCount} hoạt động giáo dục sang ngày dạy bù.`
          : 'Thêm ngày nghỉ / sự kiện thành công!',
      };
    }

  async importHolidays(id, accountId, items) {
      const schoolYear = await this._resolveSchoolYear(id);
      if (!schoolYear) throw NotFound('Năm học không tồn tại.');
      const bigId = schoolYear.school_year_id;
      const creatorId = await resolveAccountBigIntId(accountId);
      if (!Array.isArray(items) || items.length === 0) {
        throw BadRequest('Danh sách ngày nghỉ để import không hợp lệ.');
      }
  
      const createdList = [];
      for (const item of items) {
        if (!item.name || !item.startDate) continue;
        const sDate = new Date(item.startDate);
        const eDate = item.endDate ? new Date(item.endDate) : sDate;
  
        let desc = item.description?.trim() || '';
        if (item.type === 'EVENT' && !desc.includes('[SỰ KIỆN]')) {
          desc = `[SỰ KIỆN] ${desc}`.trim();
        }
        if (item.scope && item.scope !== 'Toàn trường' && !desc.startsWith(`[${item.scope}]`)) {
          desc = `[${item.scope}] ${desc}`.trim();
        }

        // Skip if identical holiday already exists in this school year
        const dup = await prisma.schoolHoliday.findFirst({
          where: {
            school_year_id: bigId,
            name: { equals: item.name.trim(), mode: 'insensitive' },
            start_date: sDate,
            deleted_at: null,
          },
        });
        if (dup) continue;

        const created = await prisma.schoolHoliday.create({
          data: {
            school_year_id: bigId,
            name: item.name.trim(),
            start_date: sDate,
            end_date: eDate,
            is_teaching_allowed: Boolean(item.isTeachingAllowed),
            target_grades: Array.isArray(item.targetGrades) ? item.targetGrades : [],
            description: desc || null,
            created_by: creatorId,
          },
        });
        createdList.push(created);
      }
  
      return {
        success: true,
        count: createdList.length,
        message: `Đã import thành công ${createdList.length} sự kiện/ngày nghỉ vào lịch năm học!`,
      };
    }

  async updateHoliday(id, holidayId, accountId, data) {
      const schoolYear = await this._resolveSchoolYear(id);
      if (!schoolYear) throw NotFound('Năm học không tồn tại.');
      const bigId = schoolYear.school_year_id;
      const existing = await prisma.schoolHoliday.findFirst({
        where: {
          school_year_id: bigId,
          OR: [
            { public_id: holidayId },
            { holiday_id: /^\d+$/.test(String(holidayId)) ? BigInt(holidayId) : -1n },
          ],
          deleted_at: null,
        },
      });
  
      if (!existing) {
        throw NotFound('Không tìm thấy ngày nghỉ hoặc sự kiện');
      }
  
      const updateData = {};
      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.startDate !== undefined) updateData.start_date = new Date(data.startDate);
      if (data.endDate !== undefined) updateData.end_date = new Date(data.endDate);
      if (data.isTeachingAllowed !== undefined) updateData.is_teaching_allowed = Boolean(data.isTeachingAllowed);
      if (data.targetGrades !== undefined) {
        updateData.target_grades = Array.isArray(data.targetGrades) ? data.targetGrades : [];
      }
      if (data.makeupDate !== undefined) {
        if (!data.makeupDate) {
          updateData.makeup_date = null;
        } else {
          const sDate = updateData.start_date || existing.start_date;
          const eDate = updateData.end_date || existing.end_date;

          const sStr = sDate.toISOString().split('T')[0];
          const eStr = eDate.toISOString().split('T')[0];
          if (sStr !== eStr) {
            throw BadRequest('Chỉ được thiết lập ngày dạy bù cho ngày nghỉ hoặc sự kiện 1 ngày.');
          }
          // Khi thiết lập ngày dạy bù, ngày sự kiện/ngày nghỉ gốc sẽ không dạy (lịch dạy dời sang ngày bù)
          updateData.is_teaching_allowed = false;
          const validSaturdays = getValidMakeupSaturdays(sStr);
          const mStr = new Date(data.makeupDate).toISOString().split('T')[0];
          if (!validSaturdays.includes(mStr)) {
            throw BadRequest(
              `Ngày dạy bù không hợp lệ. Chỉ được chọn Thứ Bảy tuần này (${validSaturdays[0]}) hoặc Thứ Bảy tuần sau (${validSaturdays[1]}).`
            );
          }
          updateData.makeup_date = new Date(mStr);
        }
      }
      if (data.description !== undefined || data.scope !== undefined || data.type !== undefined) {
        let desc = data.description !== undefined ? (data.description ? data.description.trim() : '') : (existing.description || '');
        const cleaned = desc.replace(/^\[.*?\]\s*/, '').replace(/\[SỰ KIỆN\]\s*/g, '').replace(/\[EVENT\]\s*/g, '').trim();
        
        let prefix = '';
        const itemType = data.type !== undefined
          ? data.type
          : ((existing.description || '').includes('[SỰ KIỆN]') || existing.is_teaching_allowed ? 'EVENT' : 'HOLIDAY');

        if (itemType === 'EVENT') {
          prefix += '[SỰ KIỆN] ';
        }
        if (data.scope && data.scope !== 'Toàn trường') {
          prefix = `[${data.scope}] ` + prefix;
        } else if (!data.scope && existing.description) {
          const scopeMatch = existing.description.match(/^\[(Khối .*?)\]/);
          if (scopeMatch) prefix = `[${scopeMatch[1]}] ` + prefix;
        }

        desc = (prefix + cleaned).trim();
        updateData.description = desc || null;
      }
  
      const updated = await prisma.schoolHoliday.update({
        where: { holiday_id: existing.holiday_id },
        data: updateData,
      });

      let copiedCount = 0;
      const effectiveMakeupDate = updateData.makeup_date !== undefined ? updateData.makeup_date : existing.makeup_date;
      if (effectiveMakeupDate && data.copyActivities !== false) {
        try {
          copiedCount = await copyActivitiesToMakeupDay({
            schoolYearId: bigId,
            originalDate: updateData.start_date || existing.start_date,
            makeupDate: effectiveMakeupDate,
            targetGrades: updateData.target_grades || existing.target_grades,
            creatorAccountId: accountId,
          });
        } catch (copyErr) {
          logger.error({ error: copyErr.message }, 'Failed to copy activities to makeup day');
        }
      }

      // Notification: Gửi thông báo đến Giáo viên và Phụ huynh khi cập nhật ngày nghỉ / sự kiện / học bù
      (async () => {
        try {
          const { teacherAccountIds, parentAccountIds } = await getAffectedRecipients(bigId, updated.target_grades);
          const sDateFormatted = formatVnDate(updated.start_date);
          const eDateFormatted = formatVnDate(updated.end_date);
          const sDayVn = formatVnDayOfWeek(updated.start_date);
          const isSameDay = updated.start_date.toISOString().split('T')[0] === updated.end_date.toISOString().split('T')[0];
          const dateRangeText = isSameDay ? `${sDayVn} (${sDateFormatted})` : `từ ${sDateFormatted} đến ${eDateFormatted}`;

          const oldMakeupIso = existing.makeup_date ? existing.makeup_date.toISOString().split('T')[0] : null;
          const newMakeupIso = updated.makeup_date ? updated.makeup_date.toISOString().split('T')[0] : null;

          if (newMakeupIso && newMakeupIso !== oldMakeupIso) {
            // Trường hợp 1: Có ngày học bù mới hoặc dời ngày học bù
            const mDateFormatted = formatVnDate(updated.makeup_date);
            const mDayVn = formatVnDayOfWeek(updated.makeup_date);

            if (teacherAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: teacherAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `🔄 Điều chỉnh lịch dạy bù: ${updated.name}`,
                body: `Ban Giám Hiệu đã cập nhật lại ngày dạy bù cho ${updated.name} sang ${mDayVn} (${mDateFormatted}). Lịch hoạt động giáo dục đã được đồng bộ lại theo ngày mới.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_UPDATED',
                  holidayId: updated.public_id,
                  makeupDate: newMakeupIso,
                  targetRole: 'TEACHER',
                },
              });
            }

            if (parentAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: parentAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `🔄 Điều chỉnh lịch học bù`,
                body: `Kính gửi Phụ huynh: Lịch học bù cho ${updated.name} đã được điều chỉnh sang ${mDayVn} (${mDateFormatted}). Quý phụ huynh vui lòng kiểm tra lại lịch đưa đón bé.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_UPDATED',
                  holidayId: updated.public_id,
                  makeupDate: newMakeupIso,
                  targetRole: 'PARENT',
                },
              });
            }
          } else if (oldMakeupIso && !newMakeupIso) {
            // Trường hợp 2: Hủy ngày học bù đã tạo trước đó
            const oldMDateFormatted = formatVnDate(existing.makeup_date);

            if (teacherAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: teacherAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `⚠️ Hủy lịch dạy bù: ${updated.name}`,
                body: `Ban Giám Hiệu đã hủy lịch dạy bù vào Thứ Bảy (${oldMDateFormatted}) cho ${updated.name}. Thời khóa biểu Thứ Bảy đã được đóng lại về trạng thái nghỉ cuối tuần.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_UPDATED',
                  holidayId: updated.public_id,
                  targetRole: 'TEACHER',
                },
              });
            }

            if (parentAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: parentAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `⚠️ Hủy lịch học bù Thứ Bảy`,
                body: `Nhà trường xin thông báo: Lịch học bù vào Thứ Bảy (${oldMDateFormatted}) cho ${updated.name} đã được hủy bỏ. Các bé nghỉ học cuối tuần bình thường.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_UPDATED',
                  holidayId: updated.public_id,
                  targetRole: 'PARENT',
                },
              });
            }
          } else {
            // Trường hợp 3: Cập nhật thông thường
            if (teacherAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: teacherAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `📅 Cập nhật lịch trường: ${updated.name}`,
                body: `Ban Giám Hiệu thông báo cập nhật lịch ${updated.name}: ${dateRangeText}. Thầy/Cô vui lòng kiểm tra lại thời khóa biểu.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_UPDATED',
                  holidayId: updated.public_id,
                  targetRole: 'TEACHER',
                },
              });
            }

            if (parentAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: parentAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `📢 Cập nhật lịch: ${updated.name}`,
                body: `Kính gửi Phụ huynh: Lịch ${updated.name} đã được cập nhật lại: ${dateRangeText}. Quý phụ huynh vui lòng lưu ý thời gian nghỉ của bé.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_UPDATED',
                  holidayId: updated.public_id,
                  targetRole: 'PARENT',
                },
              });
            }
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit notification for holiday update');
        }
      })();
  
      return {
        id: updated.public_id,
        name: updated.name,
        makeupDate: updated.makeup_date ? updated.makeup_date.toISOString().split('T')[0] : null,
        copiedActivitiesCount: copiedCount,
        message: copiedCount > 0
          ? `Cập nhật ngày nghỉ thành công! Đã sao chép ${copiedCount} hoạt động giáo dục sang ngày dạy bù.`
          : 'Cập nhật ngày nghỉ / sự kiện thành công!',
      };
    }

  async deleteHoliday(id, holidayId, accountId = null) {
      const schoolYear = await this._resolveSchoolYear(id);
      if (!schoolYear) throw NotFound('Năm học không tồn tại.');
      const bigId = schoolYear.school_year_id;
      const existing = await prisma.schoolHoliday.findFirst({
        where: {
          school_year_id: bigId,
          OR: [
            { public_id: holidayId },
            { holiday_id: /^\d+$/.test(String(holidayId)) ? BigInt(holidayId) : -1n },
          ],
          deleted_at: null,
        },
      });
  
      if (!existing) {
        throw NotFound('Không tìm thấy ngày nghỉ hoặc sự kiện');
      }
  
      await prisma.schoolHoliday.update({
        where: { holiday_id: existing.holiday_id },
        data: { deleted_at: new Date() },
      });

      // Notification: Gửi thông báo đến Giáo viên và Phụ huynh khi xóa ngày nghỉ / sự kiện
      (async () => {
        try {
          const { teacherAccountIds, parentAccountIds } = await getAffectedRecipients(bigId, existing.target_grades);
          const hasMakeup = Boolean(existing.makeup_date);

          if (hasMakeup) {
            const mDateFormatted = formatVnDate(existing.makeup_date);

            if (teacherAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: teacherAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `⚠️ Hủy lịch dạy bù: ${existing.name}`,
                body: `Ban Giám Hiệu đã hủy ngày nghỉ/sự kiện ${existing.name} và lịch dạy bù Thứ Bảy (${mDateFormatted}). Thời khóa biểu đã được khôi phục về trạng thái bình thường.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_DELETED',
                  holidayId: existing.public_id,
                  targetRole: 'TEACHER',
                },
              });
            }

            if (parentAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: parentAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `⚠️ Hủy lịch học bù Thứ Bảy`,
                body: `Nhà trường xin thông báo: Lịch nghỉ ${existing.name} và lịch học bù Thứ Bảy (${mDateFormatted}) đã được hủy bỏ. Lịch sinh hoạt và học tập của các bé trở lại bình thường.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_DELETED',
                  holidayId: existing.public_id,
                  targetRole: 'PARENT',
                },
              });
            }
          } else {
            if (teacherAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: teacherAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `📅 Hủy lịch nghỉ/sự kiện: ${existing.name}`,
                body: `Ban Giám Hiệu đã hủy ngày nghỉ/sự kiện ${existing.name}. Lịch giảng dạy đã được mở khóa bình thường.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_DELETED',
                  holidayId: existing.public_id,
                  targetRole: 'TEACHER',
                },
              });
            }

            if (parentAccountIds.length > 0) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: parentAccountIds,
                creatorAccountId: accountId,
                type: 'SCHEDULE_WEATHER_CHANGE',
                title: `📢 Thông báo thay đổi lịch: ${existing.name}`,
                body: `Nhà trường xin thông báo: Lịch nghỉ ${existing.name} đã được hủy bỏ. Lịch học của các bé diễn ra bình thường.`,
                data: {
                  type: 'ACADEMIC_CALENDAR_DELETED',
                  holidayId: existing.public_id,
                  targetRole: 'PARENT',
                },
              });
            }
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit notification for holiday deletion');
        }
      })();
  
      return {
        success: true,
        message: 'Đã xóa ngày nghỉ / sự kiện thành công!',
      };
    }

}
export const schoolYearService = new SchoolYearService();
export default schoolYearService;
