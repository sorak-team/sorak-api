import prisma from '../config/prisma.js';
import { BadRequest, NotFound } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { cleanGoalTitle, normalizeGoalCode } from '../utils/goal-sanitizer.js';

// Pedagogical Age Group configurations
const AGE_GROUPS = [
  { key: 'nhatre', label: 'Khối Nhà trẻ', dbKey: 'NHA_TRE', ageRange: '12–36 tháng' },
  { key: 'mam', label: 'Khối Mầm', dbKey: 'MAM', ageRange: '3–4 tuổi' },
  { key: 'choi', label: 'Khối Chồi', dbKey: 'CHOI', ageRange: '4–5 tuổi' },
  { key: 'la', label: 'Khối Lá', dbKey: 'LA', ageRange: '5–6 tuổi' },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val.trim());

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

      // 2. Phải đủ chủ đề nhánh cho các chủ đề
      for (const t of dbThemes) {
        const subs = t.sub_themes || [];
        if (subs.length === 0) {
          throw new BadRequest(
            `Chủ đề "${t.name}" chưa có chủ đề nhánh nào. Mọi chủ đề phải có đủ chủ đề nhánh trước khi công bố.`,
          );
        }

        const tStart = t.start_date.toISOString().slice(0, 10);
        const tEnd = t.end_date.toISOString().slice(0, 10);
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

        for (let k = 1; k < subs.length; k++) {
          const prevSubEnd = new Date(subs[k - 1].end_date);
          const currSubStart = new Date(subs[k].start_date);
          const diffDays = Math.round((currSubStart - prevSubEnd) / (1000 * 60 * 60 * 24));
          if (diffDays > 3) {
            throw new BadRequest(
              `Chủ đề "${t.name}": Chủ đề nhánh bị ngắt quãng giữa "${subs[k - 1].name}" và "${subs[k].name}".`,
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

      // Quy tắc 2: Không đè lên chủ đề trước
      if (i > 0) {
        const prevT = targetThemes[i - 1];
        const prevName = prevT.name?.trim() || `Chủ đề ${i}`;
        if (t.startDate <= prevT.endDate) {
          throw new BadRequest(
            `Chủ đề "${tName}" bắt đầu ngày ${t.startDate} bị trùng hoặc đi trước ngày kết thúc của chủ đề trước "${prevName}" (${prevT.endDate}).`,
          );
        }
      }

      // Quy tắc 3: Kiểm tra các nhánh con (subThemes)
      const subs = Array.isArray(t.subThemes) ? t.subThemes : [];
      if (subs.length > 0) {
        // Nhánh đầu tiên phải khớp với mốc bắt đầu của chủ đề chính
        if (subs[0].startDate && subs[0].startDate !== t.startDate) {
          throw new BadRequest(
            `Chủ đề "${tName}": Nhánh đầu tiên ("${subs[0].name}") phải bắt đầu từ ngày bắt đầu chủ đề chính (${t.startDate}).`,
          );
        }

        // Nhánh cuối cùng phải kết thúc đúng ngày kết thúc của chủ đề chính
        const lastSub = subs[subs.length - 1];
        if (lastSub.endDate && lastSub.endDate !== t.endDate) {
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

          // Nhánh sau không được đè lên nhánh trước
          if (k > 0) {
            const prevSt = subs[k - 1];
            const prevStName = prevSt.name?.trim() || `Nhánh ${k}`;
            if (st.startDate <= prevSt.endDate) {
              throw new BadRequest(
                `Chủ đề nhánh "${stName}" bắt đầu ngày ${st.startDate} bị trùng hoặc đè lên nhánh trước "${prevStName}" (kết thúc ${prevSt.endDate}).`,
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
        const themeData = {
          name: t.name.trim(),
          start_date: new Date(`${t.startDate}T00:00:00.000Z`),
          end_date: new Date(`${t.endDate}T00:00:00.000Z`),
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
    });

    const groups = AGE_GROUPS.map((g) => {
      let cards = schoolYears.map((sy) => {
        const yearName = sy.name.replace('Năm học ', '');
        const matchingGoals = allGoals.filter(
          (goal) => goal.school_year_id === sy.school_year_id && goal.age_group === g.dbKey
        );
        const uniqueDomains = new Set(matchingGoals.map((goal) => goal.domain)).size;

        return {
          id: `gb-${g.key}-${yearName.replace('–', '-')}`,
          yearName,
          yearId: yearName.replace('–', '-'),
          schoolYearId: sy.school_year_id.toString(),
          ageGroup: g.key,
          ageGroupLabel: g.label,
          goalCount: matchingGoals.length,
          domainCount: uniqueDomains,
          status: matchingGoals.length > 0 ? 'PUBLISHED' : 'DRAFT',
          statusLabel: matchingGoals.length > 0 ? 'Đã công bố' : 'Chưa thiết lập',
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
          code: g.goal_code,
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

      return {
        info: {
          year: normalizedYear,
          ageGroup: ageGroupInfo.key,
          ageGroupLabel: ageGroupInfo.label,
          status: 'PUBLISHED',
          statusLabel: 'Đã công bố',
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

    const normCode = normalizeGoalCode(goalId);
    const dbGoal = await prisma.educationalGoal.findFirst({
      where: {
        OR: [
          isUuid ? { public_id: goalId } : undefined,
          gId ? { goal_id: gId } : undefined,
          { goal_code: goalId },
          normCode ? { goal_code: normCode } : undefined,
          normCode ? { goal_code: normCode.replace(/^MT0?/, 'PT ') } : undefined,
          normCode ? { goal_code: normCode.replace(/^MT0?/, 'PT') } : undefined,
        ].filter(Boolean),
        ...(schoolYearId ? { school_year_id: schoolYearId } : {}),
        age_group: ageGroupInfo.dbKey,
        deleted_at: null,
      },
      include: {
        contents: { where: { deleted_at: null }, orderBy: { content_id: 'asc' } },
      },
    });

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
      code: g.goal_code,
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
        code: dbGoal.goal_code,
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

    const totalExisting = await prisma.educationalGoal.count({
      where: {
        school_year_id: schoolYearId,
        age_group: ageGroupInfo.dbKey,
        deleted_at: null,
      },
    });
    const codeNumber = totalExisting + 1;
    const goalCode = `MT${codeNumber < 10 ? '0' + codeNumber : codeNumber}`;

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
      if (data.title !== undefined) updateData.title = data.title?.trim();
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
}

export const curriculumService = new CurriculumService();
export default curriculumService;
