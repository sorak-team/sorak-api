import prisma from '../config/prisma.js';
import { BadRequest, NotFound } from '../utils/http-error.js';
import logger from '../utils/logger.js';

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

class PlanningService {
  /**
   * Helper to resolve target class
   */
  async resolveClass(classId) {
    if (classId) {
      const str = String(classId).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (!isUuid) {
        throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
      }
      const targetClass = await prisma.class.findFirst({
        where: { public_id: str, deleted_at: null },
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

      if (dbThemes && dbThemes.length > 0) {
        themes = dbThemes.map((th, idx) => {
          const code = String(idx + 1).padStart(2, '0');
          const pad = (n) => String(n).padStart(2, '0');
          const sDate = `${pad(th.start_date.getDate())}/${pad(th.start_date.getMonth() + 1)}`;
          const eDate = `${pad(th.end_date.getDate())}/${pad(th.end_date.getMonth() + 1)}/${th.end_date.getFullYear()}`;
          return {
            id: th.public_id || th.theme_id.toString(),
            code,
            name: th.name,
            status: th.status,
            dateRange: `${sDate} – ${eDate}`,
            weeksCount: th.sub_themes.length,
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
          include: { activity: true },
        })
      : [];

    const scheduledMap = new Map();
    scheduledRecords.forEach((slot) => {
      const actId = slot.activity_id.toString();
      const slotItem = {
        slotId: slot.id.toString(),
        day: ENUM_TO_DAY_KEY[slot.day_of_week] || 'T2',
        routineSlot: slot.routine_slot,
        date: slot.scheduled_date ? slot.scheduled_date.toISOString().slice(0, 10) : '',
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
              },
            },
          },
        },
        orderBy: { goal_id: 'asc' },
      });

      if (dbGoals && dbGoals.length > 0) {
        goalsWithActivities = dbGoals.map((g) => {
          const contentsWithActs = g.contents.map((cnt) => {
            const activities = cnt.activities.map((act) => {
              const actId = act.public_id || act.activity_id.toString();
              const scheduledSlots = scheduledMap.get(act.public_id) || scheduledMap.get(act.activity_id.toString()) || [];
              return {
                id: actId,
                contentId: cnt.public_id || cnt.content_id.toString(),
                goalCode: g.goal_code,
                domain: g.domain,
                routineSlot: act.routine_slot,
                title: act.title,
                objective: act.objective || '',
                preparation: act.preparation || '',
                procedure: act.procedure || '',
                evaluationCriteria: act.evaluation_criteria || '',
                scheduledSlots,
                slotsCount: scheduledSlots.length,
                isScheduled: scheduledSlots.length > 0,
                scheduledSlot: scheduledSlots[0] || null,
                scheduleInfo: scheduledSlots[0] || null,
              };
            });

            return {
              id: cnt.public_id || cnt.content_id.toString(),
              title: cnt.title,
              goalCode: g.goal_code,
              domain: g.domain,
              domainLabel: g.domain,
              activities,
              activitiesCount: activities.length,
            };
          });

          return {
            id: g.public_id || g.goal_id.toString(),
            goalCode: g.goal_code,
            indicatorCode: g.indicator_code || '',
            domain: g.domain,
            domainCode: '',
            domainLabel: g.domain,
            title: g.title,
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
  async saveEducationalActivity({ classId, activity }) {
    if (!activity.title || !activity.title.trim()) {
      throw new BadRequest('Tiêu đề hoạt động giáo dục không được để trống.');
    }

    if (!activity.contentId) {
      throw new BadRequest('Vui lòng chọn nội dung giáo dục tương ứng.');
    }

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

    let existingActivity = null;
    if (activity.id) {
      const isNum = typeof activity.id === 'number' || (typeof activity.id === 'string' && /^\d+$/.test(String(activity.id).trim()));
      existingActivity = await prisma.educationalActivity.findFirst({
        where: {
          OR: [
            ...(isNum ? [{ activity_id: BigInt(activity.id) }] : []),
            { public_id: String(activity.id) },
          ],
        },
      });
    }

    if (existingActivity) {
      const updated = await prisma.educationalActivity.update({
        where: { activity_id: existingActivity.activity_id },
        data: {
          content_id: targetContentId,
          routine_slot: activity.routineSlot || 'DIRECTED_STUDY',
          title: activity.title.trim(),
          objective: activity.objective || '',
          preparation: activity.preparation || '',
          procedure: activity.procedure || '',
          evaluation_criteria: activity.evaluationCriteria || '',
          updated_at: new Date(),
        },
      });

      return {
        ...activity,
        id: updated.public_id || updated.activity_id.toString(),
      };
    }

    const created = await prisma.educationalActivity.create({
      data: {
        content_id: targetContentId,
        routine_slot: activity.routineSlot || 'DIRECTED_STUDY',
        title: activity.title.trim(),
        objective: activity.objective || '',
        preparation: activity.preparation || '',
        procedure: activity.procedure || '',
        evaluation_criteria: activity.evaluationCriteria || '',
      },
    });

    return {
      ...activity,
      id: created.public_id || created.activity_id.toString(),
    };
  }

  /**
   * Tab 1: Delete an educational activity from PostgreSQL
   */
  async deleteEducationalActivity({ classId, activityId }) {
    if (!activityId) {
      throw new BadRequest('Mã hoạt động không hợp lệ.');
    }

    const isNum = typeof activityId === 'number' || (typeof activityId === 'string' && /^\d+$/.test(String(activityId).trim()));
    const existing = await prisma.educationalActivity.findFirst({
      where: {
        OR: [
          ...(isNum ? [{ activity_id: BigInt(activityId) }] : []),
          { public_id: String(activityId) },
        ],
      },
    });

    if (existing) {
      // Delete any scheduled slots first
      await prisma.subThemeActivity.deleteMany({
        where: { activity_id: existing.activity_id },
      });

      await prisma.educationalActivity.delete({
        where: { activity_id: existing.activity_id },
      });
    }

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
          return {
            id: th.public_id || th.theme_id.toString(),
            code,
            name: th.name,
            status: th.status,
            dateRange: `${sDate} – ${eDate}`,
            weeksCount: th.sub_themes.length,
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
          if (!selectedTheme) selectedTheme = themes[0];
          subThemes = selectedTheme?.subThemes || [];
          if (!selectedSubTheme) selectedSubTheme = subThemes[0] || null;
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
          if (!selectedTheme) selectedTheme = themes[0];
          subThemes = selectedTheme?.subThemes || [];
          if (!selectedSubTheme) selectedSubTheme = subThemes[0] || null;
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
      const isNum = typeof subThemeId === 'number' || (typeof subThemeId === 'string' && /^\d+$/.test(String(subThemeId).trim()));
      const st = await prisma.subTheme.findFirst({
        where: {
          OR: [
            ...(isNum ? [{ sub_theme_id: BigInt(subThemeId) }] : []),
            { public_id: String(subThemeId) },
          ],
        },
      });
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
    const mappedSlots = scheduledRecords.map((rec) => {
      const dayKey = ENUM_TO_DAY_KEY[rec.day_of_week] || 'T2';
      const times = SLOT_TIMES[rec.routine_slot] || { start: '08:30', end: '09:15' };
      const dateStr = rec.scheduled_date ? rec.scheduled_date.toISOString().slice(0, 10) : '';
      const dateFormatted = dateStr ? `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}` : '';
      const act = rec.activity;
      const content = act?.content;
      const goal = content?.goal;
      const actId = act?.public_id || rec.activity_id.toString();

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

      const list = scheduledMap.get(actId) || [];
      list.push({
        slotId: slotObj.id,
        day: slotObj.day,
        routineSlot: slotObj.routineSlot,
        date: slotObj.date,
        dayLabel: slotObj.date,
      });
      scheduledMap.set(actId, list);
      if (act?.activity_id) {
        const numList = scheduledMap.get(act.activity_id.toString()) || [];
        numList.push(list[list.length - 1]);
        scheduledMap.set(act.activity_id.toString(), numList);
      }

      return slotObj;
    });

    // 3. Query available activities & goals from PostgreSQL
    let availableActivities = [];
    let goalsWithActivities = [];

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
              },
            },
          },
        },
        orderBy: { goal_id: 'asc' },
      });

      if (dbGoals && dbGoals.length > 0) {
        goalsWithActivities = dbGoals.map((g) => {
          const contentsWithActs = g.contents.map((cnt) => {
            const activities = cnt.activities.map((act) => {
              const actId = act.public_id || act.activity_id.toString();
              const slots = scheduledMap.get(act.public_id) || scheduledMap.get(act.activity_id.toString()) || [];
              const actPayload = {
                id: actId,
                contentId: cnt.public_id || cnt.content_id.toString(),
                goalCode: g.goal_code,
                goalTitle: g.title,
                domain: g.domain,
                domainCode: '',
                domainLabel: g.domain,
                contentTitle: cnt.title,
                routineSlot: act.routine_slot,
                title: act.title,
                objective: act.objective || '',
                preparation: act.preparation || '',
                procedure: act.procedure || '',
                evaluationCriteria: act.evaluation_criteria || '',
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
              title: cnt.title,
              activities,
            };
          });

          return {
            id: g.public_id || g.goal_id.toString(),
            goalCode: g.goal_code,
            title: g.title,
            domain: g.domain,
            contents: contentsWithActs,
          };
        });
      }
    } catch (err) {
      logger.error('Error fetching goals for weekly timetable:', err);
    }

    return {
      theme: selectedTheme || null,
      selectedTheme: selectedTheme || null,
      subThemes,
      selectedSubTheme,
      slots: mappedSlots,
      availableActivities,
      goals: goalsWithActivities,
    };
  }

  /**
   * Tab 2: Assign an activity into a specific day and routine slot in PostgreSQL (sub_theme_activities)
   */
  async assignActivityToSlot({ classId, activityId, day, routineSlot, date, slotId, isAdd = false, weekId, subThemeId, orderIndex }) {
    const targetClass = await this.resolveClass(classId);
    if (!activityId) {
      throw new BadRequest('Hoạt động giáo dục không hợp lệ.');
    }

    const isNum = typeof activityId === 'number' || (typeof activityId === 'string' && /^\d+$/.test(String(activityId).trim()));
    const activity = await prisma.educationalActivity.findFirst({
      where: {
        OR: [
          ...(isNum ? [{ activity_id: BigInt(activityId) }] : []),
          { public_id: String(activityId) },
        ],
      },
      include: { content: { include: { goal: true } } },
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

    // Resolve sub_theme_id: prioritize sub_theme covering scheduledDate
    let targetSubThemeId = null;
    const dateSubTheme = await prisma.subTheme.findFirst({
      where: {
        theme: { school_year_id: targetClass.school_year_id, age_group: targetClass.age_group },
        start_date: { lte: scheduledDate },
        end_date: { gte: scheduledDate },
        deleted_at: null,
      },
    });

    if (dateSubTheme) {
      targetSubThemeId = dateSubTheme.sub_theme_id;
    } else if (subThemeId) {
      const isStNum = typeof subThemeId === 'number' || (typeof subThemeId === 'string' && /^\d+$/.test(String(subThemeId).trim()));
      const st = await prisma.subTheme.findFirst({
        where: {
          OR: [
            ...(isStNum ? [{ sub_theme_id: BigInt(subThemeId) }] : []),
            { public_id: String(subThemeId) },
          ],
        },
      });
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

    if (slotId && !isNaN(Number(slotId))) {
      const parsedSlotId = BigInt(slotId);
      const updateData = {
        sub_theme_id: targetSubThemeId,
        activity_id: realActivityId,
        day_of_week: dayOfWeek,
        routine_slot: slotRoutineSlot,
        scheduled_date: scheduledDate,
        status: 'SCHEDULED',
        updated_at: new Date(),
      };
      if (orderIndex !== undefined && !isNaN(Number(orderIndex))) {
        updateData.order_index = Number(orderIndex);
      }
      savedRec = await prisma.subThemeActivity.update({
        where: { id: parsedSlotId },
        data: updateData,
      });
    } else if (!isAdd) {
      // Slot replacement or single assignment
      const existing = await prisma.subThemeActivity.findFirst({
        where: {
          class_id: targetClass.class_id,
          scheduled_date: scheduledDate,
          routine_slot: slotRoutineSlot,
        },
        orderBy: { order_index: 'asc' },
      });

      if (existing) {
        const updateData = {
          sub_theme_id: targetSubThemeId,
          activity_id: realActivityId,
          day_of_week: dayOfWeek,
          status: 'SCHEDULED',
          updated_at: new Date(),
        };
        if (orderIndex !== undefined && !isNaN(Number(orderIndex))) {
          updateData.order_index = Number(orderIndex);
        }
        savedRec = await prisma.subThemeActivity.update({
          where: { id: existing.id },
          data: updateData,
        });
      }
    }

    if (!savedRec) {
      // Append activity to the cell at the end
      const existingCount = await prisma.subThemeActivity.count({
        where: {
          class_id: targetClass.class_id,
          scheduled_date: scheduledDate,
          routine_slot: slotRoutineSlot,
        },
      });

      const newOrder = (orderIndex !== undefined && !isNaN(Number(orderIndex)))
        ? Number(orderIndex)
        : existingCount + 1;

      savedRec = await prisma.subThemeActivity.create({
        data: {
          class_id: targetClass.class_id,
          sub_theme_id: targetSubThemeId,
          activity_id: realActivityId,
          day_of_week: dayOfWeek,
          routine_slot: slotRoutineSlot,
          scheduled_date: scheduledDate,
          order_index: newOrder,
          status: 'SCHEDULED',
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
      goalTitle: goal?.title || '',
      indicatorCode: goal?.indicator_code || '',
      contentTitle: content?.title || '',
      objective: activity.objective || '',
      planObjective: activity.objective || '',
      preparation: activity.preparation || '',
      procedure: activity.procedure || '',
      evaluation: activity.evaluation_criteria || '',
      evaluationCriteria: activity.evaluation_criteria || '',
      criteria: {
        domain: goal?.domain || '',
        domainLabel: DOMAIN_LABELS[goal?.domain] || goal?.domain || '',
        goal: goal?.goal_code ? `${goal.goal_code} - ${goal.title || ''}` : '',
        goalCode: goal?.goal_code || '',
        goalTitle: goal?.title || '',
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
  async saveWeeklySlot({ classId, slot }) {
    if (!slot.title) {
      throw new BadRequest('Tiêu đề hoạt động không được để trống.');
    }

    if (slot.id && !isNaN(Number(slot.id))) {
      const times = SLOT_TIMES[slot.routineSlot] || { start: slot.startTime || '08:30', end: slot.endTime || '09:15' };
      const updateData = {
        notes: slot.notes || slot.title,
        status: slot.status || 'SCHEDULED',
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
          updateData.scheduled_date = scheduledDate;
        }
      }

      const updated = await prisma.subThemeActivity.update({
        where: { id: BigInt(slot.id) },
        data: updateData,
      });

      // Also update educational activity content if modified
      if (slot.activityId) {
        const isActNum = typeof slot.activityId === 'number' || (typeof slot.activityId === 'string' && /^\d+$/.test(String(slot.activityId).trim()));
        const act = await prisma.educationalActivity.findFirst({
          where: {
            OR: [
              ...(isActNum ? [{ activity_id: BigInt(slot.activityId) }] : []),
              { public_id: String(slot.activityId) },
            ],
          },
        });
        if (act) {
          await prisma.educationalActivity.update({
            where: { activity_id: act.activity_id },
            data: {
              title: slot.title.trim(),
              objective: slot.objective || '',
              preparation: slot.preparation || '',
              procedure: slot.procedure || '',
              evaluation_criteria: slot.evaluationCriteria || slot.evaluation || '',
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
      };
    }

    return slot;
  }

  /**
   * Tab 2: Batch reorder activities in a slot/cell
   */
  async reorderWeeklySlots({ classId, slots = [] }) {
    if (!Array.isArray(slots) || slots.length === 0) {
      return { success: true, updatedCount: 0 };
    }

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

  // Target Allocation for Theme and SubTheme mapping
  async getTargetAllocation({ classId }) {
    const targetClass = await this.resolveClass(classId);

    const themes = await prisma.curriculumTheme.findMany({
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

    const allGoals = await prisma.educationalGoal.findMany({
      where: {
        school_year_id: targetClass.school_year_id,
        age_group: targetClass.age_group,
        deleted_at: null,
      },
      include: {
        contents: {
          where: { deleted_at: null },
          orderBy: { content_id: 'asc' },
        },
      },
      orderBy: [{ domain: 'asc' }, { goal_code: 'asc' }],
    });

    const formatGoal = (g) => ({
      id: g.public_id || g.goal_id.toString(),
      code: g.goal_code + (g.indicator_code ? ` (${g.indicator_code})` : ''),
      title: g.title,
      domain: g.domain,
      domainLabel: DOMAIN_LABELS[g.domain] || g.domain,
      contents: (g.contents || []).map((c) => ({
        id: c.public_id || c.content_id.toString(),
        title: c.title,
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

    // If completely empty for this class, auto-initialize default allocations into PostgreSQL
    if (dbAllocations.length === 0 && themes.length > 0 && allGoals.length > 0) {
      const initialInserts = [];
      themes.forEach((t, idx) => {
        const goalsPerTheme = Math.max(10, Math.min(16, Math.ceil(allGoals.length / themes.length) + 3));
        const offset = (idx * 11) % allGoals.length;
        for (let k = 0; k < goalsPerTheme; k++) {
          const g = allGoals[(offset + k) % allGoals.length];
          if (g) {
            initialInserts.push({
              class_id: targetClass.class_id,
              theme_id: t.theme_id,
              goal_id: g.goal_id,
            });
          }
        }
      });
      if (initialInserts.length > 0) {
        await prisma.classThemeGoal.createMany({
          data: initialInserts,
          skipDuplicates: true,
        });
        dbAllocations = await prisma.classThemeGoal.findMany({
          where: { class_id: targetClass.class_id },
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
      }
    }

    // Group allocations by theme_id (as string)
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

      // Check if user has explicitly saved allocations for this theme in PostgreSQL
      const savedRecords = dbAllocationsByTheme.get(t.theme_id.toString()) || [];

      if (savedRecords.length > 0) {
        themeGoalMap.clear();
        savedRecords.forEach((rec) => {
          if (rec.goal) {
            themeGoalMap.set(rec.goal.goal_id.toString(), formatGoal(rec.goal));
          }
        });
      } else if (themeGoalMap.size === 0 && allGoals.length > 0) {
        // Fallback distribution if not in DB and no activities
        const goalsPerTheme = Math.max(10, Math.min(16, Math.ceil(allGoals.length / themes.length) + 3));
        const offset = (idx * 11) % allGoals.length;
        for (let k = 0; k < goalsPerTheme; k++) {
          const g = allGoals[(offset + k) % allGoals.length];
          if (g && !themeGoalMap.has(g.goal_id.toString())) {
            themeGoalMap.set(g.goal_id.toString(), formatGoal(g));
          }
        }
      }

      const allocatedGoals = Array.from(themeGoalMap.values());

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

      return {
        id: t.public_id || t.theme_id.toString(),
        code,
        name: t.name,
        startDate: startStr,
        endDate: endStr,
        status: t.status,
        statusLabel: t.status === 'PUBLISHED' ? 'Đã công bố' : 'Bản nháp',
        dateRange: `${startStr.split('-').reverse().slice(0, 2).join('/')} – ${endStr.split('-').reverse().slice(0, 2).join('/')}`,
        weeksCount: t.sub_themes.length,
        subThemes,
        allocatedGoals,
        count: allocatedGoals.length,
        domainCounts,
      };
    });

    const firstTheme = publishedThemes[0] || null;

    const bankGoals = allGoals.map((g) => {
      const gId = g.public_id || g.goal_id.toString();
      const internalGId = g.goal_id.toString();
      const allocatedThemes = publishedThemes
        .filter((th) => th.allocatedGoals.some((ag) => ag.id === gId || ag.id === internalGId))
        .map((th) => ({ id: th.id, code: th.code, name: th.name }));

      return {
        id: gId,
        code: g.goal_code + (g.indicator_code ? ` (${g.indicator_code})` : ''),
        title: g.title,
        domain: g.domain,
        domainLabel: DOMAIN_LABELS[g.domain] || g.domain,
        contents: (g.contents || []).map((c) => ({
          id: c.public_id || c.content_id.toString(),
          title: c.title,
        })),
        allocatedThemes,
        allocatedThemeCodes: allocatedThemes.map((th) => th.code),
        selected: false,
      };
    });

    return {
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

  async saveTargetAllocation({ classId, themeId, themeCode, branchId, goalIds }) {
    const targetClass = await this.resolveClass(classId);
    if (!targetClass) throw new NotFound('Không tìm thấy lớp học');

    let resolvedThemeId = null;
    if (themeId) {
      const isNum = typeof themeId === 'number' || (typeof themeId === 'string' && /^\d+$/.test(String(themeId).trim()));
      if (isNum) {
        resolvedThemeId = BigInt(themeId);
      } else {
        const th = await prisma.curriculumTheme.findFirst({
          where: { public_id: String(themeId), deleted_at: null },
          select: { theme_id: true },
        });
        if (th) resolvedThemeId = th.theme_id;
      }
    } else if (themeCode) {
      const themes = await prisma.curriculumTheme.findMany({
        where: {
          school_year_id: targetClass.school_year_id,
          age_group: targetClass.age_group,
          deleted_at: null,
        },
        orderBy: [{ start_date: 'asc' }, { theme_id: 'asc' }],
      });
      const idx = parseInt(themeCode, 10) - 1;
      if (idx >= 0 && idx < themes.length) {
        resolvedThemeId = themes[idx].theme_id;
      }
    }

    if (!resolvedThemeId) {
      throw new BadRequest('Chủ đề không hợp lệ');
    }

    let validGoalIds = [];
    if (Array.isArray(goalIds) && goalIds.length > 0) {
      const rawIds = goalIds.map((id) => String(id).trim()).filter(Boolean);
      const numericIds = rawIds.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
      const uuidIds = rawIds.filter((id) => !/^\d+$/.test(id));

      const matchedGoals = await prisma.educationalGoal.findMany({
        where: {
          OR: [
            ...(numericIds.length > 0 ? [{ goal_id: { in: numericIds } }] : []),
            ...(uuidIds.length > 0 ? [{ public_id: { in: uuidIds } }] : []),
          ],
        },
        select: { goal_id: true },
      });
      validGoalIds = matchedGoals.map((g) => g.goal_id);
    }

    // Atomically persist to PostgreSQL class_theme_goals
    await prisma.$transaction(async (tx) => {
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
    };
  }

  async publishAllocation({ classId }) {
    return { success: true, status: 'PUBLISHED', statusLabel: 'Đã công bố' };
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
export default planningService;export class PlanningService {

  async resolveClass(classId) {
      if (classId) {
        const str = String(classId).trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        if (!isUuid) {
          throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
        }
        const targetClass = await prisma.class.findFirst({
          where: { public_id: str, deleted_at: null },
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

}
export const planningService = new PlanningService();
export default planningService;
