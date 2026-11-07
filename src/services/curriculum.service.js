import prisma from '../config/prisma.js';
import { BadRequest, NotFound } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { notificationService } from './notification.service.js';
import { cleanGoalTitle, normalizeGoalCode } from '../utils/goal-sanitizer.js';
import ExcelJS from 'exceljs';
import {
  createStandardWorkbook,
  addSchoolHeaderBanner,
  applyHeaderStyles,
  applyZebraRows,
  autoFitColumns,
  formatDateDMY,
} from '../utils/excel.helper.js';

// Pedagogical Age Group configurations
const AGE_GROUPS = [
  { key: 'nhatre', label: 'Khối Nhà trẻ', dbKey: 'NHA_TRE', ageRange: '12–36 tháng' },
  { key: 'mam', label: 'Khối Mầm', dbKey: 'MAM', ageRange: '3–4 tuổi' },
  { key: 'choi', label: 'Khối Chồi', dbKey: 'CHOI', ageRange: '4–5 tuổi' },
  { key: 'la', label: 'Khối Lá', dbKey: 'LA', ageRange: '5–6 tuổi' },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val.trim());

function parseDateUtc(dateStr) {
  if (!dateStr) return null;
  const str = typeof dateStr === 'string' ? dateStr.slice(0, 10) : dateStr.toISOString().slice(0, 10);
  const parts = str.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function isMonday(dateStr) {
  const d = parseDateUtc(dateStr);
  return d ? d.getUTCDay() === 1 : false;
}

function isSunday(dateStr) {
  const d = parseDateUtc(dateStr);
  return d ? d.getUTCDay() === 0 : false;
}

function addDaysToDateStr(dateStr, days) {
  const d = parseDateUtc(dateStr);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

class CurriculumService {
  /**
   * List overview of Theme sets grouped by grade/age-group querying live PostgreSQL
   */
  async listThemeOverview(query = {}) {
    // 1. Get school years
    const schoolYears = await prisma.schoolYear.findMany({
      where: { deleted_at: null },
      orderBy: { start_date: 'desc' },
      take: 5,
    });

    const yearsList = schoolYears.map((sy) => ({
      id: sy.school_year_id.toString(),
      name: sy.name.replace('Năm học ', ''),
      fullName: sy.name,
      status: sy.status === 'ACTIVE' ? 'ACTIVE' : sy.status === 'COMPLETED' ? 'COMPLETED' : 'UPCOMING',
    }));

    const targetYear = (query.year || query.schoolYear || '').replace('–', '-').trim();

    // 2. Fetch all real curriculum themes from PostgreSQL
    const allThemes = await prisma.curriculumTheme.findMany({
      where: { deleted_at: null },
      include: {
        sub_themes: { where: { deleted_at: null } },
      },
    });

    // 3. Generate age groups data from real DB records
    const groups = AGE_GROUPS.map((g) => {
      let yearCards = schoolYears.map((sy) => {
        const yearName = sy.name.replace('Năm học ', '');
        const matchingThemes = allThemes.filter(
          (t) => t.school_year_id === sy.school_year_id && t.age_group === g.dbKey
        );
        const totalSubThemes = matchingThemes.reduce((acc, t) => acc + (t.sub_themes?.length || 0), 0);
        const isDraft = matchingThemes.some((t) => t.status === 'DRAFT');

        return {
          id: `${g.key}-${yearName.replace('–', '-')}`,
          yearName,
          yearId: yearName.replace('–', '-'),
          schoolYearId: sy.school_year_id.toString(),
          ageGroup: g.key,
          ageGroupLabel: g.label,
          themeCount: matchingThemes.length,
          subThemeCount: totalSubThemes,
          status: matchingThemes.length === 0 ? 'DRAFT' : isDraft ? 'DRAFT' : 'ACTIVE',
          statusLabel: matchingThemes.length === 0 ? 'Chưa thiết lập' : isDraft ? 'Bản nháp' : 'Hoạt động',
          statusBadge: matchingThemes.length === 0 ? 'neutral' : isDraft ? 'warning' : 'primary',
          updatedAt: matchingThemes.length > 0 ? 'Đã đồng bộ' : 'Chưa có dữ liệu',
        };
      });

      if (targetYear) {
        const filtered = yearCards.filter((c) => c.yearId === targetYear || c.yearName.replace('–', '-') === targetYear);
        if (filtered.length > 0) {
          yearCards = filtered;
        } else {
          const displayYear = targetYear.replace('-', '–');
          yearCards = [
            {
              id: `${g.key}-${targetYear}`,
              yearName: displayYear,
              yearId: targetYear,
              ageGroup: g.key,
              ageGroupLabel: g.label,
              themeCount: 0,
              subThemeCount: 0,
              status: 'DRAFT',
              statusLabel: 'Chưa thiết lập',
              statusBadge: 'neutral',
              updatedAt: 'Chưa có dữ liệu',
            },
          ];
        }
      }

      return {
        key: g.key,
        label: g.label,
        ageRange: g.ageRange,
        cards: yearCards,
      };
    });

    // 4. Donut chart overview metrics from real data
    const donutOverview = AGE_GROUPS.map((g) => {
      const match = groups.find((grp) => grp.key === g.key);
      const card = match?.cards?.[0];
      const count = card?.themeCount ?? 0;
      return {
        key: g.key,
        label: g.label,
        total: count,
        breakdown: [
          `${card?.yearName || '2026–2027'}: ${count} chủ đề`,
        ],
      };
    });

    const recentActivities = [
      { id: 'act1', type: 'SYNC', text: 'Đồng bộ khung kế hoạch năm học 2026–2027', time: 'Hôm nay' },
      { id: 'act2', type: 'UPDATE', text: 'Cập nhật phân bổ mục tiêu và chủ đề', time: 'Hôm nay' },
    ];

    return {
      groups,
      donutOverview,
      recentActivities,
      yearsList,
    };
  }

  /**
   * Dynamically resolve SchoolYear record matching year string (e.g. '2026-2027')
   */
  async resolveSchoolYear(yearStr) {
    const raw = (yearStr || '2026-2027').trim();
    const cleanYear = raw.replace('–', '-');
    const parts = cleanYear.match(/\d{4}/g);

    let sy = await prisma.schoolYear.findFirst({
      where: {
        OR: [
          { name: { contains: cleanYear } },
          { name: { contains: cleanYear.replace('-', '–') } },
        ],
        deleted_at: null,
      },
      orderBy: { start_date: 'desc' },
    });

    if (!sy && parts && parts.length > 0) {
      sy = await prisma.schoolYear.findFirst({
        where: {
          start_date: {
            gte: new Date(`${parts[0]}-01-01T00:00:00.000Z`),
            lte: new Date(`${parts[0]}-12-31T23:59:59.999Z`),
          },
          deleted_at: null,
        },
        orderBy: { start_date: 'desc' },
      });
    }

    if (!sy) {
      sy = await prisma.schoolYear.findFirst({
        where: { deleted_at: null },
        orderBy: { start_date: 'desc' },
      });
    }

    return sy;
  }

  /**
   * Get detailed Theme Set for a specific year and age-group from live PostgreSQL
   */
  async getThemeSetDetail({ year = '2026–2027', ageGroup = 'nhatre' }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    const normalizedYear = (year || '2026–2027').replace('-', '–');
    const schoolYear = await this.resolveSchoolYear(year);
    const schoolYearId = schoolYear?.school_year_id;

    // Query themes directly using Prisma Relation Filter (single DB query)
    const dbThemes = await prisma.curriculumTheme.findMany({
      where: {
        ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
        age_group: ageGroupInfo.dbKey,
        deleted_at: null,
      },
      include: {
        school_year: true,
        sub_themes: {
          where: { deleted_at: null },
          orderBy: { start_date: 'asc' },
        },
      },
      orderBy: { start_date: 'asc' },
    });

    if (dbThemes && dbThemes.length > 0) {
      const mappedThemes = dbThemes.map((t, idx) => ({
        id: t.public_id || t.theme_id.toString(),
        code: String(idx + 1).padStart(2, '0'),
        name: t.name,
        startDate: t.start_date.toISOString().slice(0, 10),
        endDate: t.end_date.toISOString().slice(0, 10),
        submissionDeadline: t.submission_deadline ? t.submission_deadline.toISOString().slice(0, 10) : null,
        allowLateSubmit: t.allow_late_submit ?? true,
        weeks: t.sub_themes.length,
        status: t.status,
        note: t.description || '',
        description: t.description || '',
        subThemes: t.sub_themes.map((st) => ({
          id: st.public_id || st.sub_theme_id.toString(),
          name: st.name,
          startDate: st.start_date.toISOString().slice(0, 10),
          endDate: st.end_date.toISOString().slice(0, 10),
        })),
      }));

      const publishedCount = mappedThemes.filter((t) => t.status === 'PUBLISHED').length;
      const draftCount = mappedThemes.filter((t) => t.status === 'DRAFT').length;
      const totalSubThemes = mappedThemes.reduce((acc, t) => acc + (t.subThemes?.length || 0), 0);

      return {
        info: {
          year: normalizedYear,
          schoolYearId: schoolYearId?.toString() || '1',
          startDate: schoolYear?.start_date ? schoolYear.start_date.toISOString().slice(0, 10) : '2026-09-05',
          endDate: schoolYear?.end_date ? schoolYear.end_date.toISOString().slice(0, 10) : '2027-05-31',
          ageGroup: ageGroupInfo.key,
          ageGroupLabel: ageGroupInfo.label,
          status: draftCount > 0 ? 'DRAFT' : 'PUBLISHED',
          statusLabel: draftCount > 0 ? 'Bản nháp' : 'Đã công bố',
          updatedAt: '13/10/2026',
        },
        themes: mappedThemes,
        summary: {
          totalThemes: mappedThemes.length,
          publishedCount,
          draftCount,
          totalSubThemes,
        },
      };
    }

    return {
      info: {
        year: normalizedYear,
        schoolYearId: schoolYearId?.toString() || '1',
        startDate: schoolYear?.start_date ? schoolYear.start_date.toISOString().slice(0, 10) : '2026-09-05',
        endDate: schoolYear?.end_date ? schoolYear.end_date.toISOString().slice(0, 10) : '2027-05-31',
        ageGroup: ageGroupInfo.key,
        ageGroupLabel: ageGroupInfo.label,
        status: 'DRAFT',
        statusLabel: 'Chưa có dữ liệu',
        updatedAt: 'Chưa có dữ liệu',
      },
      themes: [],
      summary: {
        totalThemes: 0,
        publishedCount: 0,
        draftCount: 0,
        totalSubThemes: 0,
      },
    };
  }

  /**
   * Update publish status of a theme set in PostgreSQL
   */
  async updateThemeSetStatus({ year = '2026–2027', ageGroup = 'nhatre', status = 'DRAFT' }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    const schoolYear = await this.resolveSchoolYear(year);
    const schoolYearId = schoolYear?.school_year_id;

    if (!schoolYear) {
      throw new NotFound('Không tìm thấy năm học.');
    }

    if (String(status).toUpperCase() === 'PUBLISHED') {
      const dbThemes = await prisma.curriculumTheme.findMany({
        where: {
          school_year_id: schoolYearId,
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
        include: {
          sub_themes: {
            where: { deleted_at: null },
            orderBy: { start_date: 'asc' },
          },
        },
        orderBy: { start_date: 'asc' },
      });

      if (!dbThemes || dbThemes.length === 0) {
        throw new BadRequest('Kế hoạch chủ đề chưa có chủ đề nào để công bố.');
      }

      // 1. Phải đủ chủ đề cho cả năm học (cho phép dung sai 7 ngày do lễ khai giảng hoặc bế giảng)
      const syStart = schoolYear.start_date.toISOString().slice(0, 10);
      const syEnd = schoolYear.end_date.toISOString().slice(0, 10);
      const firstThemeStart = dbThemes[0].start_date.toISOString().slice(0, 10);
      const lastThemeEnd = dbThemes[dbThemes.length - 1].end_date.toISOString().slice(0, 10);

      const startDiffDays = Math.round((new Date(firstThemeStart) - new Date(syStart)) / (1000 * 60 * 60 * 24));
      if (startDiffDays > 7 || startDiffDays < -7) {
        throw new BadRequest(
          `Kế hoạch chủ đề chưa bao quát trọn năm học: Chủ đề đầu tiên bắt đầu ngày ${firstThemeStart}, trong khi năm học bắt đầu ngày ${syStart}.`,
        );
      }
      const endDiffDays = Math.round((new Date(syEnd) - new Date(lastThemeEnd)) / (1000 * 60 * 60 * 24));
      if (endDiffDays > 7 || endDiffDays < -7) {
        throw new BadRequest(
          `Kế hoạch chủ đề chưa bao quát trọn năm học: Chủ đề cuối cùng kết thúc ngày ${lastThemeEnd}, trong khi năm học kết thúc ngày ${syEnd}.`,
        );
      }

      // Kiểm tra tính liên tục giữa các chủ đề (không có tuần bị bỏ trống)
      for (let i = 1; i < dbThemes.length; i++) {
        const prevTheme = dbThemes[i - 1];
        const currTheme = dbThemes[i];
        const prevEnd = new Date(prevTheme.end_date);
        const currStart = new Date(currTheme.start_date);
        const diffDays = Math.round((currStart - prevEnd) / (1000 * 60 * 60 * 24));
        if (diffDays > 3) {
          throw new BadRequest(
            `Kế hoạch chủ đề bị ngắt quãng giữa chủ đề "${prevTheme.name}" (kết thúc ${prevTheme.end_date.toISOString().slice(0, 10)}) và "${currTheme.name}" (bắt đầu ${currTheme.start_date.toISOString().slice(0, 10)}).`,
          );
        }
      }

      // 2. Phải đủ chủ đề nhánh cho các chủ đề và tuân thủ tuần Thứ Hai – Chủ Nhật
      for (const t of dbThemes) {
        const subs = t.sub_themes || [];
        if (subs.length < 2 || subs.length > 6) {
          throw new BadRequest(
            `Chủ đề "${t.name}" phải có từ 2 đến 6 chủ đề nhánh (hiện có ${subs.length} nhánh).`,
          );
        }

        const tStart = t.start_date.toISOString().slice(0, 10);
        const tEnd = t.end_date.toISOString().slice(0, 10);
        const tDiffDays = Math.round((new Date(tEnd) - new Date(tStart)) / 86400000) + 1;
        if (tDiffDays < 14) {
          throw new BadRequest(`Chủ đề "${t.name}": Thời lượng (${tDiffDays} ngày) tối thiểu là 2 tuần (14 ngày).`);
        }
        if (tDiffDays > 42) {
          throw new BadRequest(`Chủ đề "${t.name}": Thời lượng (${tDiffDays} ngày) tối đa là 6 tuần (42 ngày).`);
        }
        if (tDiffDays % 7 !== 0) {
          throw new BadRequest(`Chủ đề "${t.name}": Thời lượng (${tDiffDays} ngày) phải chia hết cho 7 ngày.`);
        }
        if (!isMonday(t.start_date)) {
          throw new BadRequest(`Chủ đề "${t.name}": Ngày bắt đầu (${tStart}) phải là Thứ Hai.`);
        }
        if (!isSunday(t.end_date)) {
          throw new BadRequest(`Chủ đề "${t.name}": Ngày kết thúc (${tEnd}) phải là Chủ Nhật.`);
        }

        const firstSubStart = subs[0].start_date.toISOString().slice(0, 10);
        const lastSubEnd = subs[subs.length - 1].end_date.toISOString().slice(0, 10);

        if (firstSubStart !== tStart) {
          throw new BadRequest(
            `Chủ đề "${t.name}": Chủ đề nhánh đầu tiên ("${subs[0].name}") phải bắt đầu đúng ngày bắt đầu của chủ đề (${tStart}).`,
          );
        }
        if (lastSubEnd !== tEnd) {
          throw new BadRequest(
            `Chủ đề "${t.name}": Chủ đề nhánh cuối cùng ("${subs[subs.length - 1].name}") phải kết thúc đúng ngày kết thúc của chủ đề (${tEnd}).`,
          );
        }

        for (const st of subs) {
          const stS = st.start_date.toISOString().slice(0, 10);
          const stE = st.end_date.toISOString().slice(0, 10);
          if (!isMonday(st.start_date)) {
            throw new BadRequest(`Chủ đề nhánh "${st.name}": Ngày bắt đầu (${stS}) phải là Thứ Hai.`);
          }
          if (!isSunday(st.end_date)) {
            throw new BadRequest(`Chủ đề nhánh "${st.name}": Ngày kết thúc (${stE}) phải là Chủ Nhật.`);
          }
          const stDiffDays = Math.round((new Date(stE) - new Date(stS)) / 86400000) + 1;
          if (stDiffDays % 7 !== 0) {
            throw new BadRequest(`Chủ đề nhánh "${st.name}": Thời lượng (${stDiffDays} ngày) phải chia hết cho 7 ngày.`);
          }
          if (stDiffDays > 35) {
            throw new BadRequest(`Chủ đề nhánh "${st.name}": Thời lượng (${stDiffDays} ngày) không được vượt quá 5 tuần (35 ngày).`);
          }
        }

        for (let k = 1; k < subs.length; k++) {
          const prevSubEndStr = subs[k - 1].end_date.toISOString().slice(0, 10);
          const currSubStartStr = subs[k].start_date.toISOString().slice(0, 10);
          const expectedStartStr = addDaysToDateStr(prevSubEndStr, 1);
          if (currSubStartStr !== expectedStartStr) {
            throw new BadRequest(
              `Chủ đề "${t.name}": Chủ đề nhánh "${subs[k].name}" (${currSubStartStr}) phải bắt đầu liền kề vào Thứ Hai (${expectedStartStr}) ngay sau "${subs[k - 1].name}" (${prevSubEndStr}).`,
            );
          }
        }
      }
    }

    await prisma.curriculumTheme.updateMany({
      where: {
        ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
        age_group: ageGroupInfo.dbKey,
        deleted_at: null,
      },
      data: {
        status: status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        updated_at: new Date(),
      },
    });

    // Notification 15: Publish Theme Plan (BGH công bố kế hoạch chủ đề -> GV thuộc khối áp dụng)
    if (status === 'PUBLISHED') {
      (async () => {
        try {
          const teacherAccountIds = await notificationService.getGradeTeacherAccountIds(
            ageGroupInfo.dbKey,
            schoolYearId,
          );
          if (teacherAccountIds.length > 0) {
            await notificationService.emitSystemNotification({
              recipientAccountIds: teacherAccountIds,
              type: 'SCHOOL_ANNOUNCEMENT',
              title: `Công bố kế hoạch chủ đề: ${ageGroupInfo.label}`,
              body: `Ban Giám Hiệu đã công bố kế hoạch các chủ đề giáo dục cho ${ageGroupInfo.label} (Năm học ${year}).`,
              data: {
                type: 'THEME_PLAN_PUBLISHED',
                ageGroup: ageGroupInfo.key,
                year,
              },
            });
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit notification for theme plan publish');
        }
      })();
    }

    return this.getThemeSetDetail({ year, ageGroup });
  }

  /**
   * Update themes detail and subThemes of a theme set
   */
  async updateThemeSetDetail({ year = '2026–2027', ageGroup = 'nhatre', themes = [], theme, note }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    const normalizedYear = (year || '2026–2027').replace('-', '–');
    const schoolYear = await this.resolveSchoolYear(year);
    const schoolYearId = schoolYear?.school_year_id || 1n;
    const syStart = schoolYear?.start_date ? schoolYear.start_date.toISOString().slice(0, 10) : '2026-09-01';
    const syEnd = schoolYear?.end_date ? schoolYear.end_date.toISOString().slice(0, 10) : '2027-05-31';

    // 1. Fetch themes and associated school year in a single DB query using Relation Filter
    const dbThemes = await prisma.curriculumTheme.findMany({
      where: {
        school_year_id: schoolYearId,
        age_group: ageGroupInfo.dbKey,
        deleted_at: null,
      },
      include: {
        school_year: true,
        sub_themes: {
          where: { deleted_at: null },
          orderBy: { start_date: 'asc' },
        },
      },
      orderBy: { start_date: 'asc' },
    });

    let targetThemes = [];
    if (Array.isArray(themes) && themes.length > 0) {
      targetThemes = [...themes];
    } else if (theme) {
      const matchIdx = dbThemes.findIndex(
        (t) => t.theme_id.toString() === theme.id?.toString() || t.public_id === theme.id?.toString(),
      );
      if (matchIdx !== -1) {
        targetThemes = dbThemes.map((t, idx) => {
          if (idx === matchIdx) {
            return {
              id: t.theme_id.toString(),
              name: theme.name || t.name,
              startDate: theme.startDate || t.start_date.toISOString().slice(0, 10),
              endDate: theme.endDate || t.end_date.toISOString().slice(0, 10),
              submissionDeadline:
                theme.submissionDeadline !== undefined
                  ? theme.submissionDeadline
                  : t.submission_deadline
                  ? t.submission_deadline.toISOString().slice(0, 10)
                  : null,
              allowLateSubmit:
                theme.allowLateSubmit !== undefined ? theme.allowLateSubmit : t.allow_late_submit ?? true,
              status: theme.status || t.status,
              note: theme.note || t.description || '',
              subThemes: theme.subThemes || t.sub_themes.map((st) => ({
                id: st.sub_theme_id.toString(),
                name: st.name,
                startDate: st.start_date.toISOString().slice(0, 10),
                endDate: st.end_date.toISOString().slice(0, 10),
              })),
            };
          }
          return {
            id: t.theme_id.toString(),
            name: t.name,
            startDate: t.start_date.toISOString().slice(0, 10),
            endDate: t.end_date.toISOString().slice(0, 10),
            submissionDeadline: t.submission_deadline ? t.submission_deadline.toISOString().slice(0, 10) : null,
            allowLateSubmit: t.allow_late_submit ?? true,
            status: t.status,
            note: t.description || '',
            subThemes: t.sub_themes.map((st) => ({
              id: st.sub_theme_id.toString(),
              name: st.name,
              startDate: st.start_date.toISOString().slice(0, 10),
              endDate: st.end_date.toISOString().slice(0, 10),
            })),
          };
        });
      }
    }

    if (targetThemes.length === 0) {
      return this.getThemeSetDetail({ year, ageGroup });
    }

    // 3. SERVER-SIDE VALIDATION
    // Kiểm tra trùng lặp tên chủ đề trong cùng bộ chủ đề
    const seenThemeNames = new Map();
    for (let i = 0; i < targetThemes.length; i++) {
      const t = targetThemes[i];
      const tName = (t.name || '').trim();
      if (!tName) continue;
      const lowerName = tName.toLowerCase();
      if (seenThemeNames.has(lowerName)) {
        throw new BadRequest('Tên chủ đề đã tồn tại trong bộ chủ đề này. Vui lòng nhập tên khác.');
      }
      seenThemeNames.set(lowerName, i);
    }

    // Quy tắc 1: Khung năm học và ngày bắt đầu / kết thúc từng chủ đề
    for (let i = 0; i < targetThemes.length; i++) {
      const t = targetThemes[i];
      const tName = t.name?.trim() || `Chủ đề ${i + 1}`;

      if (!t.name || !t.name.trim()) {
        throw new BadRequest(`Chủ đề thứ ${i + 1} chưa có tên.`);
      }
      if (!t.startDate || !t.endDate) {
        throw new BadRequest(`Chủ đề "${tName}" chưa có đầy đủ ngày bắt đầu và ngày kết thúc.`);
      }
      if (t.startDate > t.endDate) {
        throw new BadRequest(
          `Chủ đề "${tName}": Ngày bắt đầu (${t.startDate}) không được sau ngày kết thúc (${t.endDate}).`,
        );
      }
      if (t.startDate < syStart) {
        throw new BadRequest(
          `Chủ đề "${tName}": Ngày bắt đầu (${t.startDate}) không được trước ngày bắt đầu năm học (${syStart}).`,
        );
      }
      if (t.endDate > syEnd) {
        throw new BadRequest(
          `Chủ đề "${tName}": Ngày kết thúc (${t.endDate}) không được sau ngày kết thúc năm học (${syEnd}).`,
        );
      }

      // Quy tắc thời lượng: Tối thiểu 2 tuần (14 ngày), tối đa 6 tuần (42 ngày)
      const diffMs = new Date(t.endDate) - new Date(t.startDate);
      const diffDays = Math.round(diffMs / 86400000) + 1;
      if (diffDays < 14) {
        throw new BadRequest(
          `Chủ đề "${tName}": Thời lượng chủ đề tối thiểu là 2 tuần (14 ngày). Hiện tại là ${diffDays} ngày.`,
        );
      }
      if (diffDays > 42) {
        throw new BadRequest(
          `Chủ đề "${tName}": Thời lượng chủ đề tối đa là 6 tuần (42 ngày). Hiện tại là ${diffDays} ngày.`,
        );
      }

      // Ràng buộc tuần chuẩn: Chủ đề phải bắt đầu vào Thứ Hai và kết thúc vào Chủ Nhật, thời lượng chia hết cho 7
      if (!isMonday(t.startDate)) {
        throw new BadRequest(
          `Chủ đề "${tName}": Ngày bắt đầu (${t.startDate}) phải là Thứ Hai (đầu tuần).`,
        );
      }
      if (!isSunday(t.endDate)) {
        throw new BadRequest(
          `Chủ đề "${tName}": Ngày kết thúc (${t.endDate}) phải là Chủ Nhật (cuối tuần).`,
        );
      }
      if (diffDays % 7 !== 0) {
        throw new BadRequest(
          `Chủ đề "${tName}": Thời lượng (${diffDays} ngày) phải là các tuần trọn vẹn (chia hết cho 7 ngày).`,
        );
      }

      // Quy tắc 2: Không đè lên chủ đề trước và nối tiếp liên tục
      if (i > 0) {
        const prevT = targetThemes[i - 1];
        const prevName = prevT.name?.trim() || `Chủ đề ${i}`;
        if (t.startDate <= prevT.endDate) {
          throw new BadRequest(
            `Chủ đề "${tName}" bắt đầu ngày ${t.startDate} bị trùng hoặc đi trước ngày kết thúc của chủ đề trước "${prevName}" (${prevT.endDate}).`,
          );
        }
        const expectedThemeStart = addDaysToDateStr(prevT.endDate, 1);
        if (t.status === 'PUBLISHED' && t.startDate !== expectedThemeStart) {
          throw new BadRequest(
            `Chủ đề "${tName}" (bắt đầu ${t.startDate}) phải bắt đầu liền kề vào Thứ Hai (${expectedThemeStart}) ngay sau khi chủ đề trước "${prevName}" kết thúc (${prevT.endDate}).`,
          );
        }
      }

      // Quy tắc 3: Kiểm tra các nhánh con (subThemes)
      const subs = Array.isArray(t.subThemes) ? t.subThemes : [];
      if (subs.length > 0) {
        // Kiểm tra không trùng tên chủ đề nhánh trong cùng một chủ đề
        const seenSubNames = new Set();
        for (let k = 0; k < subs.length; k++) {
          const st = subs[k];
          const stName = (st.name || '').trim();
          if (!stName) continue;
          const lowerSub = stName.toLowerCase();
          if (seenSubNames.has(lowerSub)) {
            throw new BadRequest('Tên chủ đề nhánh đã tồn tại trong chủ đề này. Vui lòng nhập tên khác.');
          }
          seenSubNames.add(lowerSub);
        }

        // Nhánh đầu tiên phải khớp với mốc bắt đầu của chủ đề chính
        if (subs[0].startDate && subs[0].startDate !== t.startDate) {
          throw new BadRequest(
            `Chủ đề "${tName}": Nhánh đầu tiên ("${subs[0].name}") phải bắt đầu từ ngày bắt đầu chủ đề chính (${t.startDate}).`,
          );
        }

        // Nhánh cuối cùng phải kết thúc đúng ngày kết thúc của chủ đề chính (bắt buộc khi công bố)
        const lastSub = subs[subs.length - 1];
        if (t.status === 'PUBLISHED' && lastSub.endDate && lastSub.endDate !== t.endDate) {
          throw new BadRequest(
            `Chủ đề "${tName}": Nhánh cuối cùng ("${lastSub.name}") phải kết thúc vào ngày kết thúc chủ đề chính (${t.endDate}).`,
          );
        }

        for (let k = 0; k < subs.length; k++) {
          const st = subs[k];
          const stName = st.name?.trim() || `Nhánh ${k + 1}`;

          if (!st.name || !st.name.trim()) {
            throw new BadRequest(`Chủ đề "${tName}": Nhánh thứ ${k + 1} chưa có tên.`);
          }
          if (!st.startDate || !st.endDate) {
            throw new BadRequest(`Chủ đề nhánh "${stName}" chưa có đầy đủ ngày bắt đầu và kết thúc.`);
          }
          if (st.startDate > st.endDate) {
            throw new BadRequest(
              `Chủ đề nhánh "${stName}": Ngày bắt đầu (${st.startDate}) không được sau ngày kết thúc (${st.endDate}).`,
            );
          }
          // Nằm trọn trong chủ đề chính
          if (st.startDate < t.startDate || st.endDate > t.endDate) {
            throw new BadRequest(
              `Chủ đề nhánh "${stName}" (${st.startDate} – ${st.endDate}) phải nằm trọn trong chủ đề chính "${tName}" (${t.startDate} – ${t.endDate}).`,
            );
          }

          // Ràng buộc tuần chuẩn: Nhánh phải bắt đầu Thứ Hai và kết thúc Chủ Nhật
          if (!isMonday(st.startDate)) {
            throw new BadRequest(
              `Chủ đề nhánh "${stName}": Ngày bắt đầu (${st.startDate}) phải là Thứ Hai (đầu tuần).`,
            );
          }
          if (!isSunday(st.endDate)) {
            throw new BadRequest(
              `Chủ đề nhánh "${stName}": Ngày kết thúc (${st.endDate}) phải là Chủ Nhật (cuối tuần).`,
            );
          }
          const stDiffMs = new Date(st.endDate) - new Date(st.startDate);
          const stDiffDays = Math.round(stDiffMs / 86400000) + 1;
          if (stDiffDays % 7 !== 0) {
            throw new BadRequest(
              `Chủ đề nhánh "${stName}": Thời lượng (${stDiffDays} ngày) phải là các tuần trọn vẹn (chia hết cho 7 ngày).`,
            );
          }
          if (stDiffDays > 35) {
            throw new BadRequest(
              `Chủ đề nhánh "${stName}": Thời lượng (${stDiffDays} ngày) không được vượt quá 5 tuần (35 ngày).`,
            );
          }

          // Nhánh sau phải bắt đầu liền kề vào Thứ Hai ngay sau Chủ Nhật của nhánh trước
          if (k > 0) {
            const prevSt = subs[k - 1];
            const prevStName = prevSt.name?.trim() || `Nhánh ${k}`;
            const expectedStart = addDaysToDateStr(prevSt.endDate, 1);
            if (st.startDate !== expectedStart) {
              throw new BadRequest(
                `Chủ đề nhánh "${stName}" (bắt đầu ${st.startDate}) phải bắt đầu liền kề vào Thứ Hai (${expectedStart}) ngay sau nhánh trước "${prevStName}" (kết thúc ${prevSt.endDate}).`,
              );
            }
          }
        }
      }
    }

    // 4. PERSIST TO POSTGRESQL IN TRANSACTION
    await prisma.$transaction(async (tx) => {
      // Tìm các theme_id cần xóa (có trong DB nhưng không còn trong targetThemes)
      const existingThemeIds = dbThemes.map((t) => t.theme_id);
      const keptThemeIds = targetThemes
        .map((t) => {
          if (!t.id) return null;
          const match = dbThemes.find(
            (d) => d.theme_id.toString() === String(t.id) || d.public_id === String(t.id),
          );
          return match ? match.theme_id : (/^\d+$/.test(String(t.id)) ? BigInt(t.id) : null);
        })
        .filter(Boolean);

      const toDeleteThemeIds = existingThemeIds.filter((id) => !keptThemeIds.includes(id));
      if (toDeleteThemeIds.length > 0) {
        await tx.subTheme.deleteMany({
          where: { theme_id: { in: toDeleteThemeIds } },
        });
        await tx.curriculumTheme.deleteMany({
          where: { theme_id: { in: toDeleteThemeIds } },
        });
      }

      // Cập nhật hoặc tạo mới từng theme
      for (const t of targetThemes) {
        let themeIdBigInt = null;
        if (t.id) {
          const match = dbThemes.find(
            (d) => d.theme_id.toString() === String(t.id) || d.public_id === String(t.id),
          );
          if (match) {
            themeIdBigInt = match.theme_id;
          } else if (/^\d+$/.test(String(t.id))) {
            themeIdBigInt = BigInt(t.id);
          }
        }

        let savedTheme = null;
        let submissionDeadlineDate = null;
        if (t.submissionDeadline) {
          const dlStr = String(t.submissionDeadline).slice(0, 10);
          submissionDeadlineDate = new Date(`${dlStr}T23:59:59.999Z`);
        }

        const themeData = {
          name: t.name.trim(),
          start_date: new Date(`${t.startDate}T00:00:00.000Z`),
          end_date: new Date(`${t.endDate}T00:00:00.000Z`),
          submission_deadline: submissionDeadlineDate,
          allow_late_submit: t.allowLateSubmit !== undefined ? Boolean(t.allowLateSubmit) : true,
          description: t.note || t.description || null,
          status: t.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
          updated_at: new Date(),
        };

        if (themeIdBigInt && existingThemeIds.includes(themeIdBigInt)) {
          savedTheme = await tx.curriculumTheme.update({
            where: { theme_id: themeIdBigInt },
            data: themeData,
          });
        } else {
          savedTheme = await tx.curriculumTheme.create({
            data: {
              ...themeData,
              school_year_id: schoolYearId,
              age_group: ageGroupInfo.dbKey,
            },
          });
        }

        // Cập nhật subThemes của theme này
        const subs = Array.isArray(t.subThemes) ? t.subThemes : [];
        const existingSubThemes = await tx.subTheme.findMany({
          where: { theme_id: savedTheme.theme_id, deleted_at: null },
        });
        const existingSubIds = existingSubThemes.map((s) => s.sub_theme_id);

        const keptSubIds = subs
          .map((s) => {
            if (!s.id) return null;
            const match = existingSubThemes.find(
              (d) => d.sub_theme_id.toString() === String(s.id) || d.public_id === String(s.id),
            );
            return match ? match.sub_theme_id : (/^\d+$/.test(String(s.id)) ? BigInt(s.id) : null);
          })
          .filter(Boolean);

        const toDeleteSubIds = existingSubIds.filter((id) => !keptSubIds.includes(id));
        if (toDeleteSubIds.length > 0) {
          await tx.subTheme.deleteMany({
            where: { sub_theme_id: { in: toDeleteSubIds } },
          });
        }

        for (const st of subs) {
          let subIdBigInt = null;
          if (st.id) {
            const match = existingSubThemes.find(
              (d) => d.sub_theme_id.toString() === String(st.id) || d.public_id === String(st.id),
            );
            if (match) {
              subIdBigInt = match.sub_theme_id;
            } else if (/^\d+$/.test(String(st.id))) {
              subIdBigInt = BigInt(st.id);
            }
          }

          const subData = {
            name: st.name.trim(),
            start_date: new Date(`${st.startDate}T00:00:00.000Z`),
            end_date: new Date(`${st.endDate}T00:00:00.000Z`),
            updated_at: new Date(),
          };

          if (subIdBigInt && existingSubIds.includes(subIdBigInt)) {
            await tx.subTheme.update({
              where: { sub_theme_id: subIdBigInt },
              data: subData,
            });
          } else {
            await tx.subTheme.create({
              data: {
                ...subData,
                theme_id: savedTheme.theme_id,
              },
            });
          }
        }
      }
    });

    return this.getThemeSetDetail({ year, ageGroup });
  }

  /**
   * List Goal Banks Overview grouped by grade from live PostgreSQL
   */
  async listGoalBanksOverview(query = {}) {
    const schoolYears = await prisma.schoolYear.findMany({
      where: { deleted_at: null },
      orderBy: { start_date: 'desc' },
      take: 5,
    });

    const targetYear = (query.year || query.schoolYear || '').replace('–', '-').trim();

    const allGoals = await prisma.educationalGoal.findMany({
      where: { deleted_at: null },
      include: {
        contents: {
          where: { deleted_at: null },
          select: { content_id: true },
        },
      },
    });

    const groups = AGE_GROUPS.map((g) => {
      let cards = schoolYears.map((sy) => {
        const yearName = sy.name.replace('Năm học ', '');
        const matchingGoals = allGoals.filter(
          (goal) => goal.school_year_id === sy.school_year_id && goal.age_group === g.dbKey
        );
        const uniqueDomains = new Set(matchingGoals.map((goal) => goal.domain)).size;

        const hasGoals = matchingGoals.length > 0;
        const allGoalsHaveContent = hasGoals && matchingGoals.every((goal) => (goal.contents || []).length > 0);
        const allGoalsApproved = hasGoals && matchingGoals.every((goal) => goal.is_approved);
        const isPublished = hasGoals && allGoalsHaveContent && allGoalsApproved;

        let status = 'DRAFT';
        let statusLabel = 'Chưa thiết lập';
        if (hasGoals) {
          if (isPublished) {
            status = 'PUBLISHED';
            statusLabel = 'Đã công bố';
          } else {
            status = 'DRAFT';
            statusLabel = 'Bản nháp';
          }
        }

        return {
          id: `gb-${g.key}-${yearName.replace('–', '-')}`,
          yearName,
          yearId: yearName.replace('–', '-'),
          schoolYearId: sy.school_year_id.toString(),
          ageGroup: g.key,
          ageGroupLabel: g.label,
          goalCount: matchingGoals.length,
          domainCount: uniqueDomains,
          status,
          statusLabel,
          updatedAt: matchingGoals.length > 0 ? 'Đã đồng bộ' : 'Chưa có dữ liệu',
        };
      });

      if (targetYear) {
        const filtered = cards.filter((c) => c.yearId === targetYear || c.yearName.replace('–', '-') === targetYear);
        if (filtered.length > 0) {
          cards = filtered;
        } else {
          const displayYear = targetYear.replace('-', '–');
          cards = [
            {
              id: `gb-${g.key}-${targetYear}`,
              yearName: displayYear,
              yearId: targetYear,
              ageGroup: g.key,
              ageGroupLabel: g.label,
              goalCount: 0,
              domainCount: 0,
              status: 'DRAFT',
              statusLabel: 'Chưa thiết lập',
              updatedAt: 'Chưa có dữ liệu',
            },
          ];
        }
      }

      return {
        key: g.key,
        label: g.label,
        cards,
      };
    });

    const donutOverview = AGE_GROUPS.map((g) => {
      const match = groups.find((grp) => grp.key === g.key);
      const card = match?.cards?.[0];
      const count = card?.goalCount ?? 0;
      return {
        key: g.key,
        label: g.label,
        total: count,
        breakdown: [
          `${card?.yearName || '2026–2027'}: ${count} mục tiêu`,
        ],
      };
    });

    const recentActivities = [
      { id: 'act1', type: 'UPDATE', text: 'Cập nhật ngân hàng mục tiêu giáo dục', time: 'Hôm nay' },
      { id: 'act2', type: 'PUBLISH', text: 'Công bố ngân hàng mục tiêu', time: 'Hôm nay' },
    ];

    return {
      groups,
      donutOverview,
      recentActivities,
    };
  }

  /**
   * Get Multilevel Objective Tree for a specific year and grade from live PostgreSQL
   */
  async getGoalBankDetail({ year = '2026–2027', ageGroup = 'nhatre' }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    const normalizedYear = (year || '2026–2027').replace('-', '–');
    const schoolYear = await this.resolveSchoolYear(year);
    const schoolYearId = schoolYear?.school_year_id;

    const dbGoals = await prisma.educationalGoal.findMany({
      where: {
        ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
        age_group: ageGroupInfo.dbKey,
        deleted_at: null,
      },
      include: {
        contents: { where: { deleted_at: null }, orderBy: { content_id: 'asc' } },
      },
      orderBy: { goal_id: 'asc' },
    });

    if (dbGoals && dbGoals.length > 0) {
      const domainMap = {
        PHYSICAL: { id: 'g1', code: '1.', title: 'Phát triển thể chất', domain: 'PHYSICAL', domainLabel: 'Thể chất', children: [] },
        COGNITIVE: { id: 'g2', code: '2.', title: 'Phát triển nhận thức', domain: 'COGNITIVE', domainLabel: 'Nhận thức', children: [] },
        LANGUAGE: { id: 'g3', code: '3.', title: 'Phát triển ngôn ngữ', domain: 'LANGUAGE', domainLabel: 'Ngôn ngữ', children: [] },
        SOCIO_EMOTIONAL: { id: 'g4', code: '4.', title: 'Phát triển tình cảm - KNXH', domain: 'SOCIO_EMOTIONAL', domainLabel: 'Tình cảm - KNXH', children: [] },
        AESTHETIC: { id: 'g5', code: '5.', title: 'Phát triển thẩm mỹ', domain: 'AESTHETIC', domainLabel: 'Thẩm mỹ', children: [] },
      };

      dbGoals.forEach((g) => {
        const target = domainMap[g.domain] || domainMap.PHYSICAL;
        target.children.push({
          id: g.public_id || g.goal_id.toString(),
          code: normalizeGoalCode(g.goal_code),
          indicatorCode: g.indicator_code || '',
          title: cleanGoalTitle(g.goal_code, g.title, ageGroupInfo.dbKey),
          domain: g.domain,
          domainLabel: target.domainLabel,
          type: 'Mục tiêu học tập',
          contentsCount: g.contents.length,
          contents: (g.contents || []).map((c) => ({
            id: c.public_id || c.content_id.toString(),
            title: c.title,
          })),
        });
      });

      const activeDomains = Object.values(domainMap)
        .map((d) => ({ ...d, count: d.children.length }))
        .filter((d) => d.children.length > 0);

      const allHaveContents = dbGoals.every((g) => (g.contents || []).length > 0);
      const allApproved = dbGoals.every((g) => g.is_approved);
      const isBankPublished = dbGoals.length > 0 && allHaveContents && allApproved;

      return {
        info: {
          year: normalizedYear,
          ageGroup: ageGroupInfo.key,
          ageGroupLabel: ageGroupInfo.label,
          status: isBankPublished ? 'PUBLISHED' : 'DRAFT',
          statusLabel: isBankPublished ? 'Đã công bố' : (dbGoals.length > 0 ? 'Bản nháp' : 'Chưa có dữ liệu'),
          totalGoals: dbGoals.length,
          domainCount: activeDomains.length,
          updatedAt: '13/10/2026',
        },
        tree: activeDomains,
      };
    }

    return {
      info: {
        year: normalizedYear,
        ageGroup: ageGroupInfo.key,
        ageGroupLabel: ageGroupInfo.label,
        status: 'DRAFT',
        statusLabel: 'Chưa có dữ liệu',
        totalGoals: 0,
        domainCount: 0,
        updatedAt: 'Chưa có dữ liệu',
      },
      tree: [],
    };
  }

  /**
   * Update publish status of a goal bank
   */
  async updateGoalBankStatus({ year = '2026–2027', ageGroup = 'nhatre', status = 'DRAFT' }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    const schoolYear = await this.resolveSchoolYear(year);
    const schoolYearId = schoolYear?.school_year_id;

    if (String(status).toUpperCase() === 'PUBLISHED') {
      // 1. Validate BR-80, BR-82, BR-205: Check that ALL goals in this framework have at least one educational content
      const goalsInFramework = await prisma.educationalGoal.findMany({
        where: {
          ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
        include: {
          contents: { where: { deleted_at: null } },
        },
      });

      if (!goalsInFramework || goalsInFramework.length === 0) {
        throw new BadRequest('Khung giáo dục chưa có mục tiêu nào để xuất bản.');
      }

      const emptyGoals = goalsInFramework.filter((g) => !g.contents || g.contents.length === 0);
      if (emptyGoals.length > 0) {
        throw new BadRequest(
          'Không thể xuất bản khung giáo dục vì một hoặc nhiều mục tiêu giáo dục chưa có nội dung giáo dục.'
        );
      }

      // Mark all goals as approved (published)
      await prisma.educationalGoal.updateMany({
        where: {
          ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
        data: {
          is_approved: true,
          updated_at: new Date(),
        },
      });

      // Notification 14: Publish Education Framework (BGH công bố khung giáo dục -> GV thuộc độ tuổi/khối)
      (async () => {
        try {
          const teacherAccountIds = await notificationService.getGradeTeacherAccountIds(
            ageGroupInfo.dbKey,
            schoolYearId,
          );
          if (teacherAccountIds.length > 0) {
            await notificationService.emitSystemNotification({
              recipientAccountIds: teacherAccountIds,
              type: 'SCHOOL_ANNOUNCEMENT',
              title: `Công bố khung giáo dục: ${ageGroupInfo.label}`,
              body: `Ban Giám Hiệu đã công bố khung ngân hàng mục tiêu giáo dục cho ${ageGroupInfo.label} (Năm học ${year}).`,
              data: {
                type: 'EDUCATION_FRAMEWORK_PUBLISHED',
                ageGroup: ageGroupInfo.key,
                year,
              },
            });
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit notification for goal bank publish');
        }
      })();
    } else {
      // Unpublish: set is_approved to false (DRAFT)
      await prisma.educationalGoal.updateMany({
        where: {
          ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
        data: {
          is_approved: false,
          updated_at: new Date(),
        },
      });
    }

    return this.getGoalBankDetail({ year, ageGroup });
  }

  /**
   * Get single educational goal detail along with its educational contents from live PostgreSQL
   */
  async getSingleGoalDetail({ year = '2026–2027', ageGroup = 'nhatre', goalId }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    const normalizedYear = (year || '2026–2027').replace('-', '–');
    const schoolYear = await this.resolveSchoolYear(year);
    const schoolYearId = schoolYear?.school_year_id;

    let gId = null;
    const isUuid = typeof goalId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(goalId);
    if (goalId && !isNaN(Number(goalId)) && !isUuid) {
      gId = BigInt(goalId);
    }

    // Tester_24+1 Item 9: Ensure UUID lookup queries ONLY by public_id directly without normalizing UUID strings as goal codes
    let dbGoal = null;
    if (isUuid) {
      dbGoal = await prisma.educationalGoal.findFirst({
        where: {
          public_id: goalId,
          ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
        include: {
          contents: { where: { deleted_at: null }, orderBy: { content_id: 'asc' } },
        },
      });
    } else if (gId) {
      dbGoal = await prisma.educationalGoal.findFirst({
        where: {
          goal_id: gId,
          ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
        include: {
          contents: { where: { deleted_at: null }, orderBy: { content_id: 'asc' } },
        },
      });
    } else {
      const normCode = normalizeGoalCode(goalId);
      const compactCode = normCode ? normCode.replace(/\s+/g, '') : '';
      dbGoal = await prisma.educationalGoal.findFirst({
        where: {
          OR: [
            { goal_code: goalId },
            normCode ? { goal_code: normCode } : undefined,
            compactCode ? { goal_code: compactCode } : undefined,
            compactCode ? { goal_code: compactCode.replace(/^MT0?/, 'PT ') } : undefined,
            compactCode ? { goal_code: compactCode.replace(/^MT0?/, 'PT') } : undefined,
          ].filter(Boolean),
          ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
        include: {
          contents: { where: { deleted_at: null }, orderBy: { content_id: 'asc' } },
        },
      });
    }

    if (!dbGoal) {
      throw new NotFound('Không tìm thấy mục tiêu giáo dục trong cơ sở dữ liệu.');
    }

    const allDbGoals = await prisma.educationalGoal.findMany({
      where: {
        ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
        age_group: ageGroupInfo.dbKey,
        deleted_at: null,
      },
      include: { contents: true },
      orderBy: { goal_id: 'asc' },
    });

    const allGoals = allDbGoals.map((g) => ({
      id: g.public_id || g.goal_id.toString(),
      code: normalizeGoalCode(g.goal_code),
      indicatorCode: g.indicator_code || '',
      title: cleanGoalTitle(g.goal_code, g.title, ageGroupInfo.dbKey),
      domain: g.domain,
      contentsCount: g.contents.length,
    }));

    const contents = dbGoal.contents.map((c) => ({
      id: c.public_id || c.content_id.toString(),
      title: c.title,
    }));

    const domainLabels = {
      PHYSICAL: 'Phát triển thể chất',
      COGNITIVE: 'Phát triển nhận thức',
      LANGUAGE: 'Phát triển ngôn ngữ',
      SOCIO_EMOTIONAL: 'Phát triển tình cảm - KNXH',
      AESTHETIC: 'Phát triển thẩm mỹ',
    };

    return {
      info: {
        year: normalizedYear,
        ageGroup: ageGroupInfo.key,
        ageGroupLabel: ageGroupInfo.label,
      },
      goal: {
        id: dbGoal.public_id || dbGoal.goal_id.toString(),
        code: normalizeGoalCode(dbGoal.goal_code),
        indicatorCode: dbGoal.indicator_code || '',
        title: cleanGoalTitle(dbGoal.goal_code, dbGoal.title, ageGroupInfo.dbKey),
        domain: dbGoal.domain,
        domainLabel: domainLabels[dbGoal.domain] || 'Phát triển thể chất',
        contentsCount: contents.length,
      },
      allGoals,
      contents,
    };
  }

  /**
   * Update educational contents of a specific goal in PostgreSQL
   */
  async updateGoalContents({ year = '2026–2027', ageGroup = 'nhatre', goalId, contents = [] }) {
    if (!goalId) {
      throw new BadRequest('Mã mục tiêu giáo dục không hợp lệ.');
    }

    let targetGoal = null;
    const strGoal = String(goalId).trim();
    if (/^\d+$/.test(strGoal)) {
      targetGoal = await prisma.educationalGoal.findFirst({ where: { goal_id: BigInt(strGoal) } });
    } else if (isUuid(strGoal)) {
      targetGoal = await prisma.educationalGoal.findFirst({ where: { public_id: strGoal } });
    } else {
      targetGoal = await prisma.educationalGoal.findFirst({ where: { goal_code: strGoal } });
    }
    if (!targetGoal) {
      throw new NotFound('Không tìm thấy mục tiêu giáo dục.');
    }

    const gId = targetGoal.goal_id;

    // Get current active contents in DB
    const currentDbContents = await prisma.educationalContent.findMany({
      where: { goal_id: gId, deleted_at: null },
      orderBy: { content_id: 'asc' },
    });

    const receivedContents = Array.isArray(contents) ? contents : [];

    // BR duplicate check: normalize by trimming and replacing multiple whitespaces
    const normalizeContentTitle = (t) => (t || '').trim().replace(/\s+/g, ' ').toLowerCase();

    // 1. Check duplicate within receivedContents
    const seenTitles = new Set();
    for (const item of receivedContents) {
      const rawTitle = item.title?.trim();
      if (!rawTitle) continue;
      const normalized = normalizeContentTitle(rawTitle);
      if (seenTitles.has(normalized)) {
        throw new BadRequest('Nội dung giáo dục này đã tồn tại trong khung giáo dục. Vui lòng nhập nội dung khác.');
      }
      seenTitles.add(normalized);
    }

    // 2. Check duplicate across the ENTIRE education framework (all goals with same school_year_id and age_group)
    const frameworkContents = await prisma.educationalContent.findMany({
      where: {
        deleted_at: null,
        goal: {
          school_year_id: targetGoal.school_year_id,
          age_group: targetGoal.age_group,
          deleted_at: null,
        },
      },
      select: {
        content_id: true,
        public_id: true,
        goal_id: true,
        title: true,
      },
    });

    for (const item of receivedContents) {
      const title = item.title?.trim();
      if (!title) continue;
      const normalized = normalizeContentTitle(title);
      const itemIdStr = item.id ? String(item.id).trim() : '';

      const matchingDb = currentDbContents.find((c) => {
        if (!itemIdStr) return false;
        if (c.public_id && c.public_id.toLowerCase() === itemIdStr.toLowerCase()) return true;
        if (c.content_id.toString() === itemIdStr) return true;
        return false;
      });

      const duplicateInFramework = frameworkContents.find((c) => {
        if (matchingDb && c.content_id === matchingDb.content_id) return false;
        return normalizeContentTitle(c.title) === normalized;
      });

      if (duplicateInFramework) {
        throw new BadRequest('Nội dung giáo dục này đã tồn tại trong khung giáo dục. Vui lòng nhập nội dung khác.');
      }
    }

    const keptDbContentIds = new Set();

    for (const item of receivedContents) {
      const title = item.title?.trim();
      if (!title) continue;

      const itemIdStr = item.id ? String(item.id).trim() : '';
      const matchingDb = currentDbContents.find((c) => {
        if (!itemIdStr) return false;
        if (c.public_id && c.public_id.toLowerCase() === itemIdStr.toLowerCase()) return true;
        if (c.content_id.toString() === itemIdStr) return true;
        return false;
      });

      if (matchingDb) {
        keptDbContentIds.add(matchingDb.content_id.toString());
        if (matchingDb.title !== title) {
          await prisma.educationalContent.update({
            where: { content_id: matchingDb.content_id },
            data: { title },
          });
        }
      } else {
        await prisma.educationalContent.create({
          data: {
            goal_id: gId,
            title,
          },
        });
      }
    }

    // Soft-delete removed contents
    for (const c of currentDbContents) {
      if (!keptDbContentIds.has(c.content_id.toString())) {
        await prisma.educationalContent.update({
          where: { content_id: c.content_id },
          data: { deleted_at: new Date() },
        });
      }
    }

    const updated = await prisma.educationalContent.findMany({
      where: { goal_id: gId, deleted_at: null },
      orderBy: { content_id: 'asc' },
    });

    if (updated.length === 0 && targetGoal.is_approved) {
      await prisma.educationalGoal.update({
        where: { goal_id: gId },
        data: { is_approved: false, updated_at: new Date() },
      });
    }

    return {
      success: true,
      goalId,
      contents: updated.map((c) => ({ id: c.public_id || c.content_id.toString(), title: c.title })),
      updatedAt: new Date().toLocaleDateString('vi-VN'),
    };
  }

  /**
   * Create educational goal item in PostgreSQL
   */
  async createGoal({ year = '2026–2027', ageGroup = 'nhatre', data = {} }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    const schoolYear = await this.resolveSchoolYear(year);
    const schoolYearId = schoolYear?.school_year_id || 1n;

    const goalTitle = (data.title || '').trim();
    if (!goalTitle) {
      throw new BadRequest('Nội dung mục tiêu không được để trống.');
    }

    // Kiểm tra trùng lặp nội dung mục tiêu trên toàn bộ ngân hàng mục tiêu của cùng nhóm tuổi/năm học (bất kể lĩnh vực phát triển)
    const duplicateGoal = await prisma.educationalGoal.findFirst({
      where: {
        school_year_id: schoolYearId,
        age_group: ageGroupInfo.dbKey,
        title: { equals: goalTitle, mode: 'insensitive' },
        deleted_at: null,
      },
    });

    if (duplicateGoal) {
      throw new BadRequest('Mục tiêu đã tồn tại trong ngân hàng mục tiêu. Vui lòng kiểm tra hoặc nhập nội dung khác.');
    }

    let goalCode = '';
    if (data.code && String(data.code).trim()) {
      goalCode = normalizeGoalCode(data.code);
    }

    if (!goalCode) {
      const existingGoals = await prisma.educationalGoal.findMany({
        where: {
          school_year_id: schoolYearId,
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
        select: { goal_code: true },
      });
      let maxNum = 0;
      for (const eg of existingGoals) {
        const m = String(eg.goal_code || '').match(/\d+/);
        if (m) {
          const val = parseInt(m[0], 10);
          if (!isNaN(val) && val > maxNum) maxNum = val;
        }
      }
      const codeNumber = maxNum > 0 ? maxNum + 1 : existingGoals.length + 1;
      const padNumber = codeNumber < 10 ? '0' + codeNumber : `${codeNumber}`;
      goalCode = `MT ${padNumber}`;
    }

    const created = await prisma.educationalGoal.create({
      data: {
        school_year_id: schoolYearId,
        age_group: ageGroupInfo.dbKey,
        goal_code: goalCode,
        indicator_code: data.indicatorCode?.trim() || null,
        title: data.title?.trim() || 'Mục tiêu giáo dục mới',
        domain: data.domain || 'PHYSICAL',
      },
    });

    return {
      success: true,
      goal: {
        id: created.public_id || created.goal_id.toString(),
        code: created.goal_code,
        indicatorCode: created.indicator_code || '',
        title: created.title,
        domain: created.domain,
        type: 'Mục tiêu học tập',
        contentsCount: 0,
        contents: [],
      },
    };
  }

  /**
   * Update educational goal item in PostgreSQL
   */
  async updateGoal({ year = '2026–2027', ageGroup = 'nhatre', goalId, data = {} }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    let targetGoal = null;
    const strGoal = String(goalId || '').trim();

    if (/^\d+$/.test(strGoal)) {
      targetGoal = await prisma.educationalGoal.findFirst({
        where: { goal_id: BigInt(strGoal), deleted_at: null },
      });
    } else if (isUuid(strGoal)) {
      targetGoal = await prisma.educationalGoal.findFirst({
        where: { public_id: strGoal, deleted_at: null },
      });
    } else {
      const numMatch = strGoal.match(/\d+/);
      const num = numMatch ? parseInt(numMatch[0], 10) : null;
      const variations = [
        strGoal,
        strGoal.replace(/\s+/g, '').toUpperCase(),
        num !== null ? `MT ${num}` : null,
        num !== null ? `MT ${String(num).padStart(2, '0')}` : null,
        num !== null ? `MT${String(num).padStart(2, '0')}` : null,
        num !== null ? `MT${num}` : null,
      ].filter(Boolean);

      targetGoal = await prisma.educationalGoal.findFirst({
        where: {
          goal_code: { in: variations },
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
      });
    }

    if (targetGoal) {
      const updateData = { updated_at: new Date() };
      if (data.title !== undefined) {
        const goalTitle = (data.title || '').trim();
        if (!goalTitle) {
          throw new BadRequest('Nội dung mục tiêu không được để trống.');
        }

        const duplicateGoal = await prisma.educationalGoal.findFirst({
          where: {
            school_year_id: targetGoal.school_year_id,
            age_group: targetGoal.age_group,
            goal_id: { not: targetGoal.goal_id },
            title: { equals: goalTitle, mode: 'insensitive' },
            deleted_at: null,
          },
        });

        if (duplicateGoal) {
          throw new BadRequest('Mục tiêu đã tồn tại trong ngân hàng mục tiêu. Vui lòng kiểm tra hoặc nhập nội dung khác.');
        }

        updateData.title = goalTitle;
      }
      if (data.indicatorCode !== undefined) updateData.indicator_code = data.indicatorCode?.trim() || null;
      if (data.domain) updateData.domain = data.domain;

      await prisma.educationalGoal.update({
        where: { goal_id: targetGoal.goal_id },
        data: updateData,
      });
    }

    return { success: true, goal: { id: goalId, ...data } };
  }

  /**
   * Delete educational goal item from PostgreSQL
   */
  async deleteGoal({ year = '2026–2027', ageGroup = 'nhatre', goalId }) {
    const ageGroupInfo = AGE_GROUPS.find((g) => g.key === ageGroup) || AGE_GROUPS[0];
    let targetGoal = null;
    const strGoal = String(goalId || '').trim();

    if (/^\d+$/.test(strGoal)) {
      targetGoal = await prisma.educationalGoal.findFirst({
        where: { goal_id: BigInt(strGoal), deleted_at: null },
      });
    } else if (isUuid(strGoal)) {
      targetGoal = await prisma.educationalGoal.findFirst({
        where: { public_id: strGoal, deleted_at: null },
      });
    } else {
      const numMatch = strGoal.match(/\d+/);
      const num = numMatch ? parseInt(numMatch[0], 10) : null;
      const variations = [
        strGoal,
        strGoal.replace(/\s+/g, '').toUpperCase(),
        num !== null ? `MT ${num}` : null,
        num !== null ? `MT ${String(num).padStart(2, '0')}` : null,
        num !== null ? `MT${String(num).padStart(2, '0')}` : null,
        num !== null ? `MT${num}` : null,
      ].filter(Boolean);

      targetGoal = await prisma.educationalGoal.findFirst({
        where: {
          goal_code: { in: variations },
          age_group: ageGroupInfo.dbKey,
          deleted_at: null,
        },
      });
    }

    if (targetGoal) {
      await prisma.educationalGoal.update({
        where: { goal_id: targetGoal.goal_id },
        data: { deleted_at: new Date() },
      });
    }

    return { success: true, goalId };
  }

  /**
   * AI Assistant logic for Goal Bank
   */
  async queryAiAssistant({ prompt, action, context = {} }) {
    return {
      reply: 'Đã phân tích mục tiêu giáo dục theo chương trình mầm non chuẩn.',
      proposals: [],
    };
  }

  /**
   * Xuất Khung Chương trình & Mục tiêu Giáo dục Mầm non đa sheet ra Excel
   */
  async exportEducationalFrameworkExcel({ year, schoolYearId }) {
    const schoolYear = await this.resolveSchoolYear(year || schoolYearId);
    const syId = schoolYear?.school_year_id;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hệ thống Mầm non Sorak';
    workbook.lastModifiedBy = 'Hệ thống Mầm non Sorak';
    workbook.created = new Date();
    workbook.modified = new Date();

    const domainLabels = {
      PHYSICAL: 'Phát triển Thể chất',
      COGNITIVE: 'Phát triển Nhận thức',
      LANGUAGE: 'Phát triển Ngôn ngữ',
      SOCIO_EMOTIONAL: 'Phát triển Tình cảm & Kỹ năng xã hội',
      AESTHETIC: 'Phát triển Thẩm mỹ',
    };

    const sheetConfigs = [
      { key: 'nhatre', dbKey: 'NHA_TRE', sheetName: 'Khối Nhà Trẻ (12-36T)', title: 'KHUNG MỤC TIÊU GIÁO DỤC - KHỐI NHÀ TRẺ (12-36 THÁNG)' },
      { key: 'mam', dbKey: 'MAM', sheetName: 'Khối Mầm (3-4T)', title: 'KHUNG MỤC TIÊU GIÁO DỤC - KHỐI LỚP MẦM (3-4 TUỔI)' },
      { key: 'choi', dbKey: 'CHOI', sheetName: 'Khối Chồi (4-5T)', title: 'KHUNG MỤC TIÊU GIÁO DỤC - KHỐI LỚP CHỒI (4-5 TUỔI)' },
      { key: 'la', dbKey: 'LA', sheetName: 'Khối Lá (5-6T)', title: 'KHUNG MỤC TIÊU GIÁO DỤC - KHỐI LỚP LÁ (5-6 TUỔI)' },
    ];

    for (const cfg of sheetConfigs) {
      const worksheet = workbook.addWorksheet(cfg.sheetName, {
        views: [{ showGridLines: true }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      });

      const goals = await prisma.educationalGoal.findMany({
        where: {
          age_group: cfg.dbKey,
          deleted_at: null,
          ...(syId ? { school_year_id: syId } : {}),
        },
        include: {
          contents: {
            where: { deleted_at: null },
            orderBy: { content_id: 'asc' },
          },
        },
        orderBy: [{ domain: 'asc' }, { goal_code: 'asc' }, { goal_id: 'asc' }],
      });

      const totalCols = 7;
      const subtitle = `Căn cứ Thông tư 51/2020/TT-BGDĐT | Năm học: ${schoolYear?.name || '2026-2027'} | Đơn vị: Trường Mầm non Sorak | Tổng số: ${goals.length} mục tiêu giáo dục`;

      const startRow = addSchoolHeaderBanner(worksheet, {
        title: cfg.title,
        subtitle,
        totalCols,
      });

      const headerRow = worksheet.addRow([
        'STT',
        'Lĩnh vực phát triển',
        'Mã mục tiêu (MT)',
        'Chỉ số Bộ chuẩn',
        'Mục tiêu giáo dục (Kết quả mong đợi)',
        'Nội dung giáo dục chi tiết',
        'Trạng thái',
      ]);
      applyHeaderStyles(headerRow);

      goals.forEach((g, idx) => {
        const contentsText = (g.contents || [])
          .map((c, i) => `${i + 1}. ${c.title}`)
          .join('\n') || 'Đang cập nhật nội dung';

        const row = worksheet.addRow([
          idx + 1,
          domainLabels[g.domain] || g.domain,
          g.goal_code || `MT ${idx + 1}`,
          g.indicator_code || '—',
          g.title,
          contentsText,
          g.is_approved ? 'Đã duyệt' : 'Bản nháp',
        ]);

        row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
        row.getCell(2).alignment = { horizontal: 'left', vertical: 'top' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'top' };
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'top' };
        row.getCell(5).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        row.getCell(6).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'top' };

        if (g.is_approved) {
          row.getCell(7).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
        }
      });

      applyZebraRows(worksheet, startRow + 1, goals.length);
      autoFitColumns(worksheet);

      worksheet.getColumn(5).width = 42;
      worksheet.getColumn(6).width = 50;
    }

    return await workbook.xlsx.writeBuffer();
  }
}

export const curriculumService = new CurriculumService();
export default curriculumService;
