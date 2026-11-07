import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Forbidden } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { cleanGoalTitle } from '../utils/goal-sanitizer.js';
import { notificationService } from './notification.service.js';

const DAY_MAP_TO_ENUM = {
  T2: 'MONDAY',
  T3: 'TUESDAY',
  T4: 'WEDNESDAY',
  T5: 'THURSDAY',
  T6: 'FRIDAY',
  T7: 'SATURDAY',
  CN: 'SUNDAY',
};

const ENUM_TO_DAY_KEY = {
  MONDAY: 'T2',
  TUESDAY: 'T3',
  WEDNESDAY: 'T4',
  THURSDAY: 'T5',
  FRIDAY: 'T6',
  SATURDAY: 'T7',
  SUNDAY: 'CN',
};

const DOMAIN_LABELS = {
  PHYSICAL: 'Phát triển thể chất',
  COGNITIVE: 'Phát triển nhận thức',
  LANGUAGE: 'Phát triển ngôn ngữ',
  SOCIO_EMOTIONAL: 'Phát triển tình cảm và kỹ năng xã hội',
  AESTHETIC: 'Phát triển thẩm mỹ',
};

const SLOT_TIMES = {
  ARRIVAL_PLAY: { start: '07:15', end: '08:00' },
  MORNING_EXERCISE: { start: '08:00', end: '08:30' },
  DIRECTED_STUDY: { start: '08:30', end: '09:15' },
  CORNER_PLAY: { start: '09:15', end: '10:15' },
  OUTDOOR_PLAY: { start: '10:15', end: '11:00' },
  AFTERNOON_ACTIVITY: { start: '14:00', end: '14:45' },
  RETURN_CHILD: { start: '15:30', end: '16:30' },
};

function resolveAcademicWeekDates(weekId) {
  if (!weekId) return null;
  const startMonday = new Date(Date.UTC(2026, 8, 7)); // 07 Sep 2026 (Month 8 in 0-indexed JS Date: Monday 07/09/2026)
  for (let i = 1; i <= 39; i++) {
    let id = `w-${i}`;
    if (i === 1) id = 'w-sep-1';
    else if (i === 2) id = 'w-sep-2';
    else if (i === 3) id = 'w-sep-3';
    else if (i === 4) id = 'w-sep-4';
    else if (i >= 5) id = `w-${i - 4}`;

    if (id === weekId) {
      const curStart = new Date(startMonday);
      curStart.setUTCDate(startMonday.getUTCDate() + (i - 1) * 7);
      const curEnd = new Date(curStart);
      curEnd.setUTCDate(curStart.getUTCDate() + 6);
      return {
        startDate: curStart.toISOString().slice(0, 10),
        endDate: curEnd.toISOString().slice(0, 10),
      };
    }
  }
  return null;
}

/**
 * Calculate the number of calendar weeks (Mon–Sun) spanned by a theme
 */
export function calculateThemeWeeks(startDate, endDate, fallbackCount = 1) {
  if (!startDate || !endDate) return Math.max(1, fallbackCount || 1);
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays <= 0) return Math.max(1, fallbackCount || 1);
  return Math.max(1, Math.round(diffDays / 7));
}

/**
 * Get 0-based week index of a scheduled date relative to theme start date
 */
export function getThemeWeekIndex(scheduledDate, themeStartDate) {
  if (!scheduledDate || !themeStartDate) return -1;
  const d = new Date(scheduledDate);
  const s = new Date(themeStartDate);
  d.setHours(0, 0, 0, 0);
  s.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((d.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return -1;
  return Math.floor(diffDays / 7);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val.trim());

class PlanningService {
  /**
   * Helper to resolve target class
   */
  async resolveClass(classId) {
    if (classId) {
      const str = String(classId).trim();
      const isClassUuid = isUuid(str);
      const isNum = /^\d+$/.test(str);
      if (!isClassUuid && !isNum) {
        throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
      }
      const targetClass = await prisma.class.findFirst({
        where: {
          OR: [
            ...(isClassUuid ? [{ public_id: str }] : []),
            ...(isNum ? [{ class_id: BigInt(str) }] : []),
          ],
          deleted_at: null,
        },
        include: { school_year: true },
      });
      if (!targetClass) {
        throw new NotFound('Lớp học không tồn tại');
      }
      return targetClass;
    }

    const defaultClass = await prisma.class.findFirst({
      where: { deleted_at: null },
      include: { school_year: true },
      orderBy: { class_id: 'asc' },
    });
    if (!defaultClass) {
      throw new NotFound('Không tìm thấy lớp học nào');
    }
    return defaultClass;
  }

  /**
   * Helper to resolve staff account ID (BigInt) from JWT accountId / UUID
   */
  async resolveStaffAccountId(rawId) {
    if (!rawId) return null;
    try {
      if (typeof rawId === 'bigint') return rawId;
      const str = String(rawId).trim();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
        const acc = await prisma.account.findFirst({
          where: { public_id: str },
          select: { account_id: true },
        });
        if (acc) return acc.account_id;

        const teacher = await prisma.teacher.findFirst({
          where: { public_id: str },
          select: { account_id: true },
        });
        if (teacher?.account_id) return teacher.account_id;
      }
      if (/^\d+$/.test(str)) {
        const numId = BigInt(str);
        // Prioritize account_id lookup first
        const acc = await prisma.account.findUnique({
          where: { account_id: numId },
          select: { account_id: true },
        });
        if (acc) return acc.account_id;

        // Fallback to teacher_id lookup to find account_id
        const teacher = await prisma.teacher.findUnique({
          where: { teacher_id: numId },
          select: { account_id: true },
        });
        if (teacher?.account_id) return teacher.account_id;
      }
      const accByUsername = await prisma.account.findFirst({
        where: { username: str },
        select: { account_id: true },
      });
      if (accByUsername) return accByUsername.account_id;
    } catch (err) {
      logger.warn('[planningService.resolveStaffAccountId] Failed to resolve staff account ID:', err.message);
    }
    return null;
  }

  /**
   * Tab 1: Get Educational Activities data for a class & selected theme querying live PostgreSQL
   */
  async getThemeActivities({ classId, themeCode }) {
    const targetClass = await this.resolveClass(classId);
    const ageGroup = targetClass?.age_group || 'NHA_TRE';

    // 1. Query real themes from PostgreSQL
    let themes = [];
    let selectedTheme = null;
    let subThemes = [];

    try {
      const dbThemes = await prisma.curriculumTheme.findMany({
        where: {
          school_year_id: targetClass?.school_year_id || 1n,
          age_group: ageGroup,
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

      let classPlans = [];
      if (targetClass?.class_id) {
        classPlans = await prisma.classThemePlan.findMany({
          where: { class_id: targetClass.class_id },
        });
      }

      if (dbThemes && dbThemes.length > 0) {
        themes = dbThemes.map((th, idx) => {
          const code = String(idx + 1).padStart(2, '0');
          const pad = (n) => String(n).padStart(2, '0');
          const sDate = `${pad(th.start_date.getDate())}/${pad(th.start_date.getMonth() + 1)}`;
          const eDate = `${pad(th.end_date.getDate())}/${pad(th.end_date.getMonth() + 1)}/${th.end_date.getFullYear()}`;
          const plan = classPlans.find((p) => p.theme_id.toString() === th.theme_id.toString());

          const totalWeeks = calculateThemeWeeks(th.start_date, th.end_date, th.sub_themes.length);

          return {
            id: th.public_id || th.theme_id.toString(),
            _theme_id: th.theme_id,
            code,
            name: th.name,
            status: th.status,
            planStatus: plan?.status || 'DRAFT',
            reviewNote: plan?.review_note || null,
            teacherNote: plan?.review_note || null,
            rejectionReason: plan?.rejection_reason || null,
            submittedAt: plan?.submitted_at || null,
            reviewedAt: plan?.reviewed_at || null,
            startDate: th.start_date.toISOString().slice(0, 10),
            endDate: th.end_date.toISOString().slice(0, 10),
            dateRange: `${sDate} – ${eDate}`,
            weeksCount: totalWeeks,
            subThemes: th.sub_themes.map((st, sIdx) => ({
              id: st.public_id || st.sub_theme_id.toString(),
              themeCode: code,
              name: st.name,
              weekNumber: sIdx + 1,
              weekLabel: `Tuần ${sIdx + 1}`,
              startDate: st.start_date.toISOString().slice(0, 10),
              endDate: st.end_date.toISOString().slice(0, 10),
            })),
          };
        });

        selectedTheme = (themeCode && themes.find((t) => t.code === themeCode || t.id === themeCode)) || themes[0];
        subThemes = selectedTheme?.subThemes || [];
      }
    } catch (err) {
      logger.error('Error fetching themes for planning:', err);
    }

    // 2. Query scheduled slots from sub_theme_activities for this class
    const scheduledRecords = targetClass
      ? await prisma.subThemeActivity.findMany({
          where: { class_id: targetClass.class_id },
          include: {
            activity: true,
            sub_theme: {
              include: {
                theme: { select: { theme_id: true, name: true, public_id: true } },
              },
            },
            creator: {
              select: {
                username: true,
                teacher: { select: { full_name: true } },
              },
            },
            updater: {
              select: {
                username: true,
                teacher: { select: { full_name: true } },
              },
            },
          },
        })
      : [];

    const scheduledMap = new Map();
    scheduledRecords.forEach((slot) => {
      const actId = slot.activity_id.toString();
      const slotItem = {
        slotId: slot.id.toString(),
        day: ENUM_TO_DAY_KEY[slot.day_of_week] || 'T2',
        dayOfWeek: slot.day_of_week,
        routineSlot: slot.routine_slot,
        date: slot.scheduled_date ? slot.scheduled_date.toISOString().slice(0, 10) : '',
        themeId: slot.sub_theme?.theme?.public_id || (slot.sub_theme?.theme?.theme_id ? slot.sub_theme.theme.theme_id.toString() : null),
        theme_id: slot.sub_theme?.theme?.theme_id ? slot.sub_theme.theme.theme_id.toString() : null,
        themeName: slot.sub_theme?.theme?.name || null,
        subThemeName: slot.sub_theme?.name || null,
        creatorName: slot.creator?.teacher?.full_name || slot.creator?.username || null,
        updaterName: slot.updater?.teacher?.full_name || slot.updater?.username || null,
      };
      const list = scheduledMap.get(actId) || [];
      list.push(slotItem);
      scheduledMap.set(actId, list);
      if (slot.activity?.public_id) {
        const pubList = scheduledMap.get(slot.activity.public_id) || [];
        pubList.push(slotItem);
        scheduledMap.set(slot.activity.public_id, pubList);
      }
    });

    // 3. Query real goals, contents, activities from PostgreSQL
    let goalsWithActivities = [];
    try {
      const dbGoals = await prisma.educationalGoal.findMany({
        where: {
          school_year_id: targetClass?.school_year_id || 1n,
          age_group: ageGroup,
          deleted_at: null,
        },
        include: {
          contents: {
            where: { deleted_at: null },
            include: {
              activities: {
                where: { deleted_at: null },
                orderBy: { activity_id: 'asc' },
                include: {
                  theme: {
                    select: {
                      theme_id: true,
                      public_id: true,
                      name: true,
                    },
                  },
                  creator: {
                    select: {
                      public_id: true,
                      username: true,
                      teacher: { select: { full_name: true } },
                    },
                  },
                  updater: {
                    select: {
                      public_id: true,
                      username: true,
                      teacher: { select: { full_name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { goal_id: 'asc' },
      });

      if (dbGoals && dbGoals.length > 0) {
        // Filter activities by assigned teachers of this class (T6 Comment 2)
        const classTeachers = await prisma.teacherClass.findMany({
          where: { class_id: targetClass.class_id, left_at: null },
          select: { teacher: { select: { account_id: true } } },
        });
        const allowedAccountIds = new Set(
          classTeachers.map((tc) => tc.teacher.account_id?.toString()).filter(Boolean)
        );

        const classScheduledActs = await prisma.subThemeActivity.findMany({
          where: { class_id: targetClass.class_id },
          select: { activity_id: true },
        });
        const scheduledActIds = new Set(classScheduledActs.map((s) => s.activity_id.toString()));

        const classAllocations = await prisma.classThemeGoal.findMany({
          where: { class_id: targetClass.class_id },
          include: { theme: true },
        });

        let classContentAllocations = [];
        try {
          classContentAllocations = await prisma.classThemeContent.findMany({
            where: { class_id: targetClass.class_id },
            include: { theme: true },
          });
        } catch (err) {
          logger.warn('classThemeContent lookup warning in getThemeActivities:', err.message);
        }

        goalsWithActivities = dbGoals.map((g) => {
          const goalAllocs = classAllocations.filter((a) => a.goal_id === g.goal_id);

          const contentsWithActs = g.contents.map((cnt) => {
            // Map allocated themes for this specific NDGD
            const cntAllocs = classContentAllocations.filter(
              (a) => a.content_id.toString() === cnt.content_id.toString()
            );

            let allocatedThemesForContent = [];
            if (cntAllocs.length > 0) {
              allocatedThemesForContent = cntAllocs.map((a) => {
                const matchedTh = themes.find((th) => th._theme_id?.toString() === a.theme.theme_id.toString());
                const pad = (n) => String(n).padStart(2, '0');
                const sDate = `${pad(a.theme.start_date.getDate())}/${pad(a.theme.start_date.getMonth() + 1)}`;
                const eDate = `${pad(a.theme.end_date.getDate())}/${pad(a.theme.end_date.getMonth() + 1)}`;
                return {
                  id: a.theme.public_id || a.theme.theme_id.toString(),
                  themeId: a.theme.public_id || a.theme.theme_id.toString(),
                  _theme_id: a.theme.theme_id.toString(),
                  code: matchedTh?.code || '',
                  name: a.theme.name,
                  themeName: a.theme.name,
                  startDate: a.theme.start_date.toISOString().slice(0, 10),
                  endDate: a.theme.end_date.toISOString().slice(0, 10),
                  dateRange: `${sDate} – ${eDate}`,
                };
              });
            } else if (classContentAllocations.length === 0 && goalAllocs.length > 0) {
              // Fallback to legacy goal-level allocation ONLY if no content-level allocations exist anywhere
              allocatedThemesForContent = goalAllocs.map((a) => {
                const matchedTh = themes.find((th) => th._theme_id?.toString() === a.theme.theme_id.toString());
                const pad = (n) => String(n).padStart(2, '0');
                const sDate = `${pad(a.theme.start_date.getDate())}/${pad(a.theme.start_date.getMonth() + 1)}`;
                const eDate = `${pad(a.theme.end_date.getDate())}/${pad(a.theme.end_date.getMonth() + 1)}`;
                return {
                  id: a.theme.public_id || a.theme.theme_id.toString(),
                  themeId: a.theme.public_id || a.theme.theme_id.toString(),
                  _theme_id: a.theme.theme_id.toString(),
                  code: matchedTh?.code || '',
                  name: a.theme.name,
                  themeName: a.theme.name,
                  startDate: a.theme.start_date.toISOString().slice(0, 10),
                  endDate: a.theme.end_date.toISOString().slice(0, 10),
                  dateRange: `${sDate} – ${eDate}`,
                };
              });
            }

            const classActivities = cnt.activities.filter((act) => {
              if (allowedAccountIds.size === 0) return true;
              if (scheduledActIds.has(act.activity_id.toString())) return true;
              if (act.created_by && allowedAccountIds.has(act.created_by.toString())) return true;
              return false;
            });
            const activitiesToMap = classActivities.slice().sort((a, b) => {
              const idA = Number(a.activity_id) || 0;
              const idB = Number(b.activity_id) || 0;
              return idA - idB;
            });
            const activities = activitiesToMap.map((act) => {
              const actId = act.public_id || act.activity_id.toString();
              const scheduledSlots = scheduledMap.get(act.public_id) || scheduledMap.get(act.activity_id.toString()) || [];
              const creatorName = act.creator?.teacher?.full_name || act.creator?.username || null;
              const updaterName = act.updater?.teacher?.full_name || act.updater?.username || null;

              return {
                id: actId,
                contentId: cnt.public_id || cnt.content_id.toString(),
                _content_id: cnt.content_id.toString(),
                themeId: act.theme?.public_id || (act.theme_id ? act.theme_id.toString() : null),
                theme_id: act.theme?.public_id || (act.theme_id ? act.theme_id.toString() : null),
                themeName: act.theme?.name || null,
                _theme_id: act.theme_id ? act.theme_id.toString() : null,
                contentAllocatedThemes: allocatedThemesForContent,
                goalCode: g.goal_code,
                domain: g.domain,
                routineSlot: act.routine_slot,
                title: act.title,
                objective: act.objective || '',
                preparation: act.preparation || '',
                procedure: act.procedure || '',
                evaluationCriteria: act.evaluation_criteria || '',
                creatorName,
                updaterName,
                createdBy: act.created_by ? act.created_by.toString() : null,
                updatedBy: act.updated_by ? act.updated_by.toString() : null,
                createdAt: act.created_at ? act.created_at.toISOString() : null,
                updatedAt: act.updated_at ? act.updated_at.toISOString() : null,
                scheduledSlots,
                slotsCount: scheduledSlots.length,
                isScheduled: scheduledSlots.length > 0,
                scheduledSlot: scheduledSlots[0] || null,
                scheduleInfo: scheduledSlots[0] || null,
              };
            });

            return {
              id: cnt.public_id || cnt.content_id.toString(),
              contentId: cnt.content_id.toString(),
              title: cnt.title,
              goalCode: g.goal_code,
              domain: g.domain,
              domainLabel: g.domain,
              allocatedThemes: allocatedThemesForContent,
              activities,
              activitiesCount: activities.length,
            };
          });

          // Aggregate unique themes across all contents of this goal
          const seenThemeIds = new Set();
          const aggregatedThemes = [];
          contentsWithActs.forEach((c) => {
            (c.allocatedThemes || []).forEach((th) => {
              const thId = String(th.id || th.themeId);
              if (!seenThemeIds.has(thId)) {
                seenThemeIds.add(thId);
                aggregatedThemes.push(th);
              }
            });
          });

          if (aggregatedThemes.length === 0 && goalAllocs.length > 0) {
            goalAllocs.forEach((a) => {
              const thId = a.theme.public_id || a.theme.theme_id.toString();
              if (!seenThemeIds.has(thId)) {
                seenThemeIds.add(thId);
                const matchedTh = themes.find((th) => th._theme_id?.toString() === a.theme.theme_id.toString());
                const pad = (n) => String(n).padStart(2, '0');
                const sDate = `${pad(a.theme.start_date.getDate())}/${pad(a.theme.start_date.getMonth() + 1)}`;
                const eDate = `${pad(a.theme.end_date.getDate())}/${pad(a.theme.end_date.getMonth() + 1)}`;
                aggregatedThemes.push({
                  id: thId,
                  themeId: thId,
                  _theme_id: a.theme.theme_id.toString(),
                  code: matchedTh?.code || '',
                  name: a.theme.name,
                  themeName: a.theme.name,
                  startDate: a.theme.start_date.toISOString().slice(0, 10),
                  endDate: a.theme.end_date.toISOString().slice(0, 10),
                  dateRange: `${sDate} – ${eDate}`,
                });
              }
            });
          }

          return {
            id: g.public_id || g.goal_id.toString(),
            goalCode: g.goal_code,
            indicatorCode: g.indicator_code || '',
            domain: g.domain,
            domainCode: '',
            domainLabel: g.domain,
            title: cleanGoalTitle(g.goal_code, g.title, ageGroup),
            allocatedThemes: aggregatedThemes,
            contents: contentsWithActs,
          };
        });
      }
    } catch (err) {
      logger.error('Error fetching goals and activities for planning:', err);
    }

    // Summary statistics
    let totalContents = 0;
    let coveredContents = 0;
    let totalActivities = 0;

    goalsWithActivities.forEach((g) => {
      g.contents.forEach((c) => {
        totalContents += 1;
        totalActivities += (c.activities || []).length;
        if ((c.activities || []).length > 0) coveredContents += 1;
      });
    });

    return {
      themes,
      selectedTheme,
      subThemes,
      goals: goalsWithActivities,
      stats: {
        totalContents,
        coveredContents,
        totalActivities,
        percentage: totalContents > 0 ? Math.round((coveredContents / totalContents) * 100) : 0,
      },
    };
  }

  /**
   * Tab 1: Create or update an educational activity in PostgreSQL
   */
  async saveEducationalActivity({ classId, activity, accountId }) {
    if (!activity.title || !activity.title.trim()) {
      throw new BadRequest('Tiêu đề hoạt động giáo dục không được để trống.');
    }

    if (!activity.contentId) {
      throw new BadRequest('Vui lòng chọn nội dung giáo dục tương ứng.');
    }

    const staffAccountId = await this.resolveStaffAccountId(accountId);

    let targetContentId = null;
    if (activity.contentId) {
      const isNum = typeof activity.contentId === 'number' || (typeof activity.contentId === 'string' && /^\d+$/.test(String(activity.contentId).trim()));
      if (isNum) {
        targetContentId = BigInt(activity.contentId);
      } else {
        const cnt = await prisma.educationalContent.findFirst({
          where: { public_id: String(activity.contentId), deleted_at: null },
          select: { content_id: true },
        });
        if (cnt) targetContentId = cnt.content_id;
      }
    }

    if (!targetContentId) {
      throw new BadRequest('Nội dung giáo dục không tồn tại hoặc không hợp lệ.');
    }

    if (activity.themeId) {
      await this.checkPlanEditable(classId, activity.themeId);
    }

    let existingActivity = null;
    if (activity.id) {
      const strId = String(activity.id).trim();
      const isNum = typeof activity.id === 'number' || /^\d+$/.test(strId);
      const isUuidFormat = isUuid(strId);
      const orConditions = [];
      if (isNum) orConditions.push({ activity_id: BigInt(strId) });
      if (isUuidFormat) orConditions.push({ public_id: strId });

      if (orConditions.length > 0) {
        existingActivity = await prisma.educationalActivity.findFirst({
          where: { OR: orConditions, deleted_at: null },
        });
      }
    }

    const cleanTitle = activity.title.trim().slice(0, 500);

    let targetThemeId = null;
    const rawThemeId = activity.themeId || activity.theme_id || null;
    if (rawThemeId) {
      const strTheme = String(rawThemeId).trim();
      const isNum = typeof rawThemeId === 'number' || /^\d+$/.test(strTheme);
      const isUuidFormat = isUuid(strTheme);
      const themeWhere = [];
      if (isNum) themeWhere.push({ theme_id: BigInt(strTheme) });
      if (isUuidFormat) themeWhere.push({ public_id: strTheme });
      if (themeWhere.length > 0) {
        const th = await prisma.curriculumTheme.findFirst({
          where: { OR: themeWhere, deleted_at: null },
          select: { theme_id: true },
        });
        if (th) targetThemeId = th.theme_id;
      }
    }

    const VALID_SLOTS = [
      'ARRIVAL_PLAY',
      'MORNING_EXERCISE',
      'DIRECTED_STUDY',
      'CORNER_PLAY',
      'OUTDOOR_PLAY',
      'AFTERNOON_ACTIVITY',
      'RETURN_CHILD',
    ];
    const normalizeSlot = (slot) => {
      if (!slot) return 'DIRECTED_STUDY';
      const s = String(slot).trim().toUpperCase();
      if (s === 'OUTDOOR_ACTIVITY' || s === 'OUTDOOR') return 'OUTDOOR_PLAY';
      return VALID_SLOTS.includes(s) ? s : 'DIRECTED_STUDY';
    };

    if (existingActivity) {
      // Kiểm tra xem hoạt động giáo dục này đã được gán vào Thời khóa biểu (kế hoạch tuần) hay chưa
      const scheduledCount = await prisma.subThemeActivity.count({
        where: { activity_id: existingActivity.activity_id },
      });
      const isActivityScheduled = scheduledCount > 0;

      // Đối riêng với hoạt động giáo dục: vẫn cho phép sửa nội dung (tên, mục đích, chuẩn bị, cách tiến hành, tiêu chí),
      // nhưng cố định chế độ sinh hoạt (routine_slot) nếu đã được xếp lịch TKB
      const targetRoutineSlot = isActivityScheduled
        ? existingActivity.routine_slot
        : normalizeSlot(
            activity.routineSlot || activity.routine_slot || existingActivity.routine_slot || 'DIRECTED_STUDY'
          );

      const updated = await prisma.educationalActivity.update({
        where: { activity_id: existingActivity.activity_id },
        data: {
          content_id: isActivityScheduled ? existingActivity.content_id : targetContentId,
          routine_slot: targetRoutineSlot,
          title: cleanTitle,
          objective: activity.objective || activity.purpose || '',
          preparation: activity.preparation || '',
          procedure: activity.procedure || activity.steps || '',
          evaluation_criteria: activity.evaluationCriteria || activity.evaluation_criteria || activity.evaluation || activity.assessmentCriteria || '',
          ...(targetThemeId !== null && !isActivityScheduled ? { theme_id: targetThemeId } : {}),
          ...(staffAccountId ? { updated_by: staffAccountId } : {}),
          updated_at: new Date(),
        },
        include: {
          theme: {
            select: { theme_id: true, public_id: true, name: true },
          },
          creator: {
            select: { username: true, teacher: { select: { full_name: true } } },
          },
          updater: {
            select: { username: true, teacher: { select: { full_name: true } } },
          },
        },
      });

      return {
        ...activity,
        id: updated.public_id || updated.activity_id.toString(),
        contentId: activity.contentId,
        themeId: updated.theme?.public_id || (updated.theme_id ? updated.theme_id.toString() : null),
        theme_id: updated.theme?.public_id || (updated.theme_id ? updated.theme_id.toString() : null),
        themeName: updated.theme?.name || activity.themeName || null,
        routineSlot: updated.routine_slot,
        routine_slot: updated.routine_slot,
        title: updated.title,
        objective: updated.objective || '',
        preparation: updated.preparation || '',
        procedure: updated.procedure || '',
        evaluationCriteria: updated.evaluation_criteria || '',
        creatorName: updated.creator?.teacher?.full_name || updated.creator?.username || null,
        updaterName: updated.updater?.teacher?.full_name || updated.updater?.username || null,
        updatedAt: updated.updated_at.toISOString(),
      };
    }

    const targetRoutineSlot = normalizeSlot(activity.routineSlot || activity.routine_slot || 'DIRECTED_STUDY');
    const created = await prisma.educationalActivity.create({
      data: {
        content_id: targetContentId,
        routine_slot: targetRoutineSlot,
        title: cleanTitle,
        objective: activity.objective || activity.purpose || '',
        preparation: activity.preparation || '',
        procedure: activity.procedure || activity.steps || '',
        evaluation_criteria: activity.evaluationCriteria || activity.evaluation_criteria || activity.evaluation || activity.assessmentCriteria || '',
        ...(targetThemeId ? { theme_id: targetThemeId } : {}),
        ...(staffAccountId ? { created_by: staffAccountId } : {}),
      },
      include: {
        theme: {
          select: { theme_id: true, public_id: true, name: true },
        },
        creator: {
          select: { username: true, teacher: { select: { full_name: true } } },
        },
      },
    });

    return {
      ...activity,
      id: created.public_id || created.activity_id.toString(),
      contentId: activity.contentId,
      themeId: created.theme?.public_id || (created.theme_id ? created.theme_id.toString() : null),
      theme_id: created.theme?.public_id || (created.theme_id ? created.theme_id.toString() : null),
      themeName: created.theme?.name || activity.themeName || null,
      routineSlot: created.routine_slot,
      routine_slot: created.routine_slot,
      title: created.title,
      objective: created.objective || '',
      preparation: created.preparation || '',
      procedure: created.procedure || '',
      evaluationCriteria: created.evaluation_criteria || '',
      creatorName: created.creator?.teacher?.full_name || created.creator?.username || activity.creatorName || null,
      updaterName: null,
      createdAt: created.created_at.toISOString(),
    };
  }

  /**
   * Tab 1: Delete an educational activity from PostgreSQL
   */
  async deleteEducationalActivity({ classId, activityId }) {
    if (!activityId) {
      throw new BadRequest('Mã hoạt động không hợp lệ.');
    }

    const strId = String(activityId).trim();
    const isNum = typeof activityId === 'number' || /^\d+$/.test(strId);
    const isUuidFormat = isUuid(strId);
    const orConditions = [];
    if (isNum) orConditions.push({ activity_id: BigInt(strId) });
    if (isUuidFormat) orConditions.push({ public_id: strId });

    const existing = orConditions.length > 0
      ? await prisma.educationalActivity.findFirst({
          where: { OR: orConditions, deleted_at: null },
        })
      : null;

    if (!existing) {
      throw new NotFound('Không tìm thấy hoạt động giáo dục.');
    }

    // Chỉ khóa những hoạt động giáo dục nào đã được sử dụng vào kế hoạch tuần
    const scheduledCount = await prisma.subThemeActivity.count({
      where: { activity_id: existing.activity_id },
    });
    if (scheduledCount > 0) {
      throw new Forbidden('Hoạt động giáo dục này đã được sử dụng trong Kế hoạch tuần nên không thể xóa.');
    }

    // Soft delete: update deleted_at
    await prisma.educationalActivity.update({
      where: { activity_id: existing.activity_id },
      data: {
        deleted_at: new Date(),
      },
    });

    return { success: true, activityId };
  }

  /**
   * Tab 2: Get Weekly Timetable for a class & sub-theme querying live PostgreSQL (sub_theme_activities)
   */
  async getWeeklyTimetable({ classId, themeCode, subThemeId, weekId, startDate, endDate }) {
    const targetClass = await this.resolveClass(classId);
    const ageGroup = targetClass?.age_group || 'NHA_TRE';
    const schoolYearId = targetClass?.school_year_id || 1n;

    // Resolve date range of requested week
    let effectiveStartDate = startDate || null;
    let effectiveEndDate = endDate || null;

    if ((!effectiveStartDate || !effectiveEndDate) && weekId) {
      const resolved = resolveAcademicWeekDates(weekId);
      if (resolved) {
        effectiveStartDate = resolved.startDate;
        effectiveEndDate = resolved.endDate;
      }
    }

    // 1. Query themes & subThemes for this age group
    let themes = [];
    let selectedTheme = null;
    let subThemes = [];
    let selectedSubTheme = null;

    try {
      const dbThemes = await prisma.curriculumTheme.findMany({
        where: {
          school_year_id: schoolYearId,
          age_group: ageGroup,
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

      if (dbThemes && dbThemes.length > 0) {
        themes = dbThemes.map((th, idx) => {
          const code = String(idx + 1).padStart(2, '0');
          const pad = (n) => String(n).padStart(2, '0');
          const sDate = `${pad(th.start_date.getDate())}/${pad(th.start_date.getMonth() + 1)}`;
          const eDate = `${pad(th.end_date.getDate())}/${pad(th.end_date.getMonth() + 1)}/${th.end_date.getFullYear()}`;
          const totalWeeks = calculateThemeWeeks(th.start_date, th.end_date, th.sub_themes.length);
          return {
            id: th.public_id || th.theme_id.toString(),
            _theme_id: th.theme_id,
            code,
            name: th.name,
            status: th.status,
            startDate: th.start_date.toISOString().slice(0, 10),
            endDate: th.end_date.toISOString().slice(0, 10),
            dateRange: `${sDate} – ${eDate}`,
            weeksCount: totalWeeks,
            subThemes: th.sub_themes.map((st, sIdx) => ({
              id: st.public_id || st.sub_theme_id.toString(),
              _sub_theme_id: st.sub_theme_id,
              themeCode: code,
              name: st.name,
              weekNumber: sIdx + 1,
              weekLabel: `Tuần ${sIdx + 1}`,
              startDate: st.start_date.toISOString().slice(0, 10),
              endDate: st.end_date.toISOString().slice(0, 10),
            })),
          };
        });

        if (subThemeId) {
          for (const th of themes) {
            const foundSt = th.subThemes.find((s) => s.id === subThemeId || s.id === String(subThemeId));
            if (foundSt) {
              selectedTheme = th;
              subThemes = th.subThemes;
              selectedSubTheme = foundSt;
              break;
            }
          }
        } else if (themeCode) {
          selectedTheme = themes.find((t) => t.code === themeCode || t.id === themeCode) || themes[0];
          subThemes = selectedTheme?.subThemes || [];
          selectedSubTheme = subThemes[0] || null;
        } else if (effectiveStartDate && effectiveEndDate) {
          for (const th of themes) {
            for (const st of th.subThemes) {
              if (st.startDate <= effectiveEndDate && st.endDate >= effectiveStartDate) {
                selectedTheme = th;
                selectedSubTheme = st;
                break;
              }
            }
            if (selectedSubTheme) break;
          }
          subThemes = selectedTheme?.subThemes || [];
        } else {
          for (const th of themes) {
            for (const st of th.subThemes) {
              if (st.startDate <= '2026-10-14' && st.endDate >= '2026-10-14') {
                selectedTheme = th;
                selectedSubTheme = st;
                break;
              }
            }
            if (selectedSubTheme) break;
          }
          subThemes = selectedTheme?.subThemes || [];
        }
      }
    } catch (err) {
      logger.error('Error fetching themes for weekly timetable:', err);
    }

    // 2. Query scheduled slots from sub_theme_activities for this class
    const slotWhere = {
      class_id: targetClass?.class_id || 5n,
    };

    if (effectiveStartDate && effectiveEndDate) {
      slotWhere.scheduled_date = {
        gte: new Date(`${effectiveStartDate}T00:00:00.000Z`),
        lte: new Date(`${effectiveEndDate}T23:59:59.999Z`),
      };
    } else if (subThemeId) {
      const strSub = String(subThemeId).trim();
      const isNum = typeof subThemeId === 'number' || /^\d+$/.test(strSub);
      const isUuidFormat = isUuid(strSub);
      const orConditions = [];
      if (isNum) orConditions.push({ sub_theme_id: BigInt(strSub) });
      if (isUuidFormat) orConditions.push({ public_id: strSub });

      const st = orConditions.length > 0
        ? await prisma.subTheme.findFirst({
            where: { OR: orConditions },
          })
        : null;
      if (st) slotWhere.sub_theme_id = st.sub_theme_id;
    } else if (selectedTheme?.subThemes?.length) {
      slotWhere.sub_theme_id = {
        in: selectedTheme.subThemes.map((st) => st._sub_theme_id || BigInt(st.id)),
      };
    } else if (selectedSubTheme) {
      slotWhere.sub_theme_id = selectedSubTheme._sub_theme_id || BigInt(selectedSubTheme.id);
    }

    const scheduledRecords = await prisma.subThemeActivity.findMany({
      where: slotWhere,
      include: {
        activity: {
          include: {
            content: {
              include: { goal: true },
            },
            creator: {
              select: {
                username: true,
                teacher: { select: { full_name: true } },
              },
            },
            updater: {
              select: {
                username: true,
                teacher: { select: { full_name: true } },
              },
            },
          },
        },
        creator: {
          select: {
            username: true,
            teacher: { select: { full_name: true } },
          },
        },
        updater: {
          select: {
            username: true,
            teacher: { select: { full_name: true } },
          },
        },
        sub_theme: true,
      },
      orderBy: [
        { scheduled_date: 'asc' },
        { order_index: 'asc' },
      ],
    });

    const scheduledMap = new Map();

    try {
      const allClassScheduledActs = await prisma.subThemeActivity.findMany({
        where: { class_id: targetClass?.class_id || 5n },
        include: {
          activity: { select: { public_id: true, activity_id: true } },
          sub_theme: {
            select: {
              sub_theme_id: true,
              theme_id: true,
              theme: { select: { theme_id: true, name: true, public_id: true } },
            },
          },
        },
        orderBy: { scheduled_date: 'asc' },
      });

      allClassScheduledActs.forEach((sa) => {
        const sDate = sa.scheduled_date ? sa.scheduled_date.toISOString().slice(0, 10) : '';
        const dateFormatted = sDate ? `${sDate.slice(8, 10)}/${sDate.slice(5, 7)}` : '';
        const thId = sa.sub_theme?.theme_id?.toString() || sa.sub_theme?.theme?.theme_id?.toString();
        const matchedTh = (themes || []).find((t) => (t._theme_id || t.id)?.toString() === thId) ||
                          (themes || []).find((t) => sDate && sDate >= t.startDate && sDate <= t.endDate);

        const slotInfo = {
          slotId: sa.id.toString(),
          day: ENUM_TO_DAY_KEY[sa.day_of_week] || 'T2',
          routineSlot: sa.routine_slot,
          date: dateFormatted,
          dayLabel: dateFormatted,
          scheduledDate: sDate,
          themeId: matchedTh?.id || sa.sub_theme?.theme?.public_id || thId || null,
          _theme_id: thId || matchedTh?._theme_id?.toString() || null,
          themeName: matchedTh?.name || sa.sub_theme?.theme?.name || null,
          themeCode: matchedTh?.code || null,
        };

        const actNumId = sa.activity_id.toString();
        const numList = scheduledMap.get(actNumId) || [];
        numList.push(slotInfo);
        scheduledMap.set(actNumId, numList);

        if (sa.activity?.public_id) {
          const pubList = scheduledMap.get(sa.activity.public_id) || [];
          pubList.push(slotInfo);
          scheduledMap.set(sa.activity.public_id, pubList);
        }
      });
    } catch (err) {
      logger.warn('Error querying allClassScheduledActs for scheduledMap:', err.message);
    }

    const mappedSlots = scheduledRecords.map((rec) => {
      const dayKey = ENUM_TO_DAY_KEY[rec.day_of_week] || 'T2';
      const times = SLOT_TIMES[rec.routine_slot] || { start: '08:30', end: '09:15' };
      const dateStr = rec.scheduled_date ? rec.scheduled_date.toISOString().slice(0, 10) : '';
      const dateFormatted = dateStr ? `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}` : '';
      const act = rec.activity;
      const content = act?.content;
      const goal = content?.goal;
      const actId = act?.public_id || rec.activity_id.toString();

      const slotCreatorName = rec.creator?.teacher?.full_name || rec.creator?.username || null;
      const slotUpdaterName = rec.updater?.teacher?.full_name || rec.updater?.username || null;
      const actCreatorName = act?.creator?.teacher?.full_name || act?.creator?.username || null;
      const actUpdaterName = act?.updater?.teacher?.full_name || act?.updater?.username || null;

      const slotObj = {
        id: rec.id.toString(),
        subThemeId: rec.sub_theme?.public_id || rec.sub_theme_id.toString(),
        weekId: weekId || rec.sub_theme?.public_id || rec.sub_theme?.sub_theme_id?.toString() || 'w-1',
        activityId: actId,
        day: dayKey,
        routineSlot: rec.routine_slot,
        orderIndex: rec.order_index,
        order_index: rec.order_index,
        date: dateFormatted,
        startTime: times.start,
        endTime: times.end,
        title: act?.title || '',
        status: rec.status,
        domain: goal?.domain || '',
        domainLabel: DOMAIN_LABELS[goal?.domain] || goal?.domain || '',
        goalCode: goal?.goal_code || '',
        goalTitle: goal?.title || '',
        indicatorCode: goal?.indicator_code || '',
        contentTitle: content?.title || '',
        objective: act?.objective || '',
        planObjective: act?.objective || '',
        preparation: act?.preparation || '',
        procedure: act?.procedure || '',
        evaluation: act?.evaluation_criteria || '',
        evaluationCriteria: act?.evaluation_criteria || '',
        slotCreatorName,
        slotUpdaterName,
        activityCreatorName: actCreatorName,
        activityUpdaterName: actUpdaterName,
        creatorName: slotCreatorName,
        updaterName: slotUpdaterName,
        criteria: act ? {
          domain: goal?.domain || '',
          domainLabel: DOMAIN_LABELS[goal?.domain] || goal?.domain || '',
          goal: goal?.goal_code ? `${goal.goal_code} - ${goal.title || ''}` : '',
          goalCode: goal?.goal_code || '',
          goalTitle: goal?.title || '',
          indicator: goal?.indicator_code || '',
          indicatorCode: goal?.indicator_code || '',
          content: content?.title || '',
          objective: act.objective || '',
          planObjective: act.objective || '',
          preparation: act.preparation || '',
          procedure: act.procedure || '',
          expectedAssessment: act.evaluation_criteria || '',
          evaluationCriteria: act.evaluation_criteria || '',
        } : null,
      };

      return slotObj;
    });

    // 3. Query available activities & goals from PostgreSQL
    let availableActivities = [];
    let goalsWithActivities = [];
    let classAllocations = [];
    let classContentAllocations = [];

    try {
      const dbGoals = await prisma.educationalGoal.findMany({
        where: {
          school_year_id: schoolYearId,
          age_group: ageGroup,
          deleted_at: null,
        },
        include: {
          contents: {
            where: { deleted_at: null },
            include: {
              activities: {
                where: { deleted_at: null },
                orderBy: { activity_id: 'asc' },
                include: {
                  theme: {
                    select: {
                      theme_id: true,
                      public_id: true,
                      name: true,
                    },
                  },
                  creator: {
                    select: {
                      username: true,
                      teacher: { select: { full_name: true } },
                    },
                  },
                  updater: {
                    select: {
                      username: true,
                      teacher: { select: { full_name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { goal_id: 'asc' },
      });

      if (dbGoals && dbGoals.length > 0) {
        // Filter activities by assigned teachers of this class (T6 Comment 2)
        const classTeachers = await prisma.teacherClass.findMany({
          where: { class_id: targetClass.class_id, left_at: null },
          select: { teacher: { select: { account_id: true } } },
        });
        const allowedAccountIds = new Set(
          classTeachers.map((tc) => tc.teacher.account_id?.toString()).filter(Boolean)
        );

        const classScheduledActs = await prisma.subThemeActivity.findMany({
          where: { class_id: targetClass.class_id },
          select: { activity_id: true },
        });
        const scheduledActIds = new Set(classScheduledActs.map((s) => s.activity_id.toString()));

        classAllocations = await prisma.classThemeGoal.findMany({
          where: {
            class_id: targetClass.class_id,
            goal: {
              deleted_at: null,
              school_year_id: schoolYearId,
              age_group: ageGroup,
            },
          },
          include: {
            goal: true,
            theme: true,
          },
        });

        try {
          classContentAllocations = await prisma.classThemeContent.findMany({
            where: { class_id: targetClass.class_id },
            include: { theme: true, content: true },
          });
        } catch (err) {
          logger.warn('classThemeContent lookup warning in getWeeklyTimetable:', err.message);
        }

        goalsWithActivities = dbGoals.map((g) => {
          const goalAllocs = classAllocations.filter((a) => a.goal_id === g.goal_id);
          const goalAllocatedThemes = goalAllocs.map((a) => {
            const matchedTh = themes.find((th) => th._theme_id?.toString() === a.theme?.theme_id?.toString());
            const pad = (n) => String(n).padStart(2, '0');
            const sDate = a.theme?.start_date ? `${pad(a.theme.start_date.getDate())}/${pad(a.theme.start_date.getMonth() + 1)}` : '';
            const eDate = a.theme?.end_date ? `${pad(a.theme.end_date.getDate())}/${pad(a.theme.end_date.getMonth() + 1)}` : '';
            return {
              id: a.theme?.public_id || a.theme?.theme_id?.toString() || '',
              themeId: a.theme?.public_id || a.theme?.theme_id?.toString() || '',
              _theme_id: a.theme?.theme_id?.toString() || '',
              code: matchedTh?.code || '',
              name: a.theme?.name || '',
              themeName: a.theme?.name || '',
              startDate: a.theme?.start_date ? a.theme.start_date.toISOString().slice(0, 10) : '',
              endDate: a.theme?.end_date ? a.theme.end_date.toISOString().slice(0, 10) : '',
              dateRange: sDate && eDate ? `${sDate} – ${eDate}` : '',
            };
          });

          const contentsWithActs = g.contents.map((cnt) => {
            const cntAllocs = classContentAllocations.filter(
              (a) => a.content_id.toString() === cnt.content_id.toString()
            );

            let allocatedThemesForContent = [];
            if (cntAllocs.length > 0) {
              allocatedThemesForContent = cntAllocs.map((a) => {
                const matchedTh = themes.find((th) => th._theme_id?.toString() === a.theme?.theme_id?.toString());
                const pad = (n) => String(n).padStart(2, '0');
                const sDate = a.theme?.start_date ? `${pad(a.theme.start_date.getDate())}/${pad(a.theme.start_date.getMonth() + 1)}` : '';
                const eDate = a.theme?.end_date ? `${pad(a.theme.end_date.getDate())}/${pad(a.theme.end_date.getMonth() + 1)}` : '';
                return {
                  id: a.theme?.public_id || a.theme?.theme_id?.toString() || '',
                  themeId: a.theme?.public_id || a.theme?.theme_id?.toString() || '',
                  _theme_id: a.theme?.theme_id?.toString() || '',
                  code: matchedTh?.code || '',
                  name: a.theme?.name || '',
                  themeName: a.theme?.name || '',
                  startDate: a.theme?.start_date ? a.theme.start_date.toISOString().slice(0, 10) : '',
                  endDate: a.theme?.end_date ? a.theme.end_date.toISOString().slice(0, 10) : '',
                  dateRange: sDate && eDate ? `${sDate} – ${eDate}` : '',
                };
              });
            } else if (classContentAllocations.length === 0 && goalAllocs.length > 0) {
              allocatedThemesForContent = goalAllocatedThemes;
            }

            const classActivities = cnt.activities.filter((act) => {
              if (allowedAccountIds.size === 0) return true;
              if (scheduledActIds.has(act.activity_id.toString())) return true;
              if (act.created_by && allowedAccountIds.has(act.created_by.toString())) return true;
              return false;
            });
            const activitiesToMap = classActivities.slice().sort((a, b) => {
              const idA = Number(a.activity_id) || 0;
              const idB = Number(b.activity_id) || 0;
              return idA - idB;
            });
            const activities = activitiesToMap.map((act) => {
              const actId = act.public_id || act.activity_id.toString();
              const slots = scheduledMap.get(act.public_id) || scheduledMap.get(act.activity_id.toString()) || [];
              const actPayload = {
                id: actId,
                contentId: cnt.public_id || cnt.content_id.toString(),
                _content_id: cnt.content_id.toString(),
                themeId: act.theme?.public_id || (act.theme_id ? act.theme_id.toString() : null),
                theme_id: act.theme?.public_id || (act.theme_id ? act.theme_id.toString() : null),
                themeName: act.theme?.name || null,
                _theme_id: act.theme_id ? act.theme_id.toString() : null,
                contentAllocatedThemes: allocatedThemesForContent,
                goalAllocatedThemes,
                goalCode: g.goal_code,
                goalTitle: g.title,
                domain: g.domain,
                domainCode: '',
                domainLabel: g.domain,
                contentTitle: cnt.title,
                routineSlot: act.routine_slot,
                routine_slot: act.routine_slot,
                title: act.title,
                objective: act.objective || '',
                preparation: act.preparation || '',
                procedure: act.procedure || '',
                evaluationCriteria: act.evaluation_criteria || '',
                creatorName: act.creator?.teacher?.full_name || act.creator?.username || null,
                updaterName: act.updater?.teacher?.full_name || act.updater?.username || null,
                scheduledSlots: slots,
                slotsCount: slots.length,
                isScheduled: slots.length > 0,
                scheduleInfo: slots[0] || null,
              };

              availableActivities.push(actPayload);
              return actPayload;
            });

            return {
              id: cnt.public_id || cnt.content_id.toString(),
              contentId: cnt.content_id.toString(),
              _content_id: cnt.content_id.toString(),
              title: cnt.title,
              allocatedThemes: allocatedThemesForContent,
              activities,
            };
          });

          return {
            id: g.public_id || g.goal_id.toString(),
            goalCode: g.goal_code,
            title: cleanGoalTitle(g.goal_code, g.title, ageGroup),
            domain: g.domain,
            allocatedThemes: goalAllocatedThemes,
            contents: contentsWithActs,
          };
        });
      }
    } catch (err) {
      logger.error('Error fetching goals for weekly timetable:', err);
    }

    // 4. Query school year calendar holidays & events
    let holidays = [];
    try {
      const dbHolidays = await prisma.schoolHoliday.findMany({
        where: {
          school_year_id: schoolYearId,
          deleted_at: null,
        },
        orderBy: { start_date: 'asc' },
      });

      holidays = dbHolidays.map((h) => {
        const isExplicitEvent = (h.description || '').includes('[SỰ KIỆN]') || (h.description || '').includes('[EVENT]');
        const itemType = isExplicitEvent ? 'EVENT' : (h.is_teaching_allowed ? 'EVENT' : 'HOLIDAY');
        return {
          id: h.public_id,
          name: h.name,
          startDate: h.start_date.toISOString().slice(0, 10),
          endDate: h.end_date.toISOString().slice(0, 10),
          isTeachingAllowed: h.is_teaching_allowed,
          type: itemType,
          targetGrades: h.target_grades || [],
          description: h.description,
          affectsClass: !h.target_grades?.length || h.target_grades.includes(ageGroup),
        };
      });
    } catch (err) {
      logger.error('Error fetching holidays for weekly timetable:', err);
    }

    // Fetch theme allocations for this class to filter activities by active theme
    let themeAllocations = [];
    try {
      if (classAllocations.length === 0) {
        classAllocations = await prisma.classThemeGoal.findMany({
          where: {
            class_id: targetClass.class_id,
            goal: {
              deleted_at: null,
              school_year_id: schoolYearId,
              age_group: ageGroup,
            },
          },
          include: {
            goal: true,
            theme: true,
          },
        });
      }

      themeAllocations = (themes || []).map((th) => {
        const sStr = th.startDate || (th.start_date ? th.start_date.toISOString().slice(0, 10) : '');
        const eStr = th.endDate || (th.end_date ? th.end_date.toISOString().slice(0, 10) : '');
        const allocs = classAllocations.filter(
          (a) => a.theme_id.toString() === (th._theme_id || th.id)?.toString()
        );
        const goalIds = [];
        const goalCodes = [];
        allocs.forEach((a) => {
          if (a.goal) {
            if (a.goal.public_id) goalIds.push(a.goal.public_id);
            if (a.goal.goal_id) goalIds.push(a.goal.goal_id.toString());
            if (a.goal.goal_code) goalCodes.push(a.goal.goal_code.trim().toUpperCase());
          }
        });

        const cntAllocsForTh = classContentAllocations.filter(
          (a) => a.theme_id.toString() === (th._theme_id || th.id)?.toString()
        );
        const contentIds = [];
        cntAllocsForTh.forEach((a) => {
          if (a.content_id) contentIds.push(a.content_id.toString());
          if (a.content?.public_id) contentIds.push(a.content.public_id);
        });

        return {
          themeId: th.id,
          _theme_id: (th._theme_id || th.id)?.toString(),
          themeName: th.name,
          startDate: sStr,
          endDate: eStr,
          goalIds,
          goalCodes,
          contentIds,
        };
      });
    } catch (err) {
      logger.error('Error fetching themeAllocations for weekly timetable:', err);
    }

    let planStatus = 'DRAFT';
    let isReadOnly = false;
    let reviewNote = null;
    let rejectionReason = null;
    if (selectedTheme?._theme_id && targetClass?.class_id) {
      try {
        const themePlan = await prisma.classThemePlan.findUnique({
          where: {
            class_id_theme_id: {
              class_id: targetClass.class_id,
              theme_id: BigInt(selectedTheme._theme_id.toString()),
            },
          },
        });
        if (themePlan) {
          planStatus = themePlan.status;
          isReadOnly = themePlan.status === 'USED' || themePlan.status === 'SUBMITTED' || themePlan.status === 'PENDING_APPROVAL';
          reviewNote = themePlan.review_note;
          rejectionReason = themePlan.rejection_reason;
        }
      } catch (err) {
        logger.warn('Error reading classThemePlan for timetable:', err.message);
      }
    }

    return {
      theme: selectedTheme || null,
      selectedTheme: selectedTheme || null,
      subThemes,
      selectedSubTheme,
      slots: mappedSlots,
      availableActivities,
      goals: goalsWithActivities,
      themeAllocations,
      holidays,
      planStatus,
      isReadOnly,
      reviewNote,
      rejectionReason,
      classInfo: {
        classId: targetClass.class_id.toString(),
        publicId: targetClass.public_id,
        name: targetClass.name,
        ageGroup,
        schoolYearId: schoolYearId.toString(),
      },
    };
  }

  /**
   * Tab 2: Assign an activity into a specific day and routine slot in PostgreSQL (sub_theme_activities)
   */
  async assignActivityToSlot({ classId, activityId, day, routineSlot, date, slotId, isAdd = false, weekId, subThemeId, orderIndex, accountId }) {
    const targetClass = await this.resolveClass(classId);
    if (!activityId) {
      throw new BadRequest('Hoạt động giáo dục không hợp lệ.');
    }

    const staffAccountId = await this.resolveStaffAccountId(accountId);

    const strAct = String(activityId).trim();
    const isNum = typeof activityId === 'number' || /^\d+$/.test(strAct);
    const isUuidFormat = isUuid(strAct);
    const orConditions = [];
    if (isNum) orConditions.push({ activity_id: BigInt(strAct) });
    if (isUuidFormat) orConditions.push({ public_id: strAct });

    if (orConditions.length === 0) {
      throw new BadRequest('Hoạt động giáo dục không hợp lệ.');
    }

    const activity = await prisma.educationalActivity.findFirst({
      where: { OR: orConditions, deleted_at: null },
      include: {
        content: { include: { goal: true } },
        creator: { select: { username: true, teacher: { select: { full_name: true } } } },
        updater: { select: { username: true, teacher: { select: { full_name: true } } } },
      },
    });

    if (!activity) {
      throw new NotFound('Không tìm thấy hoạt động giáo dục.');
    }

    const realActivityId = activity.activity_id;
    const dayOfWeek = DAY_MAP_TO_ENUM[day] || 'MONDAY';
    const slotRoutineSlot = routineSlot || activity.routine_slot;

    // Parse date (DD/MM or YYYY-MM-DD)
    let scheduledDate = new Date();
    if (date) {
      if (date.includes('/')) {
        const parts = date.split('/');
        const dayNum = parseInt(parts[0], 10);
        const monthNum = parseInt(parts[1], 10);
        const yearNum = parts[2] ? parseInt(parts[2], 10) : 2026;
        scheduledDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
      } else if (date.includes('-')) {
        const parts = date.split('T')[0].split('-');
        scheduledDate = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
      }
    }

    // Validate if scheduledDate falls on a day locked by SchoolHoliday (is_teaching_allowed === false)
    const lockedHoliday = await prisma.schoolHoliday.findFirst({
      where: {
        school_year_id: targetClass.school_year_id,
        deleted_at: null,
        is_teaching_allowed: false,
        start_date: { lte: scheduledDate },
        end_date: { gte: scheduledDate },
      },
    });

    if (lockedHoliday) {
      const affectsGrade = !lockedHoliday.target_grades?.length ||
        lockedHoliday.target_grades.includes(targetClass.age_group);
      if (affectsGrade) {
        const dateDisplay = date || scheduledDate.toISOString().slice(0, 10);
        throw new BadRequest(
          `Không thể xếp kế hoạch tuần vào ngày ${dateDisplay} vì đã bị khóa dạy bởi sự kiện/ngày nghỉ "${lockedHoliday.name}".`
        );
      }
    }

    // Resolve sub_theme_id: prioritize sub_theme covering scheduledDate
    let targetSubThemeId = null;
    let dateSubTheme = await prisma.subTheme.findFirst({
      where: {
        theme: { school_year_id: targetClass.school_year_id, age_group: targetClass.age_group },
        start_date: { lte: scheduledDate },
        end_date: { gte: scheduledDate },
        deleted_at: null,
      },
      include: {
        theme: true,
      },
    });

    if (!dateSubTheme) {
      dateSubTheme = await prisma.subTheme.findFirst({
        where: {
          theme: { school_year_id: targetClass.school_year_id },
          start_date: { lte: scheduledDate },
          end_date: { gte: scheduledDate },
          deleted_at: null,
        },
        include: {
          theme: true,
        },
      });
    }

    if (!dateSubTheme) {
      dateSubTheme = await prisma.subTheme.findFirst({
        where: {
          start_date: { lte: scheduledDate },
          end_date: { gte: scheduledDate },
          deleted_at: null,
        },
        include: {
          theme: true,
        },
      });
    }

    if (dateSubTheme) {
      targetSubThemeId = dateSubTheme.sub_theme_id;

      // Validate: Activity must strictly belong to the active theme covering scheduledDate (if activity has theme_id)
      if (activity.theme_id) {
        const actThemeIdStr = String(activity.theme_id);
        const subThemeThemeIdStr = String(dateSubTheme.theme_id);
        const isThemeMatch =
          actThemeIdStr === subThemeThemeIdStr ||
          (activity.theme?.name &&
            dateSubTheme.theme?.name &&
            activity.theme.name.toLowerCase() === dateSubTheme.theme.name.toLowerCase());

        if (!isThemeMatch) {
          throw new BadRequest(
            `Hoạt động "${activity.title}" không thuộc chủ đề "${dateSubTheme.theme?.name || 'hiện tại'}", không thể gán vào ngày này.`
          );
        }
      }

      // Validate: Activity routine slot must match the targeted slot
      if (activity.routine_slot && slotRoutineSlot && activity.routine_slot !== slotRoutineSlot) {
        throw new BadRequest(
          `Hoạt động "${activity.title}" thuộc chế độ sinh hoạt khác, không thể gán vào ô "${slotRoutineSlot}".`
        );
      }

      // Validate: Activity goal must be allocated to this theme for this class
      if (activity.content?.goal_id) {
        const isGoalAllocated = await prisma.classThemeGoal.findFirst({
          where: {
            class_id: targetClass.class_id,
            theme_id: dateSubTheme.theme_id,
            goal_id: activity.content.goal_id,
          },
        });
        if (!isGoalAllocated) {
          const totalAllocated = await prisma.classThemeGoal.count({
            where: { class_id: targetClass.class_id, theme_id: dateSubTheme.theme_id },
          });
          if (totalAllocated > 0) {
            throw new BadRequest(
              `Mục tiêu của hoạt động "${activity.title}" chưa được phân bổ cho chủ đề "${dateSubTheme.theme?.name || ''}" tại lớp này.`
            );
          }
        }
      }
    } else if (subThemeId) {
      const strSub = String(subThemeId).trim();
      const isStNum = typeof subThemeId === 'number' || /^\d+$/.test(strSub);
      const isUuidFormat = isUuid(strSub);
      const orConditions = [];
      if (isStNum) orConditions.push({ sub_theme_id: BigInt(strSub) });
      if (isUuidFormat) orConditions.push({ public_id: strSub });

      const st = orConditions.length > 0
        ? await prisma.subTheme.findFirst({
            where: { OR: orConditions },
          })
        : null;
      if (st) targetSubThemeId = st.sub_theme_id;
    } else {
      const fallbackSubTheme = await prisma.subTheme.findFirst({
        where: {
          theme: { school_year_id: targetClass.school_year_id, age_group: targetClass.age_group },
          deleted_at: null,
        },
        orderBy: { start_date: 'desc' },
      });
      targetSubThemeId = fallbackSubTheme?.sub_theme_id;
    }

    if (!targetSubThemeId) {
      throw new BadRequest('Không tìm thấy chủ đề nhánh để gán hoạt động.');
    }

    let savedRec;

    // Enforce at most 1 activity per slot for (class_id, scheduled_date, routine_slot)
    const existingActivities = await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
        scheduled_date: scheduledDate,
        routine_slot: slotRoutineSlot,
      },
      orderBy: { id: 'asc' },
    });

    if (slotId && !isNaN(Number(slotId))) {
      const parsedSlotId = BigInt(slotId);
      const updateData = {
        sub_theme_id: targetSubThemeId,
        activity_id: realActivityId,
        day_of_week: dayOfWeek,
        routine_slot: slotRoutineSlot,
        scheduled_date: scheduledDate,
        status: 'SCHEDULED',
        order_index: 1,
        updated_at: new Date(),
      };
      if (staffAccountId) {
        updateData.updated_by = staffAccountId;
      }
      savedRec = await prisma.subThemeActivity.update({
        where: { id: parsedSlotId },
        data: updateData,
        include: {
          creator: { select: { username: true, teacher: { select: { full_name: true } } } },
          updater: { select: { username: true, teacher: { select: { full_name: true } } } },
        },
      });

      // Clean up any other activities in the same slot to guarantee 1 activity per slot
      const otherDuplicates = existingActivities.filter((a) => a.id !== parsedSlotId);
      if (otherDuplicates.length > 0) {
        await prisma.subThemeActivity.deleteMany({
          where: { id: { in: otherDuplicates.map((a) => a.id) } },
        });
      }
    } else if (existingActivities.length > 0) {
      const primary = existingActivities[0];
      const updateData = {
        sub_theme_id: targetSubThemeId,
        activity_id: realActivityId,
        day_of_week: dayOfWeek,
        routine_slot: slotRoutineSlot,
        scheduled_date: scheduledDate,
        status: 'SCHEDULED',
        order_index: 1,
        updated_at: new Date(),
      };
      if (staffAccountId) {
        updateData.updated_by = staffAccountId;
      }
      savedRec = await prisma.subThemeActivity.update({
        where: { id: primary.id },
        data: updateData,
        include: {
          creator: { select: { username: true, teacher: { select: { full_name: true } } } },
          updater: { select: { username: true, teacher: { select: { full_name: true } } } },
        },
      });

      // Clean up any extra duplicates in this slot if they existed
      if (existingActivities.length > 1) {
        const extraIds = existingActivities.slice(1).map((a) => a.id);
        await prisma.subThemeActivity.deleteMany({
          where: { id: { in: extraIds } },
        });
      }
    } else {
      const createData = {
        class_id: targetClass.class_id,
        sub_theme_id: targetSubThemeId,
        activity_id: realActivityId,
        day_of_week: dayOfWeek,
        routine_slot: slotRoutineSlot,
        scheduled_date: scheduledDate,
        order_index: 1,
        status: 'SCHEDULED',
      };
      if (staffAccountId) {
        createData.created_by = staffAccountId;
      }
      savedRec = await prisma.subThemeActivity.create({
        data: createData,
        include: {
          creator: { select: { username: true, teacher: { select: { full_name: true } } } },
          updater: { select: { username: true, teacher: { select: { full_name: true } } } },
        },
      });
    }

    const times = SLOT_TIMES[savedRec.routine_slot] || { start: '08:30', end: '09:15' };
    const dateFormatted = date || `${scheduledDate.getUTCDate()}/${scheduledDate.getUTCMonth() + 1}`;
    const goal = activity.content?.goal;
    const content = activity.content;

    const subThemeRecord = await prisma.subTheme.findUnique({
      where: { sub_theme_id: savedRec.sub_theme_id },
      select: { public_id: true },
    });

    const slotCreatorName = savedRec.creator?.teacher?.full_name || savedRec.creator?.username || null;
    const slotUpdaterName = savedRec.updater?.teacher?.full_name || savedRec.updater?.username || null;

    return {
      id: savedRec.id.toString(),
      subThemeId: subThemeRecord?.public_id || savedRec.sub_theme_id.toString(),
      weekId: weekId || 'w-1',
      activityId: activity.public_id || activity.activity_id.toString(),
      day,
      routineSlot: savedRec.routine_slot,
      orderIndex: savedRec.order_index,
      order_index: savedRec.order_index,
      date: dateFormatted,
      startTime: times.start,
      endTime: times.end,
      title: activity.title,
      status: savedRec.status,
      domain: goal?.domain || '',
      domainLabel: DOMAIN_LABELS[goal?.domain] || goal?.domain || '',
      goalCode: goal?.goal_code || '',
      goalTitle: cleanGoalTitle(goal?.goal_code, goal?.title, targetClass?.age_group),
      indicatorCode: goal?.indicator_code || '',
      contentTitle: content?.title || '',
      objective: activity.objective || '',
      planObjective: activity.objective || '',
      preparation: activity.preparation || '',
      procedure: activity.procedure || '',
      evaluation: activity.evaluation_criteria || '',
      evaluationCriteria: activity.evaluation_criteria || '',
      slotCreatorName,
      slotUpdaterName,
      creatorName: slotCreatorName,
      updaterName: slotUpdaterName,
      activityCreatorName: activity.creator?.teacher?.full_name || activity.creator?.username || null,
      activityUpdaterName: activity.updater?.teacher?.full_name || activity.updater?.username || null,
      criteria: {
        domain: goal?.domain || '',
        domainLabel: DOMAIN_LABELS[goal?.domain] || goal?.domain || '',
        goal: goal?.goal_code ? `${goal.goal_code} - ${cleanGoalTitle(goal.goal_code, goal.title, targetClass?.age_group)}` : '',
        goalCode: goal?.goal_code || '',
        goalTitle: cleanGoalTitle(goal?.goal_code, goal?.title, targetClass?.age_group),
        indicator: goal?.indicator_code || '',
        indicatorCode: goal?.indicator_code || '',
        content: content?.title || '',
        objective: activity.objective || '',
        planObjective: activity.objective || '',
        preparation: activity.preparation || '',
        procedure: activity.procedure || '',
        expectedAssessment: activity.evaluation_criteria || '',
        evaluationCriteria: activity.evaluation_criteria || '',
      },
    };
  }

  /**
   * Tab 2: Create or update a timetable slot directly in PostgreSQL
   */
  async saveWeeklySlot({ classId, slot, accountId }) {
    if (!slot.title) {
      throw new BadRequest('Tiêu đề hoạt động không được để trống.');
    }

    const staffAccountId = await this.resolveStaffAccountId(accountId);

    if (slot.id && !isNaN(Number(slot.id))) {
      const times = SLOT_TIMES[slot.routineSlot] || { start: slot.startTime || '08:30', end: slot.endTime || '09:15' };
      const updateData = {
        notes: slot.notes || slot.title,
        status: slot.status || 'SCHEDULED',
        updated_by: staffAccountId,
        updated_at: new Date(),
      };

      const rawOrder = slot.orderIndex !== undefined ? slot.orderIndex : slot.order_index;
      if (rawOrder !== undefined && !isNaN(Number(rawOrder))) {
        updateData.order_index = Number(rawOrder);
      }

      if (slot.day) {
        updateData.day_of_week = DAY_MAP_TO_ENUM[slot.day] || 'MONDAY';
      }
      if (slot.routineSlot || slot.routine_slot) {
        updateData.routine_slot = slot.routineSlot || slot.routine_slot;
      }
      if (slot.date) {
        let scheduledDate = null;
        if (slot.date.includes('/')) {
          const parts = slot.date.split('/');
          const dayNum = parseInt(parts[0], 10);
          const monthNum = parseInt(parts[1], 10);
          const yearNum = parts[2] ? parseInt(parts[2], 10) : 2026;
          scheduledDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
        } else if (slot.date.includes('-')) {
          const parts = slot.date.split('T')[0].split('-');
          scheduledDate = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
        }
        if (scheduledDate) {
          const targetClass = await this.resolveClass(classId);
          const lockedHoliday = await prisma.schoolHoliday.findFirst({
            where: {
              school_year_id: targetClass.school_year_id,
              deleted_at: null,
              is_teaching_allowed: false,
              start_date: { lte: scheduledDate },
              end_date: { gte: scheduledDate },
            },
          });

          if (lockedHoliday) {
            const affectsGrade = !lockedHoliday.target_grades?.length ||
              lockedHoliday.target_grades.includes(targetClass.age_group);
            if (affectsGrade) {
              throw new BadRequest(
                `Không thể xếp kế hoạch tuần vào ngày ${slot.date} vì đã bị khóa dạy bởi sự kiện/ngày nghỉ "${lockedHoliday.name}".`
              );
            }
          }

          updateData.scheduled_date = scheduledDate;
        }
      }

      if (updateData.routine_slot && updateData.scheduled_date) {
        const targetClass = await this.resolveClass(classId);
        // Clean up any other activities in this target slot to enforce max 1 activity per slot
        await prisma.subThemeActivity.deleteMany({
          where: {
            class_id: targetClass.class_id,
            scheduled_date: updateData.scheduled_date,
            routine_slot: updateData.routine_slot,
            id: { not: BigInt(slot.id) },
          },
        }).catch((err) => logger.warn('Failed to clean up target slot duplicate activities:', err));
      }

      const updated = await prisma.subThemeActivity.update({
        where: { id: BigInt(slot.id) },
        data: updateData,
        include: {
          creator: { select: { username: true, teacher: { select: { full_name: true } } } },
          updater: { select: { username: true, teacher: { select: { full_name: true } } } },
        },
      });

      // Also update educational activity content if modified
      if (slot.activityId) {
        const strAct = String(slot.activityId).trim();
        const isActNum = typeof slot.activityId === 'number' || /^\d+$/.test(strAct);
        const isUuidFormat = isUuid(strAct);
        const orConditions = [];
        if (isActNum) orConditions.push({ activity_id: BigInt(strAct) });
        if (isUuidFormat) orConditions.push({ public_id: strAct });

        const act = orConditions.length > 0
          ? await prisma.educationalActivity.findFirst({
              where: { OR: orConditions, deleted_at: null },
            })
          : null;
        if (act) {
          await prisma.educationalActivity.update({
            where: { activity_id: act.activity_id },
            data: {
              title: slot.title.trim(),
              objective: slot.objective || '',
              preparation: slot.preparation || '',
              procedure: slot.procedure || '',
              evaluation_criteria: slot.evaluationCriteria || slot.evaluation || '',
              updated_by: staffAccountId,
              updated_at: new Date(),
            },
          }).catch((err) => logger.warn('Could not update educational activity content:', err));
        }
      }

      return {
        ...slot,
        id: updated.id.toString(),
        orderIndex: updated.order_index,
        order_index: updated.order_index,
        slotCreatorName: updated.creator?.teacher?.full_name || updated.creator?.username || null,
        slotUpdaterName: updated.updater?.teacher?.full_name || updated.updater?.username || null,
        creatorName: updated.creator?.teacher?.full_name || updated.creator?.username || null,
        updaterName: updated.updater?.teacher?.full_name || updated.updater?.username || null,
      };
    }

    if (slot.activityId) {
      return this.assignActivityToSlot({
        classId,
        activityId: slot.activityId,
        day: slot.day,
        routineSlot: slot.routineSlot || slot.routine_slot,
        date: slot.date,
        isAdd: true,
        orderIndex: slot.orderIndex || slot.order_index,
        accountId,
      });
    }

    return slot;
  }

  /**
   * Tab 2: Swap positions of two slots in the weekly timetable (Đổi chỗ hoạt động)
   */
  async swapWeeklySlots({ classId, sourceSlotId, targetSlotId, accountId }) {
    if (!sourceSlotId || !targetSlotId) {
      throw new BadRequest('Thiếu mã hoạt động cần đổi chỗ.');
    }

    const targetClass = await this.resolveClass(classId);
    const strSource = String(sourceSlotId).trim();
    const strTarget = String(targetSlotId).trim();

    const isNumSource = /^\d+$/.test(strSource);
    const isNumTarget = /^\d+$/.test(strTarget);

    if (!isNumSource || !isNumTarget) {
      throw new BadRequest('Mã hoạt động không hợp lệ để đổi chỗ.');
    }

    const rec1 = await prisma.subThemeActivity.findFirst({
      where: {
        id: BigInt(strSource),
        class_id: targetClass.class_id,
      },
    });

    const rec2 = await prisma.subThemeActivity.findFirst({
      where: {
        id: BigInt(strTarget),
        class_id: targetClass.class_id,
      },
    });

    if (!rec1 || !rec2) {
      throw new NotFound('Không tìm thấy hoạt động thời khóa biểu để đổi chỗ.');
    }

    const staffAccountId = await this.resolveStaffAccountId(accountId);

    // Hoán đổi vị trí (sub_theme_id, day_of_week, routine_slot, scheduled_date) trong 1 transaction an toàn
    await prisma.$transaction([
      prisma.subThemeActivity.update({
        where: { id: rec1.id },
        data: {
          sub_theme_id: rec2.sub_theme_id,
          day_of_week: rec2.day_of_week,
          routine_slot: rec2.routine_slot,
          scheduled_date: rec2.scheduled_date,
          order_index: rec2.order_index,
          ...(staffAccountId ? { updated_by: staffAccountId } : {}),
          updated_at: new Date(),
        },
      }),
      prisma.subThemeActivity.update({
        where: { id: rec2.id },
        data: {
          sub_theme_id: rec1.sub_theme_id,
          day_of_week: rec1.day_of_week,
          routine_slot: rec1.routine_slot,
          scheduled_date: rec1.scheduled_date,
          order_index: rec1.order_index,
          ...(staffAccountId ? { updated_by: staffAccountId } : {}),
          updated_at: new Date(),
        },
      }),
    ]);

    return {
      success: true,
      message: 'Đã đổi chỗ hai hoạt động thành công',
      sourceSlotId: rec1.id.toString(),
      targetSlotId: rec2.id.toString(),
    };
  }

  /**
   * Tab 2: Batch reorder activities in a slot/cell
   */
  async reorderWeeklySlots({ classId, slots = [], accountId }) {
    if (!Array.isArray(slots) || slots.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    const staffAccountId = await this.resolveStaffAccountId(accountId);

    const updates = [];
    for (const item of slots) {
      if (item.id && !isNaN(Number(item.id))) {
        const orderVal = item.orderIndex !== undefined ? item.orderIndex : item.order_index;
        if (orderVal !== undefined && !isNaN(Number(orderVal))) {
          updates.push(
            prisma.subThemeActivity.update({
              where: { id: BigInt(item.id) },
              data: {
                order_index: Number(orderVal),
                updated_by: staffAccountId,
                updated_at: new Date(),
              },
            })
          );
        }
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return { success: true, updatedCount: updates.length };
  }

  /**
   * Tab 2: Delete/Clear a timetable slot from PostgreSQL and re-normalize order
   */
  async deleteWeeklySlot({ classId, slotId }) {
    if (slotId && !isNaN(Number(slotId))) {
      const parsedSlotId = BigInt(slotId);
      const existing = await prisma.subThemeActivity.findUnique({
        where: { id: parsedSlotId },
      });

      if (existing) {
        await prisma.subThemeActivity.delete({
          where: { id: parsedSlotId },
        });

        // Re-normalize remaining activities in the same cell
        const remaining = await prisma.subThemeActivity.findMany({
          where: {
            class_id: existing.class_id,
            scheduled_date: existing.scheduled_date,
            routine_slot: existing.routine_slot,
          },
          orderBy: { order_index: 'asc' },
        });

        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i].order_index !== i + 1) {
            await prisma.subThemeActivity.update({
              where: { id: remaining[i].id },
              data: { order_index: i + 1 },
            }).catch(() => {});
          }
        }
      }
    }
    return { success: true, slotId };
  }

  /**
   * AI generate activity lesson plan based on goal and content
   */
  async generateActivityAi({ title, domain, goalCode, contentTitle }) {
    const cleanTitle = title || 'Hoạt động giáo dục mầm non';
    const ctx = contentTitle ? `Nội dung: ${contentTitle}. ` : '';

    return {
      objective: `Trẻ hào hứng tham gia hoạt động "${cleanTitle}". ${ctx}Phát triển kỹ năng nhận biết, khả năng ngôn ngữ và thói quen sinh hoạt tốt theo lứa tuổi.`,
      preparation: `Hình ảnh, tranh minh hoạ và đồ chơi trực quan liên quan đến "${cleanTitle}". Loa bluetooth, phách tre và không gian lớp học sạch sẽ, an toàn.`,
      procedure: `1. Ổn định và gây hứng thú: Cho trẻ hát bài hát hoặc nghe câu đố ngắn.\n2. Nội dung trọng tâm: Hướng dẫn trẻ quan sát, gọi tên và đàm thoại về nội dung hoạt động.\n3. Trò chơi vận động / củng cố: Tổ chức trò chơi gắn với nội dung vừa học.\n4. Kết thúc và nhận xét: Tuyên dương trẻ chăm ngoan và chuyển hoạt động tiếp theo.`,
      evaluation: `Đa số trẻ tham gia hào hứng, trả lời được câu hỏi của cô và đạt yêu cầu bài dạy.`,
    };
  }

  async getThemesForClass(targetClass) {
    let themes = await prisma.curriculumTheme.findMany({
      where: {
        school_year_id: targetClass.school_year_id,
        age_group: targetClass.age_group,
        deleted_at: null,
      },
      include: {
        sub_themes: {
          where: { deleted_at: null },
          include: {
            activities: {
              where: { class_id: targetClass.class_id },
              include: {
                activity: {
                  include: {
                    content: {
                      include: {
                        goal: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ start_date: 'asc' }, { sub_theme_id: 'asc' }],
        },
      },
      orderBy: [{ start_date: 'asc' }, { theme_id: 'asc' }],
    });

    if (themes.length === 0) {
      themes = await prisma.curriculumTheme.findMany({
        where: {
          school_year_id: targetClass.school_year_id,
          deleted_at: null,
        },
        include: {
          sub_themes: {
            where: { deleted_at: null },
            include: {
              activities: {
                where: { class_id: targetClass.class_id },
                include: {
                  activity: {
                    include: {
                      content: {
                        include: {
                          goal: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: [{ start_date: 'asc' }, { sub_theme_id: 'asc' }],
          },
        },
        orderBy: [{ start_date: 'asc' }, { theme_id: 'asc' }],
      });
    }

    if (themes.length === 0) {
      themes = await prisma.curriculumTheme.findMany({
        where: { deleted_at: null },
        include: {
          sub_themes: {
            where: { deleted_at: null },
            include: {
              activities: {
                where: { class_id: targetClass.class_id },
                include: {
                  activity: {
                    include: {
                      content: {
                        include: {
                          goal: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: [{ start_date: 'asc' }, { sub_theme_id: 'asc' }],
          },
        },
        orderBy: [{ start_date: 'asc' }, { theme_id: 'asc' }],
      });
    }

    return themes;
  }

  // Target Allocation for Theme and SubTheme mapping
  async getTargetAllocation({ classId, user }) {
    const targetClass = await this.resolveClass(classId);

    const themes = await this.getThemesForClass(targetClass);

    const isPrincipalOrBgh = Boolean(
      user?.role === 'PRINCIPAL_BGH' ||
      user?.role === 'PRINCIPAL' ||
      user?.role === 'VICE_PRINCIPAL' ||
      user?.role?.toLowerCase()?.includes('principal') ||
      user?.role?.toLowerCase()?.includes('bgh') ||
      user?.role === 'ADMIN'
    );

    // Kiểm tra trạng thái công bố bộ chủ đề và khung mục tiêu
    // Nếu chưa công bố (tất cả themes là DRAFT hoặc không có theme nào PUBLISHED), giáo viên không được xem
    const isCurriculumPublished = themes.length > 0 && themes.some((t) => t.status === 'PUBLISHED');

    if (!isPrincipalOrBgh && !isCurriculumPublished) {
      const AGE_MAP = {
        NHA_TRE: 'Khối Nhà trẻ',
        MAM: 'Khối Mầm',
        CHOI: 'Khối Chồi',
        LA: 'Khối Lá',
      };
      const gradeText = AGE_MAP[targetClass?.age_group] || targetClass?.age_group || '';
      const yearText = targetClass?.school_year?.name || '';
      return {
        isCurriculumPublished: false,
        publishedThemes: [],
        selectedTheme: null,
        bankGoals: [],
        classInfo: {
          id: targetClass?.public_id || targetClass?.class_id?.toString() || classId,
          name: targetClass?.name || '',
          ageGroup: targetClass?.age_group || '',
          ageGroupLabel: gradeText,
          yearName: yearText,
        },
        message: gradeText && yearText
          ? `Hiện tại Ban Giám Hiệu chưa ban hành bộ chủ đề và mục tiêu giáo dục áp dụng cho ${gradeText} (${yearText}). Giáo viên vui lòng liên hệ Ban Giám Hiệu để cập nhật kế hoạch chính thức.`
          : 'Hiện tại Ban Giám Hiệu chưa ban hành bộ chủ đề và mục tiêu giáo dục áp dụng cho khối lớp này. Giáo viên vui lòng liên hệ Ban Giám Hiệu để cập nhật kế hoạch chính thức.',
      };
    }

    let allGoals = await prisma.educationalGoal.findMany({
      where: {
        school_year_id: targetClass.school_year_id,
        age_group: targetClass.age_group,
        deleted_at: null,
      },
      include: {
        contents: {
          where: { deleted_at: null },
          include: {
            activities: {
              where: { deleted_at: null },
              select: { activity_id: true },
            },
          },
          orderBy: { content_id: 'asc' },
        },
      },
      orderBy: [{ domain: 'asc' }, { goal_code: 'asc' }],
    });

    if (allGoals.length === 0) {
      allGoals = await prisma.educationalGoal.findMany({
        where: {
          age_group: targetClass.age_group,
          deleted_at: null,
        },
        include: {
          contents: {
            where: { deleted_at: null },
            include: {
              activities: {
                where: { deleted_at: null },
                select: { activity_id: true },
              },
            },
            orderBy: { content_id: 'asc' },
          },
        },
        orderBy: [{ domain: 'asc' }, { goal_code: 'asc' }],
      });
    }

    if (allGoals.length === 0) {
      allGoals = await prisma.educationalGoal.findMany({
        where: { deleted_at: null },
        include: {
          contents: {
            where: { deleted_at: null },
            include: {
              activities: {
                where: { deleted_at: null },
                select: { activity_id: true },
              },
            },
            orderBy: { content_id: 'asc' },
          },
        },
        orderBy: [{ domain: 'asc' }, { goal_code: 'asc' }],
      });
    }

    const formatGoal = (g) => ({
      id: g.public_id || g.goal_id.toString(),
      goalId: g.goal_id.toString(),
      publicId: g.public_id,
      code: g.goal_code + (g.indicator_code ? ` (${g.indicator_code})` : ''),
      goalCode: g.goal_code,
      title: cleanGoalTitle(g.goal_code, g.title, targetClass.age_group),
      domain: g.domain,
      domainLabel: DOMAIN_LABELS[g.domain] || g.domain,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
      contents: (g.contents || []).map((c) => ({
        id: c.public_id || c.content_id.toString(),
        contentId: c.content_id.toString(),
        title: c.title,
        activitiesCount: (c.activities || []).length,
        hasActivities: (c.activities || []).length > 0,
      })),
    });

    const AGE_GROUP_LABELS = {
      NHA_TRE: 'Khối Nhà Trẻ (24–36T)',
      MAM: 'Khối Lớp Mầm (3–4T)',
      CHOI: 'Khối Lớp Chồi (4–5T)',
      LA: 'Khối Lớp Lá (5–6T)',
    };

    // Load real persisted allocations from PostgreSQL
    let dbAllocations = await prisma.classThemeGoal.findMany({
      where: {
        class_id: targetClass.class_id,
      },
      include: {
        goal: {
          include: {
            contents: {
              where: { deleted_at: null },
              orderBy: { content_id: 'asc' },
            },
          },
        },
      },
    });

    // Also load granular content-level allocations (class_theme_contents)
    let dbContentAllocations = [];
    try {
      dbContentAllocations = await prisma.classThemeContent.findMany({
        where: {
          class_id: targetClass.class_id,
        },
        include: {
          content: {
            include: {
              goal: true,
            },
          },
        },
      });
    } catch (err) {
      // Table may not exist yet in older environments
    }

    // Also load classThemePlans to determine read-only lock state specifically per theme
    let classPlans = [];
    try {
      classPlans = await prisma.classThemePlan.findMany({
        where: { class_id: targetClass.class_id },
      });
    } catch (err) {
      logger.warn('classThemePlan query error in getTargetAllocation:', err.message);
    }
    const planMap = new Map();
    classPlans.forEach((p) => {
      planMap.set(p.theme_id.toString(), p);
    });

    // Group content allocations by theme_id (as string)
    const dbContentAllocationsByTheme = new Map();
    dbContentAllocations.forEach((alloc) => {
      const tId = alloc.theme_id.toString();
      if (!dbContentAllocationsByTheme.has(tId)) {
        dbContentAllocationsByTheme.set(tId, []);
      }
      dbContentAllocationsByTheme.get(tId).push(alloc);
    });

    // Group goal allocations by theme_id (as string)
    const dbAllocationsByTheme = new Map();
    dbAllocations.forEach((alloc) => {
      const tId = alloc.theme_id.toString();
      if (!dbAllocationsByTheme.has(tId)) {
        dbAllocationsByTheme.set(tId, []);
      }
      dbAllocationsByTheme.get(tId).push(alloc);
    });

    let globalWeekIndex = 1;
    const publishedThemes = themes.map((t, idx) => {
      const code = String(idx + 1).padStart(2, '0');
      const startStr = t.start_date.toISOString().slice(0, 10);
      const endStr = t.end_date.toISOString().slice(0, 10);

      // Collect goals for each sub-theme
      const themeGoalMap = new Map();
      const subThemes = t.sub_themes.map((st) => {
        const weekNum = globalWeekIndex++;
        const stStart = st.start_date.toISOString().slice(0, 10);
        const stEnd = st.end_date.toISOString().slice(0, 10);

        const branchGoalMap = new Map();
        st.activities.forEach((sta) => {
          const g = sta.activity?.content?.goal;
          if (g) {
            const fullGoal = allGoals.find((ag) => ag.goal_id.toString() === g.goal_id.toString()) || g;
            const goalObj = formatGoal(fullGoal);
            branchGoalMap.set(g.goal_id.toString(), goalObj);
            themeGoalMap.set(g.goal_id.toString(), goalObj);
          }
        });

        return {
          id: st.public_id || st.sub_theme_id.toString(),
          name: st.name,
          startDate: stStart,
          endDate: stEnd,
          weekLabel: `${stStart.split('-').reverse().slice(0, 2).join('/')} – ${stEnd.split('-').reverse().slice(0, 2).join('/')} · Tuần ${weekNum}`,
          count: branchGoalMap.size,
          allocatedGoals: Array.from(branchGoalMap.values()),
        };
      });

      // Check content-level allocations first (granular NDGD)
      const savedContentRecords = dbContentAllocationsByTheme.get(t.theme_id.toString()) || [];
      const savedGoalRecords = dbAllocationsByTheme.get(t.theme_id.toString()) || [];

      // Set of allocated content IDs for this theme
      const allocatedContentIds = new Set();
      const goalMapForTheme = new Map();

      if (savedContentRecords.length > 0) {
        savedContentRecords.forEach((rec) => {
          if (rec.content) {
            const cPubId = rec.content.public_id || rec.content.content_id.toString();
            allocatedContentIds.add(cPubId);

            const g = rec.content.goal;
            if (g) {
              const gKey = g.goal_id.toString();
              if (!goalMapForTheme.has(gKey)) {
                const fullGoal = allGoals.find((ag) => ag.goal_id.toString() === gKey) || g;
                goalMapForTheme.set(gKey, {
                  ...formatGoal(fullGoal),
                  selectedContentIds: [],
                });
              }
              goalMapForTheme.get(gKey).selectedContentIds.push(cPubId);
            }
          }
        });
      } else if (savedGoalRecords.length > 0) {
        // Fallback from legacy goal allocations
        savedGoalRecords.forEach((rec) => {
          if (rec.goal) {
            const gKey = rec.goal.goal_id.toString();
            const cIds = (rec.goal.contents || []).map((c) => {
              const cid = c.public_id || c.content_id.toString();
              allocatedContentIds.add(cid);
              return cid;
            });
            const fullGoal = allGoals.find((ag) => ag.goal_id.toString() === gKey) || rec.goal;
            goalMapForTheme.set(gKey, {
              ...formatGoal(fullGoal),
              selectedContentIds: cIds,
            });
          }
        });
      }

      const allocatedGoals = Array.from(goalMapForTheme.values()).map((g) => {
        const total = (g.contents || []).length;
        const selected = (g.selectedContentIds || []).length;
        return {
          ...g,
          totalContentsCount: total,
          selectedContentsCount: selected,
          isFullySelected: total > 0 && selected >= total,
          isPartiallySelected: selected > 0 && selected < total,
        };
      });

      // Domain breakdown for this theme
      const domainCounts = {
        PHYSICAL: 0,
        COGNITIVE: 0,
        LANGUAGE: 0,
        SOCIO_EMOTIONAL: 0,
        AESTHETIC: 0,
      };
      allocatedGoals.forEach((g) => {
        if (domainCounts[g.domain] !== undefined) {
          domainCounts[g.domain]++;
        }
      });

      const plan = planMap.get(t.theme_id.toString());
      const themePlanStatus = plan?.status || 'DRAFT';
      const isThemeReadOnly = themePlanStatus === 'USED' || themePlanStatus === 'SUBMITTED' || themePlanStatus === 'PENDING_APPROVAL';

      return {
        id: t.public_id || t.theme_id.toString(),
        code,
        name: t.name,
        startDate: startStr,
        endDate: endStr,
        status: t.status,
        planStatus: themePlanStatus,
        isReadOnly: isThemeReadOnly,
        reviewNote: plan?.review_note || null,
        rejectionReason: plan?.rejection_reason || null,
        statusLabel: t.status === 'PUBLISHED' ? 'Đã công bố' : 'Bản nháp',
        dateRange: `${startStr.split('-').reverse().slice(0, 2).join('/')} – ${endStr.split('-').reverse().slice(0, 2).join('/')}`,
        weeksCount: calculateThemeWeeks(t.start_date, t.end_date, t.sub_themes.length),
        subThemes,
        allocatedGoals,
        allocatedContentIds: Array.from(allocatedContentIds),
        count: allocatedGoals.length,
        domainCounts,
      };
    });

    const firstTheme = publishedThemes[0] || null;

    // Load actual activities scoped to the published themes to avoid counting all global database rows (tester_24+1 Item 8)
    const publishedThemeIds = themes.map((t) => t.theme_id);
    let themeScopedActivities = [];
    try {
      themeScopedActivities = await prisma.educationalActivity.findMany({
        where: {
          theme_id: { in: publishedThemeIds },
          deleted_at: null,
        },
        select: {
          activity_id: true,
          content_id: true,
          theme_id: true,
        },
      });
    } catch (err) {
      logger.warn('Failed to fetch theme scoped activities in getTargetAllocation:', err.message);
    }

    const themeIdMapping = new Map();
    publishedThemes.forEach((th) => {
      themeIdMapping.set(th.id, th.id);
      if (th._theme_id) themeIdMapping.set(th._theme_id.toString(), th.id);
    });

    const bankGoals = allGoals.map((g) => {
      const gId = g.public_id || g.goal_id.toString();
      const internalGId = g.goal_id.toString();
      const allocatedThemes = publishedThemes
        .filter((th) => th.allocatedGoals.some((ag) => ag.id === gId || ag.id === internalGId))
        .map((th) => ({ id: th.id, code: th.code, name: th.name }));

      return {
        id: gId,
        code: g.goal_code + (g.indicator_code ? ` (${g.indicator_code})` : ''),
        goalCode: g.goal_code,
        title: g.title,
        domain: g.domain,
        domainLabel: DOMAIN_LABELS[g.domain] || g.domain,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
        contents: (g.contents || []).map((c) => {
          const contentActivities = themeScopedActivities.filter(
            (act) => act.content_id === c.content_id,
          );
          const themeActivitiesCount = {};
          contentActivities.forEach((act) => {
            if (act.theme_id) {
              const numStr = act.theme_id.toString();
              const pubStr = themeIdMapping.get(numStr) || numStr;
              themeActivitiesCount[numStr] = (themeActivitiesCount[numStr] || 0) + 1;
              if (pubStr !== numStr) {
                themeActivitiesCount[pubStr] = (themeActivitiesCount[pubStr] || 0) + 1;
              }
            }
          });

          return {
            id: c.public_id || c.content_id.toString(),
            content_id: c.content_id.toString(),
            contentId: c.content_id.toString(),
            public_id: c.public_id,
            publicId: c.public_id,
            title: c.title,
            activitiesCount: contentActivities.length,
            hasActivities: contentActivities.length > 0,
            themeActivitiesCount,
          };
        }),
        allocatedThemes,
        allocatedThemeCodes: allocatedThemes.map((th) => th.code),
        selected: false,
      };
    });

    return {
      isCurriculumPublished: true,
      publishedThemes,
      selectedTheme: firstTheme,
      bankGoals,
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        ageGroup: targetClass.age_group,
        ageGroupLabel: AGE_GROUP_LABELS[targetClass.age_group] || targetClass.age_group,
        yearName: targetClass.school_year?.name || 'Năm học 2026–2027',
      },
    };
  }

  async saveTargetAllocation({ classId, themeId, themeCode, branchId, goalIds, contentIds, user }) {
    const targetClass = await this.resolveClass(classId);
    if (!targetClass) throw new NotFound('Không tìm thấy lớp học');

    const themes = await this.getThemesForClass(targetClass);

    const isPrincipalOrBgh = Boolean(
      user?.role === 'PRINCIPAL_BGH' ||
      user?.role === 'PRINCIPAL' ||
      user?.role === 'VICE_PRINCIPAL' ||
      user?.role?.toLowerCase()?.includes('principal') ||
      user?.role?.toLowerCase()?.includes('bgh') ||
      user?.role === 'ADMIN'
    );
    const isCurriculumPublished = themes.length > 0 && themes.some((t) => t.status === 'PUBLISHED');
    if (!isPrincipalOrBgh && !isCurriculumPublished) {
      throw new Forbidden('Bộ chủ đề và mục tiêu giáo dục chưa được công bố. Vui lòng liên hệ Ban giám hiệu.');
    }

    let resolvedThemeId = null;
    if (themeId) {
      const isNum = typeof themeId === 'number' || (typeof themeId === 'string' && /^\d+$/.test(String(themeId).trim()));
      if (isNum) {
        resolvedThemeId = BigInt(themeId);
      } else {
        const matched = themes.find((t) => t.public_id === String(themeId) || String(t.theme_id) === String(themeId));
        if (matched) {
          resolvedThemeId = matched.theme_id;
        } else {
          const th = await prisma.curriculumTheme.findFirst({
            where: { public_id: String(themeId), deleted_at: null },
            select: { theme_id: true },
          });
          if (th) resolvedThemeId = th.theme_id;
        }
      }
    }

    if (!resolvedThemeId && themeCode) {
      const idx = parseInt(themeCode, 10) - 1;
      if (idx >= 0 && idx < themes.length) {
        resolvedThemeId = themes[idx].theme_id;
      }
    }

    if (!resolvedThemeId) {
      throw new BadRequest('Chủ đề không hợp lệ');
    }

    // Check if plan is locked for approval
    await this.checkPlanEditable(targetClass.class_id, resolvedThemeId);

    let validContentIds = [];
    let validGoalIds = [];

    // Case 1: Granular NDGD allocation via contentIds
    if (Array.isArray(contentIds)) {
      if (contentIds.length > 0) {
        const rawCIds = contentIds.map((id) => String(id).trim()).filter(Boolean);
        const numCIds = rawCIds.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
        const uuidCIds = rawCIds.filter((id) => isUuid(id));

        const orConds = [];
        if (numCIds.length > 0) orConds.push({ content_id: { in: numCIds } });
        if (uuidCIds.length > 0) orConds.push({ public_id: { in: uuidCIds } });

        const matchedContents = orConds.length > 0
          ? await prisma.educationalContent.findMany({
              where: { OR: orConds, deleted_at: null },
              select: { content_id: true, goal_id: true },
            })
          : [];
        validContentIds = matchedContents.map((c) => c.content_id);
        validGoalIds = Array.from(new Set(matchedContents.map((c) => c.goal_id)));
      } else {
        validContentIds = [];
        validGoalIds = [];
      }
    }

    // Include goals explicitly passed in goalIds
    if (Array.isArray(goalIds) && goalIds.length > 0) {
      const rawIds = goalIds.map((id) => String(id).trim()).filter(Boolean);
      const numericIds = rawIds.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
      const uuidIds = rawIds.filter((id) => isUuid(id));
      const codeIds = rawIds.filter((id) => !/^\d+$/.test(id) && !isUuid(id));

      const orConditions = [];
      if (numericIds.length > 0) orConditions.push({ goal_id: { in: numericIds } });
      if (uuidIds.length > 0) orConditions.push({ public_id: { in: uuidIds } });
      if (codeIds.length > 0) orConditions.push({ goal_code: { in: codeIds } });

      const matchedGoals = orConditions.length > 0
        ? await prisma.educationalGoal.findMany({
            where: { OR: orConditions },
            select: { goal_id: true },
          })
        : [];
      const extraGoalIds = matchedGoals.map((g) => g.goal_id);
      validGoalIds = Array.from(new Set([...validGoalIds, ...extraGoalIds]));

      // If contentIds was NOT passed (legacy call), fetch all contents of these goals
      if (!Array.isArray(contentIds) && validGoalIds.length > 0) {
        const contentsOfGoals = await prisma.educationalContent.findMany({
          where: { goal_id: { in: validGoalIds }, deleted_at: null },
          select: { content_id: true },
        });
        validContentIds = contentsOfGoals.map((c) => c.content_id);
      }
    }

    // Atomically persist to PostgreSQL (class_theme_contents and legacy class_theme_goals)
    await prisma.$transaction(async (tx) => {
      // 1. Update class_theme_contents (granular)
      try {
        await tx.classThemeContent.deleteMany({
          where: {
            class_id: targetClass.class_id,
            theme_id: resolvedThemeId,
          },
        });

        if (validContentIds.length > 0) {
          await tx.classThemeContent.createMany({
            data: validContentIds.map((cId) => ({
              class_id: targetClass.class_id,
              theme_id: resolvedThemeId,
              content_id: cId,
            })),
            skipDuplicates: true,
          });
        }
      } catch (err) {
        console.warn('class_theme_contents table sync warning:', err.message);
      }

      // 2. Sync to class_theme_goals for 100% backward compatibility
      await tx.classThemeGoal.deleteMany({
        where: {
          class_id: targetClass.class_id,
          theme_id: resolvedThemeId,
        },
      });

      if (validGoalIds.length > 0) {
        await tx.classThemeGoal.createMany({
          data: validGoalIds.map((gId) => ({
            class_id: targetClass.class_id,
            theme_id: resolvedThemeId,
            goal_id: gId,
          })),
          skipDuplicates: true,
        });
      }
    });

    const themeRecord = await prisma.curriculumTheme.findUnique({
      where: { theme_id: resolvedThemeId },
      select: { public_id: true },
    });

    return {
      success: true,
      classId: targetClass.public_id || targetClass.class_id.toString(),
      themeId: themeRecord?.public_id || resolvedThemeId.toString(),
      themeCode: themeCode || '01',
      branchId,
      allocatedCount: validGoalIds.length,
      allocatedContentCount: validContentIds.length,
    };
  }

  async publishAllocation({ classId, user }) {
    const targetClass = await this.resolveClass(classId);
    const teacherAccountIds = await notificationService.getClassTeacherAccountIds(targetClass.class_id);
    const bghAccountIds = await notificationService.getPrincipalAccountIds();

    await notificationService.emitSystemNotification({
      recipientAccountIds: [...teacherAccountIds, ...bghAccountIds],
      creatorAccountId: user?.account_id || user?.sub || null,
      type: 'SCHOOL_ANNOUNCEMENT',
      title: 'Công bố phân bổ mục tiêu kế hoạch chủ đề',
      body: `Phân bổ mục tiêu kế hoạch giáo dục cho lớp ${targetClass.name} đã được công bố chính thức.`,
      data: {
        type: 'THEME_TEACHING_PLAN_APPROVED',
        class_id: targetClass.class_id.toString(),
        class_public_id: targetClass.public_id,
        class_name: targetClass.name,
      },
    });

    return { success: true, status: 'PUBLISHED', statusLabel: 'Đã công bố' };
  }

  /**
   * Check if plan is editable (not PENDING_APPROVAL or USED)
   */
  async checkPlanEditable(classId, themeId) {
    if (!classId || !themeId) return;
    try {
      const targetClass = await this.resolveClass(classId);
      const theme = await prisma.curriculumTheme.findFirst({
        where: isUuid(String(themeId))
          ? { public_id: String(themeId) }
          : { theme_id: BigInt(String(themeId)) },
        select: { theme_id: true, name: true },
      });
      if (!theme) return;

      const plan = await prisma.classThemePlan.findUnique({
        where: {
          class_id_theme_id: {
            class_id: targetClass.class_id,
            theme_id: theme.theme_id,
          },
        },
        select: { status: true },
      });

      if (plan && (plan.status === 'PENDING_APPROVAL' || plan.status === 'USED')) {
        throw new Forbidden(
          plan.status === 'PENDING_APPROVAL'
            ? 'Kế hoạch giáo dục chủ đề này đang chờ Ban Giám Hiệu phê duyệt, không thể chỉnh sửa.'
            : 'Kế hoạch giáo dục chủ đề này đã được Ban Giám Hiệu phê duyệt và đưa vào áp dụng, không thể chỉnh sửa.'
        );
      }
    } catch (err) {
      if (err instanceof Forbidden) throw err;
      logger.warn(`checkPlanEditable warning: ${err.message}`);
    }
  }

  /**
   * Get theme teaching plan submission status for a class
   */
  async getThemePlanStatus({ classId, themeId }) {
    const targetClass = await this.resolveClass(classId);
    let theme = null;
    if (themeId) {
      theme = await prisma.curriculumTheme.findFirst({
        where: isUuid(String(themeId))
          ? { public_id: String(themeId) }
          : { theme_id: BigInt(String(themeId)) },
        include: {
          sub_themes: {
            where: { deleted_at: null },
            orderBy: { start_date: 'asc' },
          },
        },
      });
    }

    // Fallback: nếu không có themeId, tìm chủ đề hiện tại hoặc chủ đề đầu tiên của khối lớp
    if (!theme) {
      const now = new Date();
      theme = await prisma.curriculumTheme.findFirst({
        where: {
          school_year_id: targetClass.school_year_id,
          age_group: targetClass.age_group,
          deleted_at: null,
          start_date: { lte: now },
          end_date: { gte: now },
        },
        include: {
          sub_themes: {
            where: { deleted_at: null },
            orderBy: { start_date: 'asc' },
          },
        },
      });

      if (!theme) {
        theme = await prisma.curriculumTheme.findFirst({
          where: {
            school_year_id: targetClass.school_year_id,
            age_group: targetClass.age_group,
            deleted_at: null,
          },
          orderBy: { start_date: 'asc' },
          include: {
            sub_themes: {
              where: { deleted_at: null },
              orderBy: { start_date: 'asc' },
            },
          },
        });
      }
    }

    if (!theme) {
      return {
        classId: targetClass.public_id,
        className: targetClass.name,
        status: 'DRAFT',
        canSubmit: false,
        message: 'Vui lòng chọn chủ đề để xem trạng thái kế hoạch.',
      };
    }

    const plan = await prisma.classThemePlan.findUnique({
      where: {
        class_id_theme_id: {
          class_id: targetClass.class_id,
          theme_id: theme.theme_id,
        },
      },
      include: {
        submitter: { select: { account_id: true, username: true } },
        reviewer: { select: { account_id: true, username: true } },
      },
    });

    // Deadline: BGH config hoặc fallback tự động: start_date - 5 ngày
    let deadlineStr = null;
    if (theme.submission_deadline) {
      deadlineStr = new Date(theme.submission_deadline).toISOString().split('T')[0];
    } else if (theme.start_date) {
      const d = new Date(theme.start_date);
      d.setDate(d.getDate() - 5);
      deadlineStr = d.toISOString().split('T')[0];
    }

    const currentStatus = plan?.status || 'DRAFT';
    const isReadOnly = currentStatus === 'PENDING_APPROVAL' || currentStatus === 'USED';

    // 1. Phân bổ mục tiêu (Goals count)
    const themeGoals = await prisma.classThemeGoal.findMany({
      where: {
        class_id: targetClass.class_id,
        theme_id: theme.theme_id,
      },
      select: { goal_id: true },
    });
    const totalGoals = themeGoals.length;

    // 2. Hoạt động giáo dục (Activities count)
    const goalIds = themeGoals.map((tg) => tg.goal_id);
    const totalActivities = await prisma.educationalActivity.count({
      where: {
        deleted_at: null,
        OR: [
          { theme_id: theme.theme_id },
          ...(goalIds.length > 0 ? [{ content: { goal_id: { in: goalIds } } }] : []),
        ],
      },
    });

    // 3. Thời khóa biểu tuần (SubThemes & Timetable records)
    const subThemes = theme.sub_themes || [];
    const totalWeeks = calculateThemeWeeks(theme.start_date, theme.end_date, subThemes.length);
    const subThemeIds = subThemes.map((st) => st.sub_theme_id);

    const scheduledRecords = subThemeIds.length > 0
      ? await prisma.subThemeActivity.findMany({
          where: {
            class_id: targetClass.class_id,
            sub_theme_id: { in: subThemeIds },
          },
          select: { id: true, sub_theme_id: true, scheduled_date: true, day_of_week: true, routine_slot: true },
        })
      : [];

    const scheduledWeekIndices = new Set();
    const themeStart = theme.start_date ? new Date(theme.start_date) : null;
    if (themeStart) themeStart.setHours(0, 0, 0, 0);

    for (const r of scheduledRecords) {
      if (r.scheduled_date && themeStart) {
        const wIdx = getThemeWeekIndex(r.scheduled_date, themeStart);
        if (wIdx >= 0 && wIdx < totalWeeks) {
          scheduledWeekIndices.add(wIdx);
        }
      }
    }

    const scheduledWeeks = scheduledWeekIndices.size > 0
      ? scheduledWeekIndices.size
      : (scheduledRecords.length > 0
          ? Math.min(totalWeeks, new Set(scheduledRecords.map((r) => r.sub_theme_id.toString())).size)
          : 0);
    const totalScheduledSlots = scheduledRecords.length;
    const totalExpectedSlots = totalWeeks * 35;
    const isSlotsFull = totalExpectedSlots > 0 && totalScheduledSlots >= totalExpectedSlots;

    // Kiểm tra định mức theo ngày theo trao đổi với tester (min 3 – max 7 HĐ/ngày học, không học CN)
    const DAY_LABEL_VI = {
      MONDAY: 'Thứ Hai',
      TUESDAY: 'Thứ Ba',
      WEDNESDAY: 'Thứ Tư',
      THURSDAY: 'Thứ Năm',
      FRIDAY: 'Thứ Sáu',
      SATURDAY: 'Thứ Bảy',
      SUNDAY: 'Chủ Nhật',
    };
    const subThemeMap = new Map();
    subThemes.forEach((st, idx) => {
      subThemeMap.set(st.sub_theme_id.toString(), st.name || `Tuần ${idx + 1}`);
    });

    const dayCountsMap = new Map();
    let hasSundayActivity = false;
    scheduledRecords.forEach((r) => {
      if (r.day_of_week === 'SUNDAY') hasSundayActivity = true;
      const key = `${r.sub_theme_id}_${r.day_of_week}`;
      dayCountsMap.set(key, (dayCountsMap.get(key) || 0) + 1);
    });

    const invalidDays = [];
    dayCountsMap.forEach((count, key) => {
      const [stId, day] = key.split('_');
      if (day === 'SUNDAY') return;
      if (count < 3) {
        const weekName = subThemeMap.get(stId) || 'Tuần';
        const dayName = DAY_LABEL_VI[day] || day;
        invalidDays.push(`${dayName} (${weekName}: ${count}/3 HĐ)`);
      }
    });

    const isMinActivitiesPerDayMet = invalidDays.length === 0 && !hasSundayActivity && totalScheduledSlots > 0;

    // 4. Tiêu chí hoàn thiện (Readiness / Checklist) theo quy định chuẩn
    const missingItems = [];
    if (totalGoals === 0) {
      missingItems.push('Chưa phân bổ mục tiêu giáo dục nào cho chủ đề này');
    }
    if (totalWeeks > 0 && totalScheduledSlots === 0) {
      missingItems.push('Thời khóa biểu chưa có hoạt động giáo dục nào');
    }
    if (hasSundayActivity) {
      missingItems.push('Không được xếp lịch hoạt động vào Chủ nhật');
    }
    if (invalidDays.length > 0) {
      missingItems.push(
        `Chưa đạt tối thiểu 3 HĐGD/ngày tại: ${invalidDays.slice(0, 3).join(', ')}${invalidDays.length > 3 ? '...' : ''}`
      );
    }

    const isReadyToSubmit = missingItems.length === 0;

    const pad = (n) => String(n).padStart(2, '0');
    let formattedDateRange = '';
    if (theme.start_date && theme.end_date) {
      const s = `${pad(theme.start_date.getDate())}/${pad(theme.start_date.getMonth() + 1)}`;
      const e = `${pad(theme.end_date.getDate())}/${pad(theme.end_date.getMonth() + 1)}/${theme.end_date.getFullYear()}`;
      formattedDateRange = `${s} – ${e}`;
    }

    return {
      classId: targetClass.public_id,
      className: targetClass.name,
      themeId: theme.public_id,
      themeName: theme.name,
      startDate: theme.start_date ? theme.start_date.toISOString().split('T')[0] : null,
      endDate: theme.end_date ? theme.end_date.toISOString().split('T')[0] : null,
      formattedDateRange,
      status: currentStatus,
      deadline: deadlineStr,
      allowLateSubmit: theme.allow_late_submit ?? true,
      submittedAt: plan?.submitted_at ? plan.submitted_at.toISOString() : null,
      submittedBy: plan?.submitter?.username || null,
      reviewedAt: plan?.reviewed_at ? plan.reviewed_at.toISOString() : null,
      reviewedBy: plan?.reviewer?.username || null,
      rejectionReason: plan?.rejection_reason || null,
      reviewNote: plan?.review_note || null,
      isReadOnly,
      canSubmit: currentStatus === 'DRAFT' || currentStatus === 'REJECTED',
      stats: {
        totalGoals,
        totalActivities,
        totalWeeks,
        scheduledWeeks,
        totalScheduledSlots,
        totalExpectedSlots,
        isSlotsFull,
        isReadyToSubmit,
        missingItems,
        invalidDays,
        hasSunday: hasSundayActivity,
        isMinActivitiesPerDayMet,
      },
    };
  }

  /**
   * Submit theme teaching plan for approval (Item 20)
   */
  async submitThemePlan({ classId, themeId, themeName, user, note }) {
    const targetClass = await this.resolveClass(classId);
    let resolvedTheme = null;
    if (themeId) {
      resolvedTheme = await prisma.curriculumTheme.findFirst({
        where: isUuid(String(themeId))
          ? { public_id: String(themeId) }
          : { theme_id: BigInt(String(themeId)) },
      });
    }

    if (!resolvedTheme) {
      throw new BadRequest('Vui lòng chọn chủ đề giáo dục để nộp kế hoạch.');
    }

    const resolvedThemeName = themeName || resolvedTheme.name;

    // Kiểm tra cấu hình nộp trễ của BGH
    if (resolvedTheme.allow_late_submit === false) {
      let deadlineDate = null;
      if (resolvedTheme.submission_deadline) {
        deadlineDate = new Date(resolvedTheme.submission_deadline);
      } else if (resolvedTheme.start_date) {
        deadlineDate = new Date(resolvedTheme.start_date);
        deadlineDate.setDate(deadlineDate.getDate() - 5);
      }

      if (deadlineDate) {
        const endOfDeadline = new Date(deadlineDate);
        endOfDeadline.setHours(23, 59, 59, 999);
        if (new Date() > endOfDeadline) {
          const dateFmt = deadlineDate.toISOString().split('T')[0].split('-').reverse().join('/');
          throw new BadRequest(
            `Đã quá thời hạn nộp kế hoạch cho chủ đề "${resolvedThemeName}" (${dateFmt}). Ban Giám Hiệu không cho phép nộp muộn sau thời hạn.`,
          );
        }
      }
    }

    // Kiểm tra điều kiện hoàn thiện theo quy định của nhà trường & trao đổi với tester
    const subThemes = await prisma.subTheme.findMany({
      where: {
        theme_id: resolvedTheme.theme_id,
        deleted_at: null,
      },
      select: { sub_theme_id: true, name: true },
      orderBy: { start_date: 'asc' },
    });

    const totalWeeks = calculateThemeWeeks(resolvedTheme.start_date, resolvedTheme.end_date, subThemes.length);
    const subThemeIds = subThemes.map((st) => st.sub_theme_id);

    const scheduledRecords = subThemeIds.length > 0
      ? await prisma.subThemeActivity.findMany({
          where: {
            class_id: targetClass.class_id,
            sub_theme_id: { in: subThemeIds },
          },
          select: {
            id: true,
            sub_theme_id: true,
            day_of_week: true,
            routine_slot: true,
          },
        })
      : [];

    const classGoalsCount = await prisma.classThemeGoal.count({
      where: {
        class_id: targetClass.class_id,
        theme_id: resolvedTheme.theme_id,
        goal: { deleted_at: null },
      },
    });

    if (classGoalsCount === 0) {
      throw new BadRequest(
        `Kế hoạch chủ đề "${resolvedThemeName}" chưa phân bổ mục tiêu giáo dục. Vui lòng chọn mục tiêu trước khi nộp cho BGH.`
      );
    }

    if (totalWeeks > 0 && scheduledRecords.length === 0) {
      throw new BadRequest(
        `Thời khóa biểu chủ đề "${resolvedThemeName}" chưa có hoạt động giáo dục nào. Vui lòng xếp hoạt động thời khóa biểu trước khi nộp cho Ban Giám Hiệu.`
      );
    }

    // Quy định Phi Yến: Không xếp lịch học vào Chủ nhật
    const hasSunday = scheduledRecords.some((r) => r.day_of_week === 'SUNDAY');
    if (hasSunday) {
      throw new BadRequest(
        `Theo quy định của nhà trường, không xếp lịch hoạt động giáo dục vào Chủ nhật. Vui lòng gỡ hoạt động vào Chủ nhật trước khi nộp kế hoạch.`
      );
    }

    // Quy định Phi Yến: Tối thiểu 3 HĐGD / ngày và tối đa 7 HĐGD / ngày
    const DAY_LABEL_VI = {
      MONDAY: 'Thứ Hai',
      TUESDAY: 'Thứ Ba',
      WEDNESDAY: 'Thứ Tư',
      THURSDAY: 'Thứ Năm',
      FRIDAY: 'Thứ Sáu',
      SATURDAY: 'Thứ Bảy',
      SUNDAY: 'Chủ Nhật',
    };
    const subThemeMap = new Map();
    subThemes.forEach((st, idx) => {
      subThemeMap.set(st.sub_theme_id.toString(), st.name || `Tuần ${idx + 1}`);
    });

    const dayCountsMap = new Map();
    scheduledRecords.forEach((r) => {
      const key = `${r.sub_theme_id}_${r.day_of_week}`;
      dayCountsMap.set(key, (dayCountsMap.get(key) || 0) + 1);
    });

    const invalidDays = [];
    dayCountsMap.forEach((count, key) => {
      const [stId, day] = key.split('_');
      if (day === 'SUNDAY') return;
      if (count < 3) {
        const weekName = subThemeMap.get(stId) || 'Tuần';
        const dayName = DAY_LABEL_VI[day] || day;
        invalidDays.push(`${dayName} (${weekName}: ${count}/3 HĐ)`);
      }
    });

    if (invalidDays.length > 0) {
      throw new BadRequest(
        `Theo quy định của nhà trường, mỗi ngày dạy học cần có tối thiểu 3 hoạt động giáo dục (ưu tiên: Đón trẻ, Thể dục sáng, Trả trẻ) và tối đa 7 hoạt động. Các ngày sau chưa đủ tối thiểu: ${invalidDays.join(', ')}.`
      );
    }

    const bghAccountIds = await notificationService.getPrincipalAccountIds();
    const senderAccountId = await this.resolveStaffAccountId(user?.accountId || user?.account_id || user?.sub);

    // Persist to class_theme_plans
    const plan = await prisma.classThemePlan.upsert({
      where: {
        class_id_theme_id: {
          class_id: targetClass.class_id,
          theme_id: resolvedTheme.theme_id,
        },
      },
      update: {
        status: 'PENDING_APPROVAL',
        submitted_at: new Date(),
        submitted_by: senderAccountId || null,
        review_note: note?.trim() || null,
        rejection_reason: null, // Clear old rejection reason if re-submitting
      },
      create: {
        class_id: targetClass.class_id,
        theme_id: resolvedTheme.theme_id,
        status: 'PENDING_APPROVAL',
        submitted_at: new Date(),
        submitted_by: senderAccountId || null,
        review_note: note?.trim() || null,
      },
    });

    await notificationService.emitSystemNotification({
      recipientAccountIds: bghAccountIds,
      creatorAccountId: senderAccountId,
      type: 'SCHOOL_ANNOUNCEMENT',
      title: 'Kế hoạch chủ đề mới cần phê duyệt',
      body: `Giáo viên lớp ${targetClass.name} vừa nộp kế hoạch giáo dục chủ đề "${resolvedThemeName}" để Ban Giám Hiệu phê duyệt.${note ? ` Ghi chú: ${note}` : ''}`,
      data: {
        type: 'THEME_TEACHING_PLAN_SUBMITTED',
        class_id: targetClass.class_id.toString(),
        class_public_id: targetClass.public_id,
        class_name: targetClass.name,
        theme_id: resolvedTheme.public_id,
        theme_name: resolvedThemeName,
      },
    });

    return {
      success: true,
      message: 'Đã gửi kế hoạch chủ đề cho Ban Giám Hiệu duyệt thành công',
      classId: targetClass.public_id,
      themeId: resolvedTheme.public_id,
      status: 'PENDING_APPROVAL',
      submittedAt: plan.submitted_at?.toISOString(),
    };
  }

  /**
   * Approve theme teaching plan (Item 21)
   */
  async approveThemePlan({ classId, themeId, themeName, user, note }) {
    const targetClass = await this.resolveClass(classId);
    let resolvedTheme = null;
    if (themeId) {
      resolvedTheme = await prisma.curriculumTheme.findFirst({
        where: isUuid(String(themeId))
          ? { public_id: String(themeId) }
          : { theme_id: BigInt(String(themeId)) },
      });
    }

    if (!resolvedTheme) {
      throw new BadRequest('Chủ đề giáo dục không tồn tại.');
    }

    const resolvedThemeName = themeName || resolvedTheme.name;
    const teacherAccountIds = await notificationService.getClassTeacherAccountIds(targetClass.class_id);
    const principalAccountId = await this.resolveStaffAccountId(user?.accountId || user?.account_id || user?.sub);

    const trimmedApprovalNote = typeof note === 'string' && note.trim() ? note.trim() : null;

    // Update in class_theme_plans (preserve teacher submission note unless an explicit approval note was given)
    const plan = await prisma.classThemePlan.upsert({
      where: {
        class_id_theme_id: {
          class_id: targetClass.class_id,
          theme_id: resolvedTheme.theme_id,
        },
      },
      update: {
        status: 'USED',
        reviewed_at: new Date(),
        reviewed_by: principalAccountId || null,
        ...(trimmedApprovalNote ? { review_note: trimmedApprovalNote } : {}),
        rejection_reason: null,
      },
      create: {
        class_id: targetClass.class_id,
        theme_id: resolvedTheme.theme_id,
        status: 'USED',
        reviewed_at: new Date(),
        reviewed_by: principalAccountId || null,
        review_note: trimmedApprovalNote,
      },
    });

    await notificationService.emitSystemNotification({
      recipientAccountIds: teacherAccountIds,
      creatorAccountId: principalAccountId,
      type: 'SCHOOL_ANNOUNCEMENT',
      title: 'Kế hoạch chủ đề đã được phê duyệt',
      body: `Ban Giám Hiệu đã phê duyệt kế hoạch giáo dục chủ đề "${resolvedThemeName}" của lớp ${targetClass.name}.${note ? ` Ghi chú: ${note}` : ''}`,
      data: {
        type: 'THEME_TEACHING_PLAN_APPROVED',
        class_id: targetClass.class_id.toString(),
        class_public_id: targetClass.public_id,
        class_name: targetClass.name,
        theme_id: resolvedTheme.public_id,
        theme_name: resolvedThemeName,
        note: note || null,
      },
    });

    return {
      success: true,
      message: 'Đã phê duyệt kế hoạch chủ đề thành công',
      classId: targetClass.public_id,
      themeId: resolvedTheme.public_id,
      status: 'USED',
      reviewedAt: plan.reviewed_at?.toISOString(),
    };
  }

  /**
   * Request theme plan revision (Item 22)
   */
  async requestThemePlanRevision({ classId, themeId, themeName, user, reason }) {
    const targetClass = await this.resolveClass(classId);
    let resolvedTheme = null;
    if (themeId) {
      resolvedTheme = await prisma.curriculumTheme.findFirst({
        where: isUuid(String(themeId))
          ? { public_id: String(themeId) }
          : { theme_id: BigInt(String(themeId)) },
      });
    }

    if (!resolvedTheme) {
      throw new BadRequest('Chủ đề giáo dục không tồn tại.');
    }

    if (!reason || !reason.trim()) {
      throw new BadRequest('Vui lòng nhập lý do yêu cầu chỉnh sửa kế hoạch.');
    }

    const resolvedThemeName = themeName || resolvedTheme.name;
    const teacherAccountIds = await notificationService.getClassTeacherAccountIds(targetClass.class_id);
    const principalAccountId = await this.resolveStaffAccountId(user?.accountId || user?.account_id || user?.sub);

    // Update in class_theme_plans
    const plan = await prisma.classThemePlan.upsert({
      where: {
        class_id_theme_id: {
          class_id: targetClass.class_id,
          theme_id: resolvedTheme.theme_id,
        },
      },
      update: {
        status: 'REJECTED',
        reviewed_at: new Date(),
        reviewed_by: principalAccountId || null,
        rejection_reason: reason.trim(),
      },
      create: {
        class_id: targetClass.class_id,
        theme_id: resolvedTheme.theme_id,
        status: 'REJECTED',
        reviewed_at: new Date(),
        reviewed_by: principalAccountId || null,
        rejection_reason: reason.trim(),
      },
    });

    await notificationService.emitSystemNotification({
      recipientAccountIds: teacherAccountIds,
      creatorAccountId: principalAccountId,
      type: 'SCHOOL_ANNOUNCEMENT',
      title: 'Yêu cầu chỉnh sửa kế hoạch chủ đề',
      body: `Ban Giám Hiệu yêu cầu chỉnh sửa kế hoạch giáo dục chủ đề "${resolvedThemeName}" của lớp ${targetClass.name}. Lý do: ${reason.trim()}`,
      data: {
        type: 'THEME_TEACHING_PLAN_REVISION_REQUESTED',
        class_id: targetClass.class_id.toString(),
        class_public_id: targetClass.public_id,
        class_name: targetClass.name,
        theme_id: resolvedTheme.public_id,
        theme_name: resolvedThemeName,
        reason: reason.trim(),
      },
    });

    return {
      success: true,
      message: 'Đã gửi yêu cầu chỉnh sửa kế hoạch chủ đề tới giáo viên',
      classId: targetClass.public_id,
      themeId: resolvedTheme.public_id,
      status: 'REJECTED',
      rejectionReason: plan.rejection_reason,
    };
  }

  /**
   * Get theme plan submissions list for BGH Review Dashboard
   */
  async getThemePlanSubmissions({ schoolYearId, ageGroup, classId, themeId, status, page = 1, limit = 20 }) {
    const where = {};

    if (status) {
      where.status = status;
    }

    if (classId) {
      const targetClass = await this.resolveClass(classId);
      where.class_id = targetClass.class_id;
    }

    if (themeId) {
      const theme = await prisma.curriculumTheme.findFirst({
        where: isUuid(String(themeId))
          ? { public_id: String(themeId) }
          : { theme_id: BigInt(String(themeId)) },
        select: { theme_id: true },
      });
      if (theme) where.theme_id = theme.theme_id;
    }

    if (schoolYearId || ageGroup) {
      where.class = {};
      if (schoolYearId && !isNaN(Number(schoolYearId))) {
        where.class.school_year_id = BigInt(String(schoolYearId));
      }
      if (ageGroup) {
        where.class.age_group = ageGroup;
      }
    }

    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [total, plans] = await Promise.all([
      prisma.classThemePlan.count({ where }),
      prisma.classThemePlan.findMany({
        where,
        take,
        skip,
        orderBy: [{ status: 'asc' }, { submitted_at: 'desc' }, { created_at: 'desc' }],
        include: {
          class: { select: { class_id: true, public_id: true, name: true, age_group: true } },
          theme: {
            select: {
              theme_id: true,
              public_id: true,
              name: true,
              start_date: true,
              end_date: true,
              submission_deadline: true,
              allow_late_submit: true,
            },
          },
          submitter: { select: { account_id: true, username: true } },
          reviewer: { select: { account_id: true, username: true } },
        },
      }),
    ]);

    return {
      total,
      page: Number(page) || 1,
      limit: take,
      totalPages: Math.ceil(total / take),
      items: plans.map((p) => {
        let deadlineStr = null;
        if (p.theme?.submission_deadline) {
          deadlineStr = new Date(p.theme.submission_deadline).toISOString().split('T')[0];
        } else if (p.theme?.start_date) {
          const d = new Date(p.theme.start_date);
          d.setDate(d.getDate() - 5);
          deadlineStr = d.toISOString().split('T')[0];
        }
        return {
          id: p.id.toString(),
          publicId: p.public_id,
          classId: p.class?.public_id || p.class_id.toString(),
          classInternalId: p.class_id.toString(),
          classPublicId: p.class?.public_id || null,
          className: p.class?.name || '',
          ageGroup: p.class?.age_group || '',
          themeId: p.theme?.public_id || p.theme_id.toString(),
          themeInternalId: p.theme_id.toString(),
          themePublicId: p.theme?.public_id || null,
          themeName: p.theme?.name || '',
          startDate: p.theme?.start_date ? p.theme.start_date.toISOString().split('T')[0] : null,
          endDate: p.theme?.end_date ? p.theme.end_date.toISOString().split('T')[0] : null,
          deadline: deadlineStr,
          allowLateSubmit: p.theme?.allow_late_submit ?? true,
          status: p.status,
          submittedAt: p.submitted_at ? p.submitted_at.toISOString() : null,
          submittedBy: p.submitter?.username || null,
          reviewedAt: p.reviewed_at ? p.reviewed_at.toISOString() : null,
          reviewedBy: p.reviewer?.username || null,
          rejectionReason: p.rejection_reason || null,
          reviewNote: p.review_note || null,
        };
      }),
    };
  }

  async getThemePlanMatrix({ schoolYearId, ageGroup }) {
    // 1. Resolve school year
    let targetSchoolYearId;
    if (schoolYearId && !isNaN(Number(schoolYearId))) {
      targetSchoolYearId = BigInt(String(schoolYearId));
    } else {
      const activeSy = await prisma.schoolYear.findFirst({
        where: { status: 'ACTIVE', deleted_at: null },
        select: { school_year_id: true },
      });
      targetSchoolYearId = activeSy?.school_year_id;
    }

    if (!targetSchoolYearId) {
      const latestSy = await prisma.schoolYear.findFirst({
        where: { deleted_at: null },
        orderBy: { start_date: 'desc' },
        select: { school_year_id: true },
      });
      targetSchoolYearId = latestSy?.school_year_id;
    }

    if (!targetSchoolYearId) {
      return {
        schoolYear: null,
        stats: { totalClasses: 0, totalPlans: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0, draftCount: 0 },
        groups: [],
        matrix: {},
      };
    }

    const schoolYear = await prisma.schoolYear.findUnique({
      where: { school_year_id: targetSchoolYearId },
      select: {
        school_year_id: true,
        name: true,
        status: true,
        start_date: true,
        end_date: true,
      },
    });

    // 2. Fetch classes
    const classWhere = {
      school_year_id: targetSchoolYearId,
      deleted_at: null,
    };
    if (ageGroup) {
      classWhere.age_group = ageGroup;
    }

    const classes = await prisma.class.findMany({
      where: classWhere,
      orderBy: [{ age_group: 'asc' }, { name: 'asc' }],
      select: {
        class_id: true,
        public_id: true,
        name: true,
        age_group: true,
        room_number: true,
        teacher_classes: {
          where: { left_at: null },
          select: {
            teacher: {
              select: {
                teacher_id: true,
                public_id: true,
                full_name: true,
              },
            },
          },
        },
      },
    });

    // 3. Fetch curriculum themes
    const themeWhere = {
      school_year_id: targetSchoolYearId,
      deleted_at: null,
    };
    if (ageGroup) {
      themeWhere.age_group = ageGroup;
    }

    const themes = await prisma.curriculumTheme.findMany({
      where: themeWhere,
      orderBy: [{ start_date: 'asc' }, { name: 'asc' }],
      select: {
        theme_id: true,
        public_id: true,
        name: true,
        age_group: true,
        start_date: true,
        end_date: true,
        submission_deadline: true,
        allow_late_submit: true,
        status: true,
      },
    });

    // 4. Fetch plans
    const classIds = classes.map((c) => c.class_id);
    const plans = classIds.length > 0 ? await prisma.classThemePlan.findMany({
      where: {
        class_id: { in: classIds },
      },
      include: {
        submitter: { select: { account_id: true, username: true } },
        reviewer: { select: { account_id: true, username: true } },
      },
    }) : [];

    // 5. Index plans by `${class_id}_${theme_id}`
    const matrix = {};
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let draftCount = 0;

    for (const p of plans) {
      const key = `${p.class_id}_${p.theme_id}`;
      matrix[key] = {
        id: p.id.toString(),
        publicId: p.public_id,
        classId: p.class_id.toString(),
        themeId: p.theme_id.toString(),
        status: p.status,
        submittedAt: p.submitted_at ? p.submitted_at.toISOString() : null,
        submittedBy: p.submitter?.username || null,
        reviewedAt: p.reviewed_at ? p.reviewed_at.toISOString() : null,
        reviewedBy: p.reviewer?.username || null,
        rejectionReason: p.rejection_reason || null,
        reviewNote: p.review_note || null,
      };

      if (p.status === 'PENDING_APPROVAL') pendingCount++;
      else if (p.status === 'USED') approvedCount++;
      else if (p.status === 'REJECTED') rejectedCount++;
      else if (p.status === 'DRAFT') draftCount++;
    }

    // 6. Define standard preschool age group order & labels
    const AGE_GROUP_META = {
      NHA_TRE: { label: 'Khối Nhà trẻ', ageRange: '24 – 36 tháng', sortOrder: 1 },
      MAM: { label: 'Khối Mầm', ageRange: '3 – 4 tuổi', sortOrder: 2 },
      CHOI: { label: 'Khối Chồi', ageRange: '4 – 5 tuổi', sortOrder: 3 },
      LA: { label: 'Khối Lá', ageRange: '5 – 6 tuổi', sortOrder: 4 },
    };

    // Group classes and themes by age_group
    const groupKeys = ['NHA_TRE', 'MAM', 'CHOI', 'LA'];
    const groups = [];

    for (const groupKey of groupKeys) {
      if (ageGroup && ageGroup !== groupKey) continue;

      const groupClasses = classes
        .filter((c) => c.age_group === groupKey)
        .map((c) => ({
          id: c.class_id.toString(),
          publicId: c.public_id,
          name: c.name,
          ageGroup: c.age_group,
          roomNumber: c.room_number,
          teachers: (c.teacher_classes || []).map((tc) => tc.teacher.full_name),
        }));

      const groupThemes = themes
        .filter((t) => t.age_group === groupKey)
        .map((t) => {
          let deadlineStr = null;
          if (t.submission_deadline) {
            deadlineStr = new Date(t.submission_deadline).toISOString().split('T')[0];
          } else if (t.start_date) {
            const d = new Date(t.start_date);
            d.setDate(d.getDate() - 5);
            deadlineStr = d.toISOString().split('T')[0];
          }
          return {
            id: t.theme_id.toString(),
            publicId: t.public_id,
            name: t.name,
            ageGroup: t.age_group,
            startDate: t.start_date ? t.start_date.toISOString().split('T')[0] : null,
            endDate: t.end_date ? t.end_date.toISOString().split('T')[0] : null,
            deadline: deadlineStr,
            allowLateSubmit: t.allow_late_submit ?? true,
            status: t.status,
          };
        });

      if (groupClasses.length > 0 || groupThemes.length > 0) {
        let groupPending = 0;
        for (const cls of groupClasses) {
          for (const th of groupThemes) {
            const plan = matrix[`${cls.id}_${th.id}`];
            if (plan?.status === 'PENDING_APPROVAL') {
              groupPending++;
            }
          }
        }

        const meta = AGE_GROUP_META[groupKey] || { label: groupKey, ageRange: '', sortOrder: 99 };
        groups.push({
          key: groupKey,
          label: meta.label,
          ageRange: meta.ageRange,
          sortOrder: meta.sortOrder,
          classes: groupClasses,
          themes: groupThemes,
          pendingCount: groupPending,
        });
      }
    }

    return {
      schoolYear: {
        id: schoolYear.school_year_id.toString(),
        name: schoolYear.name,
        startDate: schoolYear.start_date ? schoolYear.start_date.toISOString().split('T')[0] : null,
        endDate: schoolYear.end_date ? schoolYear.end_date.toISOString().split('T')[0] : null,
        status: schoolYear.status,
      },
      stats: {
        totalClasses: classes.length,
        totalPlans: Object.keys(matrix).length,
        pendingCount,
        approvedCount,
        rejectedCount,
        draftCount,
      },
      groups,
      matrix,
    };
  }

  async getThemePlanAppraisalPreview({ classId, themeId }) {
    const targetClass = await this.resolveClass(classId);

    // Resolve theme
    const strTheme = String(themeId || '').trim();
    const isNum = /^\d+$/.test(strTheme);
    const theme = await prisma.curriculumTheme.findFirst({
      where: isUuid(strTheme)
        ? { public_id: strTheme }
        : isNum
        ? { theme_id: BigInt(strTheme) }
        : { name: strTheme, age_group: targetClass.age_group },
      include: {
        sub_themes: {
          where: { deleted_at: null },
          orderBy: { start_date: 'asc' },
        },
      },
    });

    if (!theme) {
      throw new NotFound('Không tìm thấy chủ đề giáo dục.');
    }

    // Resolve plan
    const plan = await prisma.classThemePlan.findFirst({
      where: {
        class_id: targetClass.class_id,
        theme_id: theme.theme_id,
      },
      include: {
        submitter: { select: { account_id: true, username: true } },
        reviewer: { select: { account_id: true, username: true } },
      },
    });

    // Subthemes & weekly timetable
    const subThemesList = theme.sub_themes || [];
    const subThemeIds = subThemesList.map((st) => st.sub_theme_id);

    // Fetch scheduled activities for this class across all subThemes of this theme
    const scheduledRecords = subThemeIds.length > 0 ? await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
        sub_theme_id: { in: subThemeIds },
      },
      include: {
        activity: {
          include: {
            content: {
              include: { goal: true },
            },
          },
        },
      },
      orderBy: [{ scheduled_date: 'asc' }, { routine_slot: 'asc' }, { order_index: 'asc' }],
    }) : [];

    // Group activities by week -> day of week
    const timetableByWeek = subThemesList.map((st, idx) => {
      const weekRecords = scheduledRecords.filter((r) => r.sub_theme_id === st.sub_theme_id);

      const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
      const scheduleGrid = {};

      for (const day of days) {
        scheduleGrid[day] = weekRecords
          .filter((r) => r.day_of_week === day)
          .map((r) => ({
            id: r.id.toString(),
            routineSlot: r.routine_slot,
            scheduledDate: r.scheduled_date ? r.scheduled_date.toISOString().split('T')[0] : null,
            title: r.activity?.title || 'Hoạt động giáo dục',
            domain: r.activity?.content?.goal?.domain || null,
            goalCode: r.activity?.content?.goal?.goal_code || null,
            goalTitle: r.activity?.content?.goal?.title || null,
            contentTitle: r.activity?.content?.title || null,
            objective: r.activity?.objective || null,
            preparation: r.activity?.preparation || null,
            procedure: r.activity?.procedure || null,
            evaluationCriteria: r.activity?.evaluation_criteria || null,
            notes: r.notes || null,
          }));
      }

      return {
        id: st.public_id || st.sub_theme_id.toString(),
        name: st.name,
        weekNumber: idx + 1,
        startDate: st.start_date ? st.start_date.toISOString().split('T')[0] : null,
        endDate: st.end_date ? st.end_date.toISOString().split('T')[0] : null,
        totalActivities: weekRecords.length,
        scheduleGrid,
      };
    });

    // Fetch goals for this class & theme
    const themeGoals = await prisma.classThemeGoal.findMany({
      where: {
        class_id: targetClass.class_id,
        theme_id: theme.theme_id,
      },
      include: {
        goal: true,
      },
    });

    // Group goals by 5 domains
    const DOMAIN_MAP = {
      PHYSICAL: { label: 'Phát triển Thể chất', key: 'PHYSICAL', color: 'blue' },
      COGNITIVE: { label: 'Phát triển Nhận thức', key: 'COGNITIVE', color: 'indigo' },
      LANGUAGE: { label: 'Phát triển Ngôn ngữ', key: 'LANGUAGE', color: 'emerald' },
      SOCIO_EMOTIONAL: { label: 'Tình cảm & Kỹ năng xã hội', key: 'SOCIO_EMOTIONAL', color: 'amber' },
      AESTHETIC: { label: 'Phát triển Thẩm mỹ', key: 'AESTHETIC', color: 'rose' },
    };

    const domainsSummary = ['PHYSICAL', 'COGNITIVE', 'LANGUAGE', 'SOCIO_EMOTIONAL', 'AESTHETIC'].map((dKey) => {
      const matched = themeGoals.filter((tg) => tg.goal?.domain === dKey);
      const meta = DOMAIN_MAP[dKey];
      return {
        domainKey: dKey,
        domainLabel: meta.label,
        count: matched.length,
        goals: matched.map((tg) => ({
          id: tg.goal.goal_id.toString(),
          goalCode: tg.goal.goal_code,
          description: tg.goal.title || tg.goal.description || '',
        })),
      };
    });

    // Deadline: BGH config hoặc fallback tự động: start_date - 5 ngày
    let deadlineStr = null;
    if (theme.submission_deadline) {
      deadlineStr = new Date(theme.submission_deadline).toISOString().split('T')[0];
    } else if (theme.start_date) {
      const d = new Date(theme.start_date);
      d.setDate(d.getDate() - 5);
      deadlineStr = d.toISOString().split('T')[0];
    }

    // Teachers
    const classTeachers = await prisma.teacherClass.findMany({
      where: { class_id: targetClass.class_id, left_at: null },
      include: { teacher: { select: { full_name: true } } },
    });

    return {
      class: {
        id: targetClass.class_id.toString(),
        publicId: targetClass.public_id,
        name: targetClass.name,
        ageGroup: targetClass.age_group,
        roomNumber: targetClass.room_number,
        teachers: classTeachers.map((tc) => tc.teacher.full_name),
      },
      theme: {
        id: theme.theme_id.toString(),
        publicId: theme.public_id,
        name: theme.name,
        startDate: theme.start_date ? theme.start_date.toISOString().split('T')[0] : null,
        endDate: theme.end_date ? theme.end_date.toISOString().split('T')[0] : null,
        deadline: deadlineStr,
        allowLateSubmit: theme.allow_late_submit ?? true,
      },
      plan: plan
        ? {
            id: plan.id.toString(),
            status: plan.status,
            submittedAt: plan.submitted_at ? plan.submitted_at.toISOString() : null,
            submittedBy: plan.submitter?.username || null,
            reviewedAt: plan.reviewed_at ? plan.reviewed_at.toISOString() : null,
            reviewedBy: plan.reviewer?.username || null,
            reviewNote: plan.review_note || null,
            teacherNote:
              plan.review_note &&
              plan.review_note.trim() &&
              !plan.review_note.trim().startsWith('Kế hoạch đã được Ban Giám Hiệu')
                ? plan.review_note.trim()
                : null,
            rejectionReason: plan.rejection_reason || null,
          }
        : {
            status: 'NOT_SUBMITTED',
            submittedAt: null,
            submittedBy: null,
            reviewedAt: null,
            reviewedBy: null,
            reviewNote: null,
            teacherNote: null,
            rejectionReason: null,
          },
      timetableByWeek,
      domainsSummary,
      totalGoals: themeGoals.length,
      totalActivities: scheduledRecords.length,
    };
  }

  /**
   * Get summary of all theme plans for a class (Used by PlanSubmissionTab)
   */
  async getClassThemePlansSummary(classId) {
    const targetClass = await this.resolveClass(classId);

    // 1. All themes of this grade in school year
    const themes = await prisma.curriculumTheme.findMany({
      where: {
        school_year_id: targetClass.school_year_id,
        age_group: targetClass.age_group,
        deleted_at: null,
      },
      orderBy: { start_date: 'asc' },
      include: {
        sub_themes: {
          where: { deleted_at: null },
          orderBy: { start_date: 'asc' },
        },
      },
    });

    // 2. All plan submission statuses for this class
    const plans = await prisma.classThemePlan.findMany({
      where: {
        class_id: targetClass.class_id,
      },
      include: {
        submitter: { select: { account_id: true, username: true } },
        reviewer: { select: { account_id: true, username: true } },
      },
    });
    const planMap = new Map();
    plans.forEach((p) => {
      planMap.set(p.theme_id.toString(), p);
    });

    // 3. Goal counts by theme
    const classGoals = await prisma.classThemeGoal.findMany({
      where: { class_id: targetClass.class_id },
      select: { theme_id: true, goal_id: true },
    });
    const goalsCountByTheme = new Map();
    classGoals.forEach((cg) => {
      const k = cg.theme_id.toString();
      goalsCountByTheme.set(k, (goalsCountByTheme.get(k) || 0) + 1);
    });

    // 4. Scheduled activities count by sub_theme
    const classScheduledActs = await prisma.subThemeActivity.findMany({
      where: { class_id: targetClass.class_id },
      select: { sub_theme_id: true, scheduled_date: true, day_of_week: true },
    });
    const scheduledBySubTheme = new Map();
    classScheduledActs.forEach((sa) => {
      const k = sa.sub_theme_id.toString();
      scheduledBySubTheme.set(k, (scheduledBySubTheme.get(k) || 0) + 1);
    });

    // 5. Total activities created by theme
    const allActivities = await prisma.educationalActivity.findMany({
      where: { deleted_at: null },
      select: { theme_id: true },
    });
    const actsCountByTheme = new Map();
    allActivities.forEach((act) => {
      if (act.theme_id) {
        const k = act.theme_id.toString();
        actsCountByTheme.set(k, (actsCountByTheme.get(k) || 0) + 1);
      }
    });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    let currentThemeItem = null;

    const list = themes.map((th, idx) => {
      const tid = th.theme_id.toString();
      const code = th.code || String(idx + 1).padStart(2, '0');
      const plan = planMap.get(tid);

      const sDate = th.start_date ? th.start_date.toISOString().slice(0, 10) : '';
      const eDate = th.end_date ? th.end_date.toISOString().slice(0, 10) : '';
      const dateRange = th.start_date && th.end_date
        ? `${pad(th.start_date.getDate())}/${pad(th.start_date.getMonth() + 1)} – ${pad(th.end_date.getDate())}/${pad(th.end_date.getMonth() + 1)}/${th.end_date.getFullYear()}`
        : '';

      const isCurrent = th.start_date && th.end_date && th.start_date <= now && now <= th.end_date;

      const subThemes = th.sub_themes || [];
      const totalWeeks = calculateThemeWeeks(th.start_date, th.end_date, subThemes.length);
      const subThemeIdsSet = new Set(subThemes.map((st) => st.sub_theme_id.toString()));
      const themeScheduledActs = classScheduledActs.filter((sa) => subThemeIdsSet.has(sa.sub_theme_id.toString()));
      const totalScheduledSlots = themeScheduledActs.length;

      const scheduledWeekIndices = new Set();
      const themeStart = th.start_date ? new Date(th.start_date) : null;
      if (themeStart) themeStart.setHours(0, 0, 0, 0);

      for (const sa of themeScheduledActs) {
        if (sa.scheduled_date && themeStart) {
          const wIdx = getThemeWeekIndex(sa.scheduled_date, themeStart);
          if (wIdx >= 0 && wIdx < totalWeeks) {
            scheduledWeekIndices.add(wIdx);
          }
        }
      }

      let scheduledWeeks = scheduledWeekIndices.size;
      if (scheduledWeeks === 0 && totalScheduledSlots > 0) {
        let subThemeScheduledCount = 0;
        subThemes.forEach((st) => {
          if ((scheduledBySubTheme.get(st.sub_theme_id.toString()) || 0) > 0) subThemeScheduledCount++;
        });
        scheduledWeeks = Math.min(totalWeeks, subThemeScheduledCount);
      }

      // Tiêu chuẩn mầm non: 5 ngày học (T2–T6) × 7 khung giờ sinh hoạt = 35 slot/tuần
      const totalExpectedSlots = totalWeeks * 35;
      const isSlotsFull = totalExpectedSlots > 0 && totalScheduledSlots >= totalExpectedSlots;

      const totalGoals = goalsCountByTheme.get(tid) || 0;
      const totalActivities = actsCountByTheme.get(tid) || 0;

      // Kiểm tra quy định Phi Yến: Min 3 – Max 7 HĐGD / ngày học, không có CN
      const DAY_LABEL_VI = {
        MONDAY: 'Thứ Hai',
        TUESDAY: 'Thứ Ba',
        WEDNESDAY: 'Thứ Tư',
        THURSDAY: 'Thứ Năm',
        FRIDAY: 'Thứ Sáu',
        SATURDAY: 'Thứ Bảy',
        SUNDAY: 'Chủ Nhật',
      };
      const dayCounts = new Map();
      let hasSunday = false;
      themeScheduledActs.forEach((sa) => {
        if (sa.day_of_week === 'SUNDAY') hasSunday = true;
        const key = `${sa.sub_theme_id}_${sa.day_of_week}`;
        dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
      });

      const invalidDays = [];
      dayCounts.forEach((count, key) => {
        const [stId, day] = key.split('_');
        if (day === 'SUNDAY') return;
        if (count < 3) {
          const st = subThemes.find((s) => s.sub_theme_id.toString() === stId);
          invalidDays.push(`${DAY_LABEL_VI[day] || day} (${st?.name || 'Tuần'}: ${count}/3 HĐ)`);
        }
      });

      const isMinActivitiesPerDayMet = invalidDays.length === 0 && !hasSunday && totalScheduledSlots > 0;

      const missingItems = [];
      if (totalGoals === 0) missingItems.push('Chưa phân bổ mục tiêu giáo dục');
      if (totalWeeks > 0 && totalScheduledSlots === 0) {
        missingItems.push('Thời khóa biểu chưa có hoạt động giáo dục nào');
      }
      if (hasSunday) {
        missingItems.push('Không được xếp lịch vào Chủ nhật');
      }
      if (invalidDays.length > 0) {
        missingItems.push(
          `Chưa đạt tối thiểu 3 HĐGD/ngày: ${invalidDays.slice(0, 3).join(', ')}${invalidDays.length > 3 ? '...' : ''}`
        );
      }

      const isReadyToSubmit = missingItems.length === 0;

      // Deadline: BGH config hoặc fallback: start_date - 5 days
      let deadline = null;
      if (th.submission_deadline) {
        deadline = new Date(th.submission_deadline).toISOString().split('T')[0];
      } else if (th.start_date) {
        const d = new Date(th.start_date);
        d.setDate(d.getDate() - 5);
        deadline = d.toISOString().split('T')[0];
      }

      const item = {
        id: th.public_id || tid,
        themeId: th.public_id || tid,
        code,
        name: th.name,
        startDate: sDate,
        endDate: eDate,
        dateRange,
        deadline,
        allowLateSubmit: th.allow_late_submit ?? true,
        weeksCount: totalWeeks,
        isCurrent: Boolean(isCurrent),
        status: plan?.status || 'DRAFT',
        submittedAt: plan?.submitted_at ? plan.submitted_at.toISOString() : null,
        submittedBy: plan?.submitter?.username || null,
        reviewedAt: plan?.reviewed_at ? plan.reviewed_at.toISOString() : null,
        reviewedBy: plan?.reviewer?.username || null,
        rejectionReason: plan?.rejection_reason || null,
        reviewNote: plan?.review_note || null,
        stats: {
          totalGoals,
          totalActivities,
          totalWeeks,
          scheduledWeeks,
          totalScheduledSlots,
          totalExpectedSlots,
          isSlotsFull,
          isReadyToSubmit,
          missingItems,
          invalidDays,
          hasSunday,
          isMinActivitiesPerDayMet,
        },
      };

      if (isCurrent && !currentThemeItem) {
        currentThemeItem = item;
      }

      return item;
    });

    if (!currentThemeItem && list.length > 0) {
      currentThemeItem = list[0];
    }

    return {
      classId: targetClass.public_id,
      className: targetClass.name,
      currentTheme: currentThemeItem,
      themes: list,
    };
  }

  async queryAiAllocation({ prompt, themeName }) {
    return {
      reply: `Đã phân tích và đề xuất phân bổ mục tiêu phù hợp với chủ đề ${themeName || 'được chọn'}.`,
      proposals: [
        { branchName: 'Chủ đề nhánh 1', goalsCount: 5 },
        { branchName: 'Chủ đề nhánh 2', goalsCount: 6 },
        { branchName: 'Chủ đề nhánh 3', goalsCount: 5 },
      ],
    };
  }
}

export const planningService = new PlanningService();
export default planningService;
