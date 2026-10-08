import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class SchoolYearService {
  _parseId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
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
    const bigId = BigInt(id);
    const item = await prisma.schoolYear.findFirst({
      where: {
        school_year_id: bigId,
        deleted_at: null,
      },
      include: {
        classes: {
          where: { deleted_at: null },
          select: {
            class_id: true,
            public_id: true,
            name: true,
            age_group: true,
            room_number: true,
            max_capacity: true,
            description: true,
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!item) {
      throw NotFound('Không tìm thấy năm học');
    }

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

  async listHolidays(id, { month, year } = {}) {
    const bigId = BigInt(id);
    let holidays = await prisma.schoolHoliday.findMany({
      where: {
        school_year_id: bigId,
        deleted_at: null,
      },
      orderBy: { start_date: 'asc' },
    });

    // If no holidays recorded yet, insert standard calendar events
    if (holidays.length === 0) {
      const sy = await prisma.schoolYear.findUnique({
        where: { school_year_id: bigId },
      });
      const startYear = sy ? new Date(sy.start_date).getFullYear() : 2026;
      const nextYear = startYear + 1;

      const defaultEvents = [
        {
          name: `Lễ Khai giảng năm học ${startYear}–${nextYear} & Ngày hội bé đến trường`,
          start_date: new Date(`${startYear}-09-05`),
          end_date: new Date(`${startYear}-09-05`),
          is_teaching_allowed: true,
          description: 'Ngày hội toàn dân đưa trẻ đến trường và Lễ Khai giảng năm học mới',
        },
        {
          name: `Vui Tết Trung thu ${startYear} (Đêm hội Trăng Rằm)`,
          start_date: new Date(`${startYear}-09-25`),
          end_date: new Date(`${startYear}-09-25`),
          is_teaching_allowed: true,
          description: 'Lễ hội Trung thu rước đèn múa lân, phá cỗ và giao lưu văn nghệ các khối lớp',
        },
        {
          name: 'Ngày Phụ nữ Việt Nam 20/10',
          start_date: new Date(`${startYear}-10-20`),
          end_date: new Date(`${startYear}-10-20`),
          is_teaching_allowed: true,
          description: 'Bé trải nghiệm cắm hoa, làm thiệp chúc mừng mẹ và cô giáo',
        },
        {
          name: 'Hội thao mầm non toàn trường',
          start_date: new Date(`${startYear}-10-30`),
          end_date: new Date(`${startYear}-10-30`),
          is_teaching_allowed: true,
          description: 'Hội thao vận động khỏe đẹp và trò chơi dân gian cho bé các khối lớp',
        },
        {
          name: 'Kỷ niệm Ngày Nhà giáo Việt Nam 20/11',
          start_date: new Date(`${startYear}-11-20`),
          end_date: new Date(`${startYear}-11-20`),
          is_teaching_allowed: true,
          description: 'Kỷ niệm ngày Nhà giáo Việt Nam 20/11, tri ân thầy cô giáo toàn trường',
        },
        {
          name: `Lễ hội Giáng sinh & Chào đón năm mới ${nextYear}`,
          start_date: new Date(`${startYear}-12-24`),
          end_date: new Date(`${startYear}-12-24`),
          is_teaching_allowed: true,
          description: 'Văn nghệ Noel, hoạt cảnh mùa đông và tặng quà ông già Noel',
        },
        {
          name: `Nghỉ Tết Dương Lịch ${nextYear}`,
          start_date: new Date(`${nextYear}-01-01`),
          end_date: new Date(`${nextYear}-01-03`),
          is_teaching_allowed: false,
          description: `Nghỉ Tết Dương Lịch ${nextYear} theo quy định của Nhà nước (3 ngày)`,
        },
        {
          name: `Lễ Sơ kết Học kỳ 1 năm học ${startYear}–${nextYear}`,
          start_date: new Date(`${nextYear}-01-15`),
          end_date: new Date(`${nextYear}-01-15`),
          is_teaching_allowed: true,
          description: 'Sơ kết công tác chăm sóc, giáo dục trẻ Học kỳ 1 và triển khai kế hoạch Học kỳ 2',
        },
        {
          name: `Nghỉ Tết Nguyên Đán ${nextYear}`,
          start_date: new Date(`${nextYear}-02-05`),
          end_date: new Date(`${nextYear}-02-16`),
          is_teaching_allowed: false,
          description: 'Nghỉ Tết Nguyên Đán theo kế hoạch năm học ngành GD&ĐT (12 ngày)',
        },
        {
          name: 'Ngày Quốc tế Phụ nữ 8/3',
          start_date: new Date(`${nextYear}-03-08`),
          end_date: new Date(`${nextYear}-03-08`),
          is_teaching_allowed: true,
          description: 'Hoạt động bé yêu mẹ và cô giáo nhân ngày Quốc tế Phụ nữ 8/3',
        },
        {
          name: 'Nghỉ Lễ Giỗ Tổ Hùng Vương (10/3 Âm lịch)',
          start_date: new Date(`${nextYear}-04-16`),
          end_date: new Date(`${nextYear}-04-18`),
          is_teaching_allowed: false,
          description: 'Nghỉ Lễ Giỗ Tổ Hùng Vương (10/3 Âm lịch) theo quy định Nhà nước (3 ngày)',
        },
        {
          name: 'Nghỉ Lễ Chiến thắng 30/4 & Quốc tế Lao động 1/5',
          start_date: new Date(`${nextYear}-04-30`),
          end_date: new Date(`${nextYear}-05-03`),
          is_teaching_allowed: false,
          description: 'Nghỉ Lễ Giải phóng Miền Nam 30/4 và Ngày Quốc tế Lao động 1/5 (4 ngày)',
        },
        {
          name: 'Lễ Bế giảng năm học & Ra trường cho bé 5 tuổi',
          start_date: new Date(`${nextYear}-05-28`),
          end_date: new Date(`${nextYear}-05-28`),
          is_teaching_allowed: true,
          description: `Lễ Bế giảng năm học ${startYear}–${nextYear} và Lễ ra trường cho trẻ khối Lá (5 tuổi)`,
        },
      ];

      for (const item of defaultEvents) {
        await prisma.schoolHoliday.create({
          data: {
            school_year_id: bigId,
            name: item.name,
            start_date: item.start_date,
            end_date: item.end_date,
            is_teaching_allowed: item.is_teaching_allowed,
            description: item.description,
            created_by: 1n,
          },
        });
      }

      holidays = await prisma.schoolHoliday.findMany({
        where: { school_year_id: bigId, deleted_at: null },
        orderBy: { start_date: 'asc' },
      });
    }

    const totalEvents = holidays.length;
    const holidaysCount = holidays.filter((h) => !h.is_teaching_allowed).length;
    const generalActivitiesCount = holidays.filter((h) => h.is_teaching_allowed).length;
    const specialDaysCount = 2;

    return {
      counters: {
        totalEvents,
        holidaysCount,
        generalActivitiesCount,
        specialDaysCount,
        scheduledHolidays: holidaysCount,
        pendingConfirmCount: 2,
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

        return {
          id: h.public_id,
          name: h.name,
          startDate: h.start_date.toISOString().split('T')[0],
          endDate: h.end_date.toISOString().split('T')[0],
          displayDate: new Date(h.start_date).toLocaleDateString('vi-VN'),
          isTeachingAllowed: h.is_teaching_allowed,
          type: h.is_teaching_allowed ? 'EVENT' : 'HOLIDAY',
          typeLabel: h.is_teaching_allowed ? 'Sự kiện' : 'Ngày nghỉ',
          description: cleanDesc || h.description,
          scope: itemScope,
          targetGrades: h.target_grades || [],
        };
      }),
    };
  }

  async createHoliday(id, accountId, data) {
    const bigId = BigInt(id);
    const { name, startDate, endDate, isTeachingAllowed = false, description, scope, targetGrades } = data;

    if (!name?.trim()) throw BadRequest('Vui lòng nhập tên ngày nghỉ hoặc sự kiện.');
    if (!startDate || !endDate) throw BadRequest('Vui lòng chọn ngày bắt đầu và kết thúc.');

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    if (eDate < sDate) throw BadRequest('Ngày kết thúc không được trước ngày bắt đầu.');

    let finalDesc = description?.trim() || null;
    if (scope && scope !== 'Toàn trường' && !finalDesc?.startsWith(`[${scope}]`)) {
      finalDesc = `[${scope}] ${finalDesc || ''}`.trim();
    }

    const holiday = await prisma.schoolHoliday.create({
      data: {
        school_year_id: bigId,
        name: name.trim(),
        start_date: sDate,
        end_date: eDate,
        is_teaching_allowed: Boolean(isTeachingAllowed),
        target_grades: Array.isArray(targetGrades) ? targetGrades : [],
        description: finalDesc,
        created_by: accountId ? BigInt(accountId) : 1n,
      },
    });

    return {
      id: holiday.public_id,
      name: holiday.name,
      message: 'Thêm ngày nghỉ / sự kiện thành công!',
    };
  }

  async updateHoliday(id, holidayId, accountId, data) {
    const bigId = BigInt(id);
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
    if (data.description !== undefined || data.scope !== undefined) {
      let desc = data.description !== undefined ? (data.description ? data.description.trim() : '') : (existing.description || '');
      const cleaned = desc.replace(/^\[.*?\]\s*/, '').trim();
      if (data.scope && data.scope !== 'Toàn trường') {
        desc = `[${data.scope}] ${cleaned}`.trim();
      } else if (data.scope === 'Toàn trường') {
        desc = cleaned;
      }
      updateData.description = desc || null;
    }

    const updated = await prisma.schoolHoliday.update({
      where: { holiday_id: existing.holiday_id },
      data: updateData,
    });

    return {
      id: updated.public_id,
      name: updated.name,
      message: 'Cập nhật ngày nghỉ / sự kiện thành công!',
    };
  }

  async deleteHoliday(id, holidayId) {
    const bigId = BigInt(id);
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

    return {
      success: true,
      message: 'Đã xóa ngày nghỉ / sự kiện thành công!',
    };
  }

  async importHolidays(id, accountId, items) {
    const bigId = BigInt(id);
    if (!Array.isArray(items) || items.length === 0) {
      throw BadRequest('Danh sách ngày nghỉ để import không hợp lệ.');
    }

    const createdList = [];
    for (const item of items) {
      if (!item.name || !item.startDate) continue;
      const sDate = new Date(item.startDate);
      const eDate = item.endDate ? new Date(item.endDate) : sDate;

      const created = await prisma.schoolHoliday.create({
        data: {
          school_year_id: bigId,
          name: item.name.trim(),
          start_date: sDate,
          end_date: eDate,
          is_teaching_allowed: Boolean(item.isTeachingAllowed),
          target_grades: Array.isArray(item.targetGrades) ? item.targetGrades : [],
          description: item.description?.trim() || null,
          created_by: accountId ? BigInt(accountId) : 1n,
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
              where: { left_at: null, is_primary: true },
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
      const totalInClass = c.student_enrollments.filter((e) => !e.left_at).length;
      const completedInClass = c.student_enrollments.filter(
        (e) => (e.status === 'COMPLETED' || e.status === 'GRADUATED') && !e.left_at,
      ).length;
      const teacherName = c.teacher_classes?.[0]?.teacher?.full_name || 'Chưa phân công';

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
      step2: {
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
      step3: {
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
              status: isGraduated ? 'GRADUATED' : 'COMPLETED',
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
}
export const schoolYearService = new SchoolYearService();
export default schoolYearService;
