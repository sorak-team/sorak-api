import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

const AGE_GROUPS = [
  { key: 'nhatre', label: 'Khối Nhà trẻ', dbKey: 'NHA_TRE' },
  { key: 'mam', label: 'Khối Mầm', dbKey: 'MAM' },
  { key: 'choi', label: 'Khối Chồi', dbKey: 'CHOI' },
  { key: 'la', label: 'Khối Lá', dbKey: 'LA' },
];

export class CurriculumService {
  _parseId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
  }

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
}
export const curriculumService = new CurriculumService();
export default curriculumService;
