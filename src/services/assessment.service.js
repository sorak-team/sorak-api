import prisma from '../config/prisma.js';
import { NotFound } from '../utils/http-error.js';
import { TIMETABLE_DAYS } from './mock-data.js';

/**
 * Safely parse date from various formats (YYYY-MM-DD, DD/MM, DD/MM/YYYY, or Date object)
 */
function parseAssessmentDate(dateInput) {
  if (!dateInput) return new Date('2026-10-14T00:00:00.000Z');
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    return dateInput;
  }
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // Format: DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split('/');
      return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`);
    }
    // Format: DD/MM (assume 2026 academic year)
    if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) {
      const [d, m] = trimmed.split('/');
      return new Date(`2026-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`);
    }
    // Format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(`${trimmed}T00:00:00.000Z`);
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date('2026-10-14T00:00:00.000Z');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val.trim());

const DOMAIN_LABELS = {
  PHYSICAL: 'Phát triển thể chất',
  COGNITIVE: 'Phát triển nhận thức',
  LANGUAGE: 'Phát triển ngôn ngữ',
  SOCIO_EMOTIONAL: 'Phát triển tình cảm - kỹ năng xã hội',
  AESTHETIC: 'Phát triển thẩm mỹ',
};

class AssessmentService {
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
   * Helper to resolve enrolled students
   */
  async getEnrolledStudents(classId, targetDate = null) {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: classId,
        student: { deleted_at: null },
      },
      include: {
        student: true,
      },
      orderBy: { student: { student_code: 'asc' } },
    });

    const targetDateMidnight = targetDate ? new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())) : null;

    const filtered = enrollments.filter((e) => {
      if (targetDateMidnight) {
        if (e.left_at) {
          const leftAtMidnight = new Date(Date.UTC(e.left_at.getUTCFullYear(), e.left_at.getUTCMonth(), e.left_at.getUTCDate()));
          if (targetDateMidnight >= leftAtMidnight) return false;
        }
        if (e.enrolled_at) {
          const enrolledAtMidnight = new Date(Date.UTC(e.enrolled_at.getUTCFullYear(), e.enrolled_at.getUTCMonth(), e.enrolled_at.getUTCDate()));
          if (targetDateMidnight < enrolledAtMidnight) return false;
        }
      }
      return true;
    });

    return filtered.map((e) => ({
      _student_id: e.student.student_id,
      id: e.student.public_id || e.student.student_id.toString(),
      publicId: e.student.public_id,
      code: e.student.student_code,
      name: e.student.full_name,
      gender: e.student.gender,
      isTransferred: false,
    }));
  }

  /**
   * Get weekly assessment overview and active activity criteria querying live PostgreSQL
   */
  async getAssessmentOverview({ classId, week = '12/10 - 18/10/2026' }) {
    const targetClass = await this.resolveClass(classId);
    const students = await this.getEnrolledStudents(targetClass.class_id);

    // Fetch real active directed study activity from database
    const studyActivity = await prisma.educationalActivity.findFirst({
      where: { routine_slot: 'DIRECTED_STUDY', deleted_at: null },
      include: { content: { include: { goal: true } } },
    });

    const activeActivity = studyActivity
      ? {
          id: studyActivity.public_id || studyActivity.activity_id.toString(),
          title: studyActivity.title,
          timeSlot: '08:30 – 09:15',
          className: targetClass.name,
          criteria: {
            domain: studyActivity.content?.goal?.domain || 'Phát triển nhận thức',
            goal: `${studyActivity.content?.goal?.goal_code || 'MT 1'} - ${studyActivity.content?.goal?.title || ''}`,
            content: studyActivity.content?.title || studyActivity.title,
            objective: studyActivity.objective || '',
            preparation: studyActivity.preparation || '',
            procedure: studyActivity.procedure || '',
            expectedAssessment: studyActivity.evaluation_criteria || '',
          },
        }
      : null;

    // Fetch daily assessment records for students using internal _student_id
    const studentDbIds = students.map((s) => s._student_id);
    const dailyRecords = await prisma.dailyAssessment.findMany({
      where: {
        student_id: { in: studentDbIds },
      },
      orderBy: { assessment_date: 'desc' },
    });

    const dailyMap = new Map();
    dailyRecords.forEach((r) => {
      const sId = r.student_id.toString();
      if (!dailyMap.has(sId)) {
        dailyMap.set(sId, r);
      }
    });

    const studentList = students.map((s) => {
      const rec = dailyMap.get(s._student_id.toString());
      const isPass = rec ? (rec.status === 'ACHIEVED' || rec.status === 'OUTSTANDING') : false;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        gender: s.gender,
        status: rec ? (isPass ? 'P' : 'N') : 'N',
        note: rec?.notes || '',
      };
    });

    const pCount = studentList.filter((s) => s.status === 'P').length;
    const nCount = studentList.filter((s) => s.status === 'N').length;

    // Fetch real scheduled activities for this class from database (sub_theme_activities)
    const scheduledRecords = await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
      },
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

    const dayKeyMap = {
      MONDAY: 'T2',
      TUESDAY: 'T3',
      WEDNESDAY: 'T4',
      THURSDAY: 'T5',
      FRIDAY: 'T6',
      SATURDAY: 'T7',
      SUNDAY: 'CN',
    };

    const slotTimes = {
      ARRIVAL_PLAY: { start: '07:15', end: '08:00' },
      MORNING_EXERCISE: { start: '08:00', end: '08:30' },
      DIRECTED_STUDY: { start: '08:30', end: '09:15' },
      CORNER_PLAY: { start: '09:15', end: '10:15' },
      OUTDOOR_PLAY: { start: '10:15', end: '11:00' },
      AFTERNOON_ACTIVITY: { start: '14:00', end: '14:45' },
      RETURN_CHILD: { start: '15:30', end: '16:30' },
    };

    const slots = scheduledRecords.map((rec) => {
      const dayKey = dayKeyMap[rec.day_of_week] || 'T2';
      const times = slotTimes[rec.routine_slot] || { start: '08:30', end: '09:15' };
      const dateStr = rec.scheduled_date ? rec.scheduled_date.toISOString().slice(0, 10) : '';
      const dateFormatted = dateStr ? `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}` : '';
      const act = rec.activity;
      const content = act?.content;
      const goal = content?.goal;

      return {
        id: rec.id.toString(),
        activityId: act?.public_id || rec.activity_id.toString(),
        day: dayKey,
        dayKey,
        routineSlot: rec.routine_slot,
        startTime: times.start,
        endTime: times.end,
        title: act?.title || '',
        shortTitle: act?.title || '',
        date: dateFormatted,
        fullDate: dateStr,
        status: rec.status,
        statusLabel: rec.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Đã xếp lịch',
        domain: goal?.domain || '',
        domainLabel: goal?.domain ? (DOMAIN_LABELS[goal.domain] || goal.domain) : '',
        goalCode: goal?.goal_code || '',
        goalTitle: goal?.title || '',
        indicatorCode: goal?.indicator_code || '',
        contentTitle: content?.title || '',
        objective: act?.objective || '',
        planObjective: act?.objective || '',
        preparation: act?.preparation || '',
        procedure: act?.procedure || '',
        evaluationCriteria: act?.evaluation_criteria || '',
        evaluation_criteria: act?.evaluation_criteria || '',
        criteria: act ? {
          domain: goal?.domain || '',
          domainLabel: goal?.domain ? (DOMAIN_LABELS[goal.domain] || goal.domain) : '',
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
    });

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        academicYear: targetClass.school_year?.name || 'Năm học 2026–2027',
        studentCount: students.length,
        weekLabel: week || 'Tuần 12/10 – 16/10/2026',
        dateRange: '12/10/2026 – 16/10/2026',
      },
      stats: {
        totalStudents: students.length,
        pCount,
        nCount,
      },
      activeActivity,
      days: TIMETABLE_DAYS,
      slots,
      students: studentList,
    };
  }

  /**
   * Save assessment results for students into PostgreSQL
   */
  async saveAssessmentRecords({ classId, slotId, activityId, date, records, evaluatedBy = 40n }) {
    const today = parseAssessmentDate(date);
    let savedCount = 0;

    let targetActivityId = null;
    if (activityId) {
      const strId = String(activityId).trim();
      const isNum = typeof activityId === 'number' || /^\d+$/.test(strId);
      const isUuidFormat = isUuid(strId);

      const orConditions = [];
      if (isNum) orConditions.push({ activity_id: BigInt(strId) });
      if (isUuidFormat) orConditions.push({ public_id: strId });

      if (orConditions.length > 0) {
        const act = await prisma.educationalActivity.findFirst({
          where: {
            OR: orConditions,
            deleted_at: null,
          },
        });
        if (act) targetActivityId = act.activity_id;
      }
    } else if (slotId && !isNaN(Number(slotId))) {
      try {
        const subSlot = await prisma.subThemeActivity.findUnique({
          where: { id: BigInt(slotId) },
        });
        if (subSlot) {
          targetActivityId = subSlot.activity_id;
        }
      } catch {}
    }

    if (!targetActivityId) {
      const firstActivity = await prisma.educationalActivity.findFirst({
        where: { routine_slot: 'DIRECTED_STUDY', deleted_at: null },
      });
      targetActivityId = firstActivity ? firstActivity.activity_id : 629n;
    }

    if (Array.isArray(records) && records.length > 0) {
      const rawIds = records.map((r) => String(r.studentId || r.id).trim()).filter(Boolean);
      const numericIds = rawIds.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
      const uuidIds = rawIds.filter((id) => isUuid(id));
      const otherCodeIds = rawIds.filter((id) => !/^\d+$/.test(id) && !isUuid(id));

      const orConditions = [];
      if (numericIds.length > 0) orConditions.push({ student_id: { in: numericIds } });
      if (uuidIds.length > 0) orConditions.push({ public_id: { in: uuidIds } });
      if (otherCodeIds.length > 0) orConditions.push({ student_code: { in: otherCodeIds } });

      const matchedStudents = orConditions.length > 0
        ? await prisma.student.findMany({
            where: {
              OR: orConditions,
              deleted_at: null,
            },
            select: { student_id: true, public_id: true, student_code: true },
          })
        : [];

      const studentIdMap = new Map();
      matchedStudents.forEach((st) => {
        studentIdMap.set(st.student_id.toString(), st.student_id);
        if (st.public_id) studentIdMap.set(st.public_id, st.student_id);
        if (st.student_code) studentIdMap.set(st.student_code, st.student_id);
      });

      let evalAccountId = 40n;
      if (evaluatedBy) {
        const strEval = String(evaluatedBy).trim();
        if (/^\d+$/.test(strEval)) {
          evalAccountId = BigInt(strEval);
        } else if (isUuid(strEval)) {
          const acc = await prisma.account.findUnique({
            where: { public_id: strEval },
            select: { account_id: true },
          });
          if (acc) evalAccountId = acc.account_id;
        }
      }
      if (evalAccountId === 40n && classId) {
        const parsedClass = /^\d+$/.test(String(classId))
          ? { class_id: BigInt(classId) }
          : isUuid(String(classId))
          ? { public_id: String(classId) }
          : null;
        if (parsedClass) {
          const teacherAlloc = await prisma.teacherClass.findFirst({
            where: {
              class: parsedClass,
              left_at: null,
            },
            include: {
              teacher: { select: { account_id: true } },
            },
          });
          if (teacherAlloc?.teacher?.account_id) {
            evalAccountId = teacherAlloc.teacher.account_id;
          }
        }
      }

      for (const rec of records) {
        const rawId = String(rec.studentId || rec.id).trim();
        const sId = studentIdMap.get(rawId) || (/^\d+$/.test(rawId) ? BigInt(rawId) : null);
        if (!sId) continue;

        const status = ['ACHIEVED', 'NOT_ACHIEVED', 'OUTSTANDING'].includes(rec.status)
          ? rec.status
          : (rec.status === 'N' ? 'NOT_ACHIEVED' : 'ACHIEVED');
        const note = rec.note || (status === 'ACHIEVED' ? 'Con đạt yêu cầu' : (status === 'OUTSTANDING' ? 'Con xuất sắc' : 'Cần cô hỗ trợ thêm'));

        await prisma.dailyAssessment.upsert({
          where: {
            student_id_activity_id_assessment_date: {
              student_id: sId,
              activity_id: targetActivityId,
              assessment_date: today,
            },
          },
          update: {
            status,
            notes: note,
            updated_at: new Date(),
          },
          create: {
            student_id: sId,
            activity_id: targetActivityId,
            assessment_date: today,
            status,
            notes: note,
            evaluated_by: evalAccountId,
          },
        });
        savedCount++;
      }
    }

    if (slotId && !isNaN(Number(slotId))) {
      try {
        await prisma.subThemeActivity.update({
          where: { id: BigInt(slotId) },
          data: { status: 'COMPLETED' },
        });
      } catch {}
    }

    return {
      success: true,
      message: 'Lưu đánh giá thành công vào cơ sở dữ liệu',
      savedCount,
    };
  }

  /**
   * Delete assessment records for an activity / slot
   */
  async clearAssessmentRecords({ classId, slotId, activityId, date }) {
    const today = parseAssessmentDate(date);

    let targetActivityId = null;
    if (activityId) {
      const strId = String(activityId).trim();
      const isNum = typeof activityId === 'number' || /^\d+$/.test(strId);
      const isUuidFormat = isUuid(strId);

      const orConditions = [];
      if (isNum) orConditions.push({ activity_id: BigInt(strId) });
      if (isUuidFormat) orConditions.push({ public_id: strId });

      if (orConditions.length > 0) {
        const act = await prisma.educationalActivity.findFirst({
          where: {
            OR: orConditions,
            deleted_at: null,
          },
        });
        if (act) targetActivityId = act.activity_id;
      }
    } else if (slotId && !isNaN(Number(slotId))) {
      try {
        const subSlot = await prisma.subThemeActivity.findUnique({
          where: { id: BigInt(slotId) },
        });
        if (subSlot) {
          targetActivityId = subSlot.activity_id;
        }
      } catch {}
    }

    if (targetActivityId) {
      await prisma.dailyAssessment.deleteMany({
        where: {
          activity_id: targetActivityId,
          assessment_date: today,
        },
      });
    }

    if (slotId && !isNaN(Number(slotId))) {
      try {
        await prisma.subThemeActivity.update({
          where: { id: BigInt(slotId) },
          data: { status: 'SCHEDULED' },
        });
      } catch {}
    }

    return {
      success: true,
      message: 'Đã xóa toàn bộ đánh giá của tiết này',
    };
  }

  /**
   * Get saved assessment records for a specific slot/activity and date
   */
  async getSlotAssessmentRecords({ classId, slotId, activityId, date }) {
    const today = parseAssessmentDate(date);
    let targetActivityId = null;

    if (activityId) {
      const strId = String(activityId).trim();
      const isNum = typeof activityId === 'number' || /^\d+$/.test(strId);
      const isUuidFormat = isUuid(strId);

      const orConditions = [];
      if (isNum) orConditions.push({ activity_id: BigInt(strId) });
      if (isUuidFormat) orConditions.push({ public_id: strId });

      if (orConditions.length > 0) {
        const act = await prisma.educationalActivity.findFirst({
          where: {
            OR: orConditions,
            deleted_at: null,
          },
        });
        if (act) targetActivityId = act.activity_id;
      }
    } else if (slotId && !isNaN(Number(slotId))) {
      try {
        const subSlot = await prisma.subThemeActivity.findUnique({
          where: { id: BigInt(slotId) },
        });
        if (subSlot) {
          targetActivityId = subSlot.activity_id;
        }
      } catch {}
    }

    if (!targetActivityId) {
      return { records: [] };
    }

    const records = await prisma.dailyAssessment.findMany({
      where: {
        activity_id: targetActivityId,
        assessment_date: today,
      },
      include: {
        student: {
          select: {
            student_id: true,
            public_id: true,
            student_code: true,
          },
        },
      },
    });

    return {
      records: records.map((r) => ({
        studentId: r.student?.public_id || r.student?.student_id?.toString() || r.student_id?.toString(),
        studentCode: r.student?.student_code,
        status: r.status,
        note: r.notes || '',
      })),
    };
  }

  /**
   * Get Monthly Assessments (Sổ Bé Ngoan) querying live PostgreSQL
   */
  async getMonthlyAssessments({ classId, month, year }) {
    const targetClass = await this.resolveClass(classId);
    const students = await this.getEnrolledStudents(targetClass.class_id);

    // Find the latest month that has assessment records for this class
    const latestRecord = await prisma.monthlyAssessment.findFirst({
      where: {
        class_id: targetClass.class_id,
      },
      select: { month: true, year: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const numMonth = month ? Number(month) : (latestRecord ? latestRecord.month : prevMonth);
    const numYear = year ? Number(year) : (latestRecord ? latestRecord.year : prevYear);

    // End of queried month (e.g. for Month 9: 30/09/2026 23:59:59)
    const monthEnd = new Date(numYear, numMonth, 0, 23, 59, 59, 999);
    const isEnded = monthEnd < now;

    // School Year 2026-2027: Sept started on 07/09 and has 4 weeks
    const isSept = numMonth === 9;
    const totalWeeks = isSept ? 4 : 5;

    const studentDbIds = students.map((s) => s._student_id);
    const dbAssessments = await prisma.monthlyAssessment.findMany({
      where: {
        student_id: { in: studentDbIds },
        month: numMonth,
        year: numYear,
      },
    });

    const assessmentMap = new Map();
    dbAssessments.forEach((item) => {
      assessmentMap.set(item.student_id.toString(), item);
    });

    const startOfMonth = new Date(numYear, numMonth - 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(numYear, numMonth, 0, 23, 59, 59, 999);

    const attendances = await prisma.attendance.findMany({
      where: {
        student_id: { in: studentDbIds },
        date: { gte: startOfMonth, lte: endOfMonth },
        deleted_at: null,
      },
      select: { student_id: true, date: true, status: true },
    });

    const dailyAssessments = await prisma.dailyAssessment.findMany({
      where: {
        student_id: { in: studentDbIds },
        assessment_date: { gte: startOfMonth, lte: endOfMonth },
      },
      select: { student_id: true, assessment_date: true, status: true },
    });

    // Fetch real health assessments from PostgreSQL for all enrolled students
    const healthAssessments = await prisma.healthAssessment.findMany({
      where: {
        student_id: { in: studentDbIds },
        deleted_at: null,
      },
      orderBy: { assessment_date: 'asc' },
    });

    // Helper to partition dates by week of the month (1..4 or 5)
    // For School Year 2026-2027:
    // - Sept 2026: Official school started on Monday 07/09/2026 (4 weeks total)
    //   Week 1: 07/09 - 13/09 (5 days: 07..11)
    //   Week 2: 14/09 - 20/09 (5 days: 14..18)
    //   Week 3: 21/09 - 27/09 (5 days: 21..25)
    //   Week 4: 28/09 - 30/09 (3 days: 28..30)
    const getWeekOfMonth = (date) => {
      const d = new Date(date);
      const day = d.getDate();
      const m = d.getMonth() + 1;
      const y = d.getFullYear();

      if (m === 9 && y === 2026) {
        if (day < 7) return 0;
        if (day <= 13) return 1;
        if (day <= 20) return 2;
        if (day <= 27) return 3;
        return 4;
      }

      // General: Monday-based week index in month
      const firstDay = new Date(y, m - 1, 1);
      const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 for Mon, 6 for Sun
      const offset = day + firstDayOfWeek - 1;
      const weekNum = Math.floor(offset / 7) + 1;
      return Math.min(Math.max(1, weekNum), 5);
    };

    const getMonthWeekRanges = (m, y) => {
      const isSept26 = m === 9 && y === 2026;
      if (isSept26) {
        return {
          1: { start: new Date(Date.UTC(2026, 8, 7)), end: new Date(Date.UTC(2026, 8, 13, 23, 59, 59, 999)) },
          2: { start: new Date(Date.UTC(2026, 8, 14)), end: new Date(Date.UTC(2026, 8, 20, 23, 59, 59, 999)) },
          3: { start: new Date(Date.UTC(2026, 8, 21)), end: new Date(Date.UTC(2026, 8, 27, 23, 59, 59, 999)) },
          4: { start: new Date(Date.UTC(2026, 8, 28)), end: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)) },
        };
      }
      const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const ranges = {};
      let currentStartDay = 1;
      let weekIdx = 1;
      while (currentStartDay <= lastDayOfMonth && weekIdx <= 5) {
        const curStartDate = new Date(Date.UTC(y, m - 1, currentStartDay));
        const dayOfWeek = curStartDate.getUTCDay();
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const endDay = Math.min(lastDayOfMonth, currentStartDay + daysUntilSunday);
        ranges[weekIdx] = {
          start: new Date(Date.UTC(y, m - 1, currentStartDay)),
          end: new Date(Date.UTC(y, m - 1, endDay, 23, 59, 59, 999)),
        };
        currentStartDay = endDay + 1;
        weekIdx++;
      }
      return ranges;
    };

    const weekRanges = getMonthWeekRanges(numMonth, numYear);

    const resolveHealthAssessmentStatus = (h) => {
      if (!h) return { status: 'Chưa đánh giá', dateStr: '' };
      const d = new Date(h.assessment_date);
      const pad = (n) => String(n).padStart(2, '0');
      const dStr = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
      const notes = (h.notes || '').toLowerCase();
      const bz = h.bmi_for_age_zscore != null ? Number(h.bmi_for_age_zscore) : null;
      const wz = h.weight_for_age_zscore != null ? Number(h.weight_for_age_zscore) : null;
      const hz = h.height_for_age_zscore != null ? Number(h.height_for_age_zscore) : null;

      let st = 'Bình thường';
      if (bz != null && bz > 2) st = 'Thừa cân';
      else if (bz != null && bz > 1.5 && wz != null && wz > 1.5) st = 'Nguy cơ thừa cân';
      else if (bz != null && bz < -2) st = 'Theo dõi nhẹ cân';
      else if (wz != null && wz < -2) st = 'Theo dõi nhẹ cân';
      else if (hz != null && hz < -2) st = 'Theo dõi thấp còi';
      else if (notes.includes('nhẹ cân') || notes.includes('suy dinh dưỡng')) st = 'Theo dõi nhẹ cân';
      else if (notes.includes('thừa cân') || notes.includes('béo phì')) st = 'Thừa cân';

      return { status: st, dateStr: dStr };
    };

    const hasRealActivityData = attendances.length > 0 || dailyAssessments.length > 0;

    const buildWeeklyStat = (present, totalAtt = 5, achieved = 0, totalGoals = 4, healthInfo = {}) => {
      const p = Number(present ?? 0);
      const tA = Number(totalAtt || 5);
      const a = Number(achieved ?? 0);
      const tG = Number(totalGoals || 4);
      return {
        attendancePresent: p,
        attendanceTotal: tA,
        attendanceRate: Math.round((p / tA) * 100),
        goalsAchieved: Math.min(a, tG),
        goalsTotal: tG,
        goalsRate: Math.round((Math.min(a, tG) / tG) * 100),
        healthStatus: healthInfo.healthStatus || 'Bình thường',
        healthSourceLabel: healthInfo.healthSourceLabel || '',
        healthExamDate: healthInfo.healthExamDate || null,
        hasHealthCheckThisWeek: Boolean(healthInfo.hasHealthCheckThisWeek),
      };
    };

    const studentList = students.map((s, idx) => {
      const sIdStr = s._student_id.toString();
      const existing = assessmentMap.get(sIdStr);

      // Student actual attendance by week
      const sAtt = attendances.filter((a) => a.student_id.toString() === sIdStr);
      const sAss = dailyAssessments.filter((a) => a.student_id.toString() === sIdStr);
      const sHealth = healthAssessments.filter((h) => h.student_id.toString() === sIdStr);

      const resolveWeekHealth = (w) => {
        const range = weekRanges[w];
        if (!range) {
          return { healthStatus: 'Bình thường', healthSourceLabel: '' };
        }
        const inWeek = sHealth.filter((h) => {
          const dt = new Date(h.assessment_date);
          return dt >= range.start && dt <= range.end;
        });

        if (inWeek.length > 0) {
          const latest = inWeek[inWeek.length - 1];
          const res = resolveHealthAssessmentStatus(latest);
          return {
            healthStatus: res.status,
            healthExamDate: latest.assessment_date ? new Date(latest.assessment_date).toISOString().slice(0, 10) : null,
            hasHealthCheckThisWeek: true,
            healthSourceLabel: `Đo ngày ${res.dateStr} - Tuần ${w}`,
          };
        }

        // Lấy lần đo gần nhất trước đó (tính đến cuối tuần này)
        const previous = sHealth.filter((h) => new Date(h.assessment_date) <= range.end);
        if (previous.length > 0) {
          const latestPrev = previous[previous.length - 1];
          const res = resolveHealthAssessmentStatus(latestPrev);
          return {
            healthStatus: res.status,
            healthExamDate: latestPrev.assessment_date ? new Date(latestPrev.assessment_date).toISOString().slice(0, 10) : null,
            hasHealthCheckThisWeek: false,
            healthSourceLabel: `Tuần ${w} không đo - Kế thừa lần đo gần nhất ngày ${res.dateStr}`,
          };
        }

        // Nếu trước đó chưa có đợt đo, lấy đợt đo gần nhất sau đó
        if (sHealth.length > 0) {
          const res = resolveHealthAssessmentStatus(sHealth[0]);
          return {
            healthStatus: res.status,
            healthExamDate: sHealth[0].assessment_date ? new Date(sHealth[0].assessment_date).toISOString().slice(0, 10) : null,
            hasHealthCheckThisWeek: false,
            healthSourceLabel: `Kế thừa đợt đo gần nhất ngày ${res.dateStr}`,
          };
        }

        return {
          healthStatus: 'Chưa đánh giá',
          healthExamDate: null,
          hasHealthCheckThisWeek: false,
          healthSourceLabel: 'Chưa có đợt đo',
        };
      };

      const weekAttCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      sAtt.forEach((a) => {
        if (a.status === 'PRESENT') {
          const w = getWeekOfMonth(a.date);
          if (w >= 1 && w <= 5) {
            weekAttCounts[w] = (weekAttCounts[w] || 0) + 1;
          }
        }
      });

      const weekGoalCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      sAss.forEach((a) => {
        if (a.status === 'ACHIEVED' || a.status === 'OUTSTANDING') {
          const w = getWeekOfMonth(a.assessment_date);
          if (w >= 1 && w <= 5) {
            weekGoalCounts[w] = (weekGoalCounts[w] || 0) + 1;
          }
        }
      });

      const w4AttTotal = isSept ? 3 : 5;
      const w1Health = resolveWeekHealth(1);
      const w2Health = resolveWeekHealth(2);
      const w3Health = resolveWeekHealth(3);
      const w4Health = resolveWeekHealth(4);
      const w5Health = resolveWeekHealth(5);

      if (existing) {
        const count = existing.roses_count;
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          gender: s.gender,
          week1Rose: Boolean(existing.week_1_rose),
          week2Rose: Boolean(existing.week_2_rose),
          week3Rose: Boolean(existing.week_3_rose),
          week4Rose: Boolean(existing.week_4_rose),
          week5Rose: isSept ? false : Boolean(existing.week_5_rose),
          rosesCount: count,
          isLotus: count >= 4,
          teacherNotes: existing.teacher_notes || '',
          parentFeedback: existing.parent_feedback || null,
          feedbackAt: existing.feedback_at ? existing.feedback_at.toISOString() : null,
          feedbackBy: existing.feedback_by ? 'Phụ huynh' : null,
          weeklyStats: {
            week1: buildWeeklyStat(
              weekAttCounts[1] || (existing.week_1_rose ? 5 : 4),
              5,
              weekGoalCounts[1] || (existing.week_1_rose ? 4 : 3),
              4,
              w1Health
            ),
            week2: buildWeeklyStat(
              weekAttCounts[2] || (existing.week_2_rose ? 5 : 4),
              5,
              weekGoalCounts[2] || (existing.week_2_rose ? 4 : 3),
              4,
              w2Health
            ),
            week3: buildWeeklyStat(
              weekAttCounts[3] || (existing.week_3_rose ? 5 : 4),
              5,
              weekGoalCounts[3] || (existing.week_3_rose ? 4 : 3),
              4,
              w3Health
            ),
            week4: buildWeeklyStat(
              weekAttCounts[4] || (existing.week_4_rose ? w4AttTotal : Math.max(1, w4AttTotal - 1)),
              w4AttTotal,
              weekGoalCounts[4] || (existing.week_4_rose ? 4 : 3),
              4,
              w4Health
            ),
            ...(!isSept ? {
              week5: buildWeeklyStat(
                weekAttCounts[5] || (existing.week_5_rose ? 5 : 4),
                5,
                weekGoalCounts[5] || (existing.week_5_rose ? 4 : 3),
                4,
                w5Health
              ),
            } : {}),
          },
        };
      }

      if (!isEnded) {
        // Month has NOT ended yet (e.g. Month 10 or future): not yet evaluated
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          gender: s.gender,
          week1Rose: false,
          week2Rose: false,
          week3Rose: false,
          week4Rose: false,
          week5Rose: false,
          rosesCount: 0,
          isLotus: false,
          teacherNotes: '',
          parentFeedback: null,
          feedbackAt: null,
          feedbackBy: null,
          weeklyStats: {
            week1: buildWeeklyStat(weekAttCounts[1], 5, weekGoalCounts[1], 4, w1Health),
            week2: buildWeeklyStat(weekAttCounts[2], 5, weekGoalCounts[2], 4, w2Health),
            week3: buildWeeklyStat(weekAttCounts[3], 5, weekGoalCounts[3], 4, w3Health),
            week4: buildWeeklyStat(weekAttCounts[4], w4AttTotal, weekGoalCounts[4], 4, w4Health),
            ...(!isSept ? { week5: buildWeeklyStat(weekAttCounts[5], 5, weekGoalCounts[5], 4, w5Health) } : {}),
          },
        };
      }

      // Month has ended but no record saved:
      // If no activity/attendance in this class, all roses are false and attendance/goals are 0
      if (!hasRealActivityData) {
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          gender: s.gender,
          week1Rose: false,
          week2Rose: false,
          week3Rose: false,
          week4Rose: false,
          week5Rose: false,
          rosesCount: 0,
          isLotus: false,
          teacherNotes: '',
          parentFeedback: null,
          feedbackAt: null,
          feedbackBy: null,
          weeklyStats: {
            week1: buildWeeklyStat(0, 5, 0, 4, w1Health),
            week2: buildWeeklyStat(0, 5, 0, 4, w2Health),
            week3: buildWeeklyStat(0, 5, 0, 4, w3Health),
            week4: buildWeeklyStat(0, w4AttTotal, 0, 4, w4Health),
            ...(!isSept ? { week5: buildWeeklyStat(0, 5, 0, 4, w5Health) } : {}),
          },
        };
      }

      const w1 = weekAttCounts[1] >= 4 && weekGoalCounts[1] >= 3;
      const w2 = weekAttCounts[2] >= 4 && weekGoalCounts[2] >= 3;
      const w3 = weekAttCounts[3] >= 4 && weekGoalCounts[3] >= 3;
      const w4 = isSept ? (weekAttCounts[4] >= 2 && weekGoalCounts[4] >= 2) : (weekAttCounts[4] >= 4 && weekGoalCounts[4] >= 3);
      const w5 = isSept ? false : (weekAttCounts[5] >= 4 && weekGoalCounts[5] >= 3);
      const count = (w1 ? 1 : 0) + (w2 ? 1 : 0) + (w3 ? 1 : 0) + (w4 ? 1 : 0) + (w5 ? 1 : 0);

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        gender: s.gender,
        week1Rose: w1,
        week2Rose: w2,
        week3Rose: w3,
        week4Rose: w4,
        week5Rose: w5,
        rosesCount: count,
        isLotus: count >= 4,
        teacherNotes: '',
        parentFeedback: null,
        feedbackAt: null,
        feedbackBy: null,
        weeklyStats: {
          week1: buildWeeklyStat(weekAttCounts[1], 5, weekGoalCounts[1], 4, w1Health),
          week2: buildWeeklyStat(weekAttCounts[2], 5, weekGoalCounts[2], 4, w2Health),
          week3: buildWeeklyStat(weekAttCounts[3], 5, weekGoalCounts[3], 4, w3Health),
          week4: buildWeeklyStat(weekAttCounts[4], w4AttTotal, weekGoalCounts[4], 4, w4Health),
          ...(!isSept ? { week5: buildWeeklyStat(weekAttCounts[5], 5, weekGoalCounts[5], 4, w5Health) } : {}),
        },
      };
    });

    const lotusCount = studentList.filter((s) => s.isLotus).length;
    const completedCount = studentList.filter((s) => s.teacherNotes?.trim().length > 0).length;
    const parentFeedbackCount = studentList.filter((s) => Boolean(s.parentFeedback)).length;

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        academicYear: targetClass.school_year?.name || 'Năm học 2026–2027',
        month: numMonth,
        year: numYear,
        monthLabel: `Tháng ${numMonth}/${numYear}`,
        isEnded,
        totalWeeks,
        latestEvaluatedMonth: latestRecord ? { month: latestRecord.month, year: latestRecord.year } : null,
      },
      stats: {
        totalStudents: studentList.length,
        lotusCount,
        completedCount,
        parentFeedbackCount,
      },
      students: studentList,
    };
  }

  /**
   * Save Monthly Assessments into PostgreSQL
   */
  async saveMonthlyAssessments({ classId, month = 10, year = 2026, records = [], evaluatedBy = 40 }) {
    const numMonth = Number(month) || 10;
    const numYear = Number(year) || 2026;
    const targetClass = await this.resolveClass(classId);
    const cId = targetClass.class_id;

    let savedCount = 0;
    if (Array.isArray(records) && records.length > 0) {
      const rawIds = records.map((r) => String(r.studentId || r.id).trim()).filter(Boolean);
      const numericIds = rawIds.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
      const uuidIds = rawIds.filter((id) => !/^\d+$/.test(id));

      const matchedStudents = await prisma.student.findMany({
        where: {
          OR: [
            ...(numericIds.length > 0 ? [{ student_id: { in: numericIds } }] : []),
            ...(uuidIds.length > 0 ? [{ public_id: { in: uuidIds } }] : []),
          ],
        },
        select: { student_id: true, public_id: true },
      });

      const studentIdMap = new Map();
      matchedStudents.forEach((st) => {
        studentIdMap.set(st.student_id.toString(), st.student_id);
        if (st.public_id) studentIdMap.set(st.public_id, st.student_id);
      });

      for (const rec of records) {
        const rawId = String(rec.studentId || rec.id).trim();
        const sId = studentIdMap.get(rawId) || (/^\d+$/.test(rawId) ? BigInt(rawId) : null);
        if (!sId) continue;

        const rosesCount = (rec.week1Rose ? 1 : 0) +
          (rec.week2Rose ? 1 : 0) +
          (rec.week3Rose ? 1 : 0) +
          (rec.week4Rose ? 1 : 0) +
          (rec.week5Rose ? 1 : 0);

        await prisma.monthlyAssessment.upsert({
          where: {
            student_id_month_year: {
              student_id: sId,
              month: numMonth,
              year: numYear,
            },
          },
          update: {
            class_id: cId,
            week_1_rose: Boolean(rec.week1Rose),
            week_2_rose: Boolean(rec.week2Rose),
            week_3_rose: Boolean(rec.week3Rose),
            week_4_rose: Boolean(rec.week4Rose),
            week_5_rose: Boolean(rec.week5Rose),
            roses_count: rosesCount,
            teacher_notes: rec.teacherNotes || '',
            updated_at: new Date(),
          },
          create: {
            student_id: sId,
            class_id: cId,
            month: numMonth,
            year: numYear,
            week_1_rose: Boolean(rec.week1Rose),
            week_2_rose: Boolean(rec.week2Rose),
            week_3_rose: Boolean(rec.week3Rose),
            week_4_rose: Boolean(rec.week4Rose),
            week_5_rose: Boolean(rec.week5Rose),
            roses_count: rosesCount,
            teacher_notes: rec.teacherNotes || '',
            evaluated_by: BigInt(evaluatedBy || 40),
          },
        });
        savedCount++;
      }
    }

    return {
      success: true,
      message: 'Lưu sổ bé ngoan tháng thành công',
      savedCount,
    };
  }

  /**
   * Get Semester Assessments querying live PostgreSQL
   */
  async getSemesterAssessments({ classId, semester = 'SEMESTER_1', year = 2026 }) {
    const sem = semester === 'SEMESTER_2' ? 'SEMESTER_2' : 'SEMESTER_1';
    const targetClass = await this.resolveClass(classId);
    const students = await this.getEnrolledStudents(targetClass.class_id);

    const schoolYear = targetClass.school_year;
    const s1Start = schoolYear?.start_date ? new Date(schoolYear.start_date) : new Date('2026-09-07');
    const s1End = schoolYear?.semester_1_end_date ? new Date(schoolYear.semester_1_end_date) : new Date('2027-01-15');
    const s2End = schoolYear?.end_date ? new Date(schoolYear.end_date) : new Date('2027-05-31');
    const s2Start = new Date(s1End);
    s2Start.setDate(s2Start.getDate() + 1);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const formatVN = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const formatISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const isSem2 = sem === 'SEMESTER_2';
    const semStart = isSem2 ? s2Start : s1Start;
    const semEnd = isSem2 ? s2End : s1End;

    // Check if semester has started
    const isStarted = now >= semStart;
    const isCompleted = now > semEnd;
    const isOngoing = isStarted && !isCompleted;

    const semesterDates = {
      semester: sem,
      semesterLabel: isSem2 ? 'Học kỳ 2' : 'Học kỳ 1',
      startDate: formatISO(semStart),
      endDate: formatISO(semEnd),
      startDateVN: formatVN(semStart),
      endDateVN: formatVN(semEnd),
      dateRangeLabel: `${formatVN(semStart)} – ${formatVN(semEnd)}`,
      status: !isStarted ? 'NOT_STARTED' : isCompleted ? 'COMPLETED' : 'ONGOING',
      statusLabel: !isStarted ? 'Chưa bắt đầu' : isCompleted ? 'Đã kết thúc' : 'Đang diễn ra',
    };

    // Calculate effective date range for metrics
    let calculatedFrom = null;
    let calculatedUntil = null;
    let calculatedFromVN = null;
    let calculatedUntilVN = null;
    let calculationPeriodLabel = '';
    let totalSchoolDays = 0;

    if (isStarted) {
      calculatedFrom = formatISO(semStart);
      calculatedFromVN = formatVN(semStart);
      const effectiveEnd = now < semEnd ? now : semEnd;
      calculatedUntil = formatISO(effectiveEnd);
      calculatedUntilVN = formatVN(effectiveEnd);
      calculationPeriodLabel = `Từ ${calculatedFromVN} đến ${calculatedUntilVN}`;

      // Count actual weekdays (Monday - Friday) between semStart and effectiveEnd
      let count = 0;
      const cur = new Date(semStart);
      cur.setHours(0, 0, 0, 0);
      const endLimit = new Date(effectiveEnd);
      endLimit.setHours(23, 59, 59, 999);
      while (cur <= endLimit) {
        const d = cur.getDay();
        if (d !== 0 && d !== 6) {
          count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
      totalSchoolDays = count;
    }

    const studentDbIds = students.map((s) => s._student_id);

    // Fetch real health assessments for all students in class (most recent first)
    const healthRecords = await prisma.healthAssessment.findMany({
      where: {
        student_id: { in: studentDbIds },
        deleted_at: null,
      },
      orderBy: {
        assessment_date: 'desc',
      },
    });

    const healthMap = new Map();
    healthRecords.forEach((h) => {
      const sid = h.student_id.toString();
      if (!healthMap.has(sid)) {
        healthMap.set(sid, h);
      }
    });

    // Fetch real attendance records for ongoing semester
    const effectiveEnd = now < semEnd ? now : semEnd;
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        student_id: { in: studentDbIds },
        class_id: targetClass.class_id,
        date: {
          gte: semStart,
          lte: effectiveEnd,
        },
        deleted_at: null,
      },
      select: {
        student_id: true,
        status: true,
      },
    });

    const attendanceStatsMap = new Map();
    attendanceRecords.forEach((att) => {
      const sid = att.student_id.toString();
      if (!attendanceStatsMap.has(sid)) {
        attendanceStatsMap.set(sid, { present: 0, absent: 0 });
      }
      const st = attendanceStatsMap.get(sid);
      if (att.status === 'PRESENT' || att.status === 'LATE') {
        st.present++;
      } else {
        st.absent++;
      }
    });

    // Fetch real daily assessments for ongoing semester
    const dailyAssessmentRecords = await prisma.dailyAssessment.findMany({
      where: {
        student_id: { in: studentDbIds },
        assessment_date: {
          gte: semStart,
          lte: effectiveEnd,
        },
      },
      include: {
        goal: true,
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
    });

    const studentDailyAssessmentsMap = new Map();
    dailyAssessmentRecords.forEach((da) => {
      const sid = da.student_id.toString();
      if (!studentDailyAssessmentsMap.has(sid)) {
        studentDailyAssessmentsMap.set(sid, []);
      }
      studentDailyAssessmentsMap.get(sid).push(da);
    });

    const dbAssessments = await prisma.semesterAssessment.findMany({
      where: {
        class_id: targetClass.class_id,
        semester: sem,
      },
    });

    const map = new Map();
    dbAssessments.forEach((item) => {
      map.set(item.student_id.toString(), item);
    });

    const studentList = students.map((s, idx) => {
      const existing = map.get(s._student_id.toString());

      if (!isStarted) {
        // Semester 2 hasn't started yet! No fake evaluation numbers
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          gender: s.gender,
          semester: sem,
          attendance: {
            presentDays: 0,
            totalDays: 0,
            rate: null,
          },
          hasEvaluatedGoals: false,
          domains: {
            physical: null,
            cognitive: null,
            language: null,
            socioEmotional: null,
            aesthetic: null,
          },
          domainBreakdown: null,
          totalGoals: null,
          overallGoalsRate: null,
          health: {
            status: '--',
            examLabel: '--',
            examDate: '--',
          },
          teacherNotes: existing?.teacher_notes || '',
          isEvaluated: Boolean(existing?.teacher_notes?.trim()),
          updatedAt: existing?.updated_at ? existing.updated_at.toISOString() : null,
        };
      }

      // Real health assessment resolution from PostgreSQL
      const healthRec = healthMap.get(s._student_id.toString());
      let healthStatus = 'Bình thường';
      let examDateFormatted = '--';
      let examLabel = '--';
      if (healthRec) {
        if (healthRec.assessment_date) {
          const hd = new Date(healthRec.assessment_date);
          examDateFormatted = formatVN(hd);
          const examMonth = (hd.getMonth() + 1).toString().padStart(2, '0');
          const examYear = hd.getFullYear();
          examLabel = `${examMonth}/${examYear}`;
        }
        const notes = (healthRec.notes || '').toLowerCase();
        const bmi = Number(healthRec.bmi) || 0;
        if (notes.includes('nhẹ cân') || notes.includes('suy dinh dưỡng') || (bmi > 0 && bmi < 13.5)) {
          healthStatus = 'Theo dõi nhẹ cân';
        } else if (notes.includes('thừa cân') || notes.includes('béo phì') || (bmi > 0 && bmi > 18)) {
          healthStatus = 'Theo dõi thừa cân/béo phì';
        } else {
          healthStatus = 'Bình thường';
        }
      } else {
        healthStatus = 'Chưa đánh giá';
        examDateFormatted = '--';
        examLabel = '--';
      }

      // Real attendance resolution from PostgreSQL
      const attStat = attendanceStatsMap.get(s._student_id.toString());
      let presentDays = 0;
      let totalAttDays = 0;
      let attendanceRate = null;
      if (attStat && (attStat.present + attStat.absent > 0)) {
        presentDays = attStat.present;
        totalAttDays = attStat.present + attStat.absent;
        attendanceRate = totalAttDays > 0 ? Math.round((presentDays / totalAttDays) * 100) : null;
      } else {
        presentDays = 0;
        totalAttDays = 0;
        attendanceRate = null;
      }

      // 5 Developmental domains calculations based on real DailyAssessment
      const studentDAs = studentDailyAssessmentsMap.get(s._student_id.toString()) || [];
      const evaluatedDAs = studentDAs.filter(
        (da) => da.status === 'ACHIEVED' || da.status === 'NOT_ACHIEVED' || da.status === 'OUTSTANDING'
      );

      const hasEvaluatedGoals = evaluatedDAs.length > 0;
      let domainGoals = null;
      let domains = {
        physical: null,
        cognitive: null,
        language: null,
        socioEmotional: null,
        aesthetic: null,
      };
      let overallGoalsRate = null;
      let totalAchievedGoals = 0;
      let totalEvaluatedGoals = 0;

      if (hasEvaluatedGoals) {
        const domainCounts = {
          PHYSICAL: { passed: 0, total: 0 },
          COGNITIVE: { passed: 0, total: 0 },
          LANGUAGE: { passed: 0, total: 0 },
          SOCIO_EMOTIONAL: { passed: 0, total: 0 },
          AESTHETIC: { passed: 0, total: 0 },
        };

        evaluatedDAs.forEach((da) => {
          const goal = da.goal || da.activity?.content?.goal;
          const dom = goal?.domain || 'PHYSICAL';
          if (domainCounts[dom]) {
            domainCounts[dom].total++;
            if (da.status === 'ACHIEVED' || da.status === 'OUTSTANDING') {
              domainCounts[dom].passed++;
            }
          }
        });

        const calcDomain = (domKey, targetTotal) => {
          const dc = domainCounts[domKey];
          if (!dc || dc.total === 0) return null;
          const rate = Math.round((dc.passed / dc.total) * 100);
          return { rate, achieved: dc.passed, total: dc.total, targetTotal };
        };

        const phys = calcDomain('PHYSICAL', 25);
        const cogn = calcDomain('COGNITIVE', 20);
        const lang = calcDomain('LANGUAGE', 18);
        const soci = calcDomain('SOCIO_EMOTIONAL', 20);
        const aest = calcDomain('AESTHETIC', 16);

        domains = {
          physical: phys?.rate ?? null,
          cognitive: cogn?.rate ?? null,
          language: lang?.rate ?? null,
          socioEmotional: soci?.rate ?? null,
          aesthetic: aest?.rate ?? null,
        };

        domainGoals = {
          physical: phys,
          cognitive: cogn,
          language: lang,
          socioEmotional: soci,
          aesthetic: aest,
        };

        const ratedList = [domains.physical, domains.cognitive, domains.language, domains.socioEmotional, domains.aesthetic].filter((v) => v !== null);
        overallGoalsRate = ratedList.length > 0 ? Math.round(ratedList.reduce((a, b) => a + b, 0) / ratedList.length) : null;
        totalAchievedGoals = (phys?.achieved || 0) + (cogn?.achieved || 0) + (lang?.achieved || 0) + (soci?.achieved || 0) + (aest?.achieved || 0);
        totalEvaluatedGoals = (phys?.total || 0) + (cogn?.total || 0) + (lang?.total || 0) + (soci?.total || 0) + (aest?.total || 0);
      }

      const savedNote = existing?.teacher_notes;
      const hasSavedNote = typeof savedNote === 'string' && savedNote.trim().length > 0;

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        gender: s.gender,
        semester: sem,
        attendance: {
          presentDays,
          totalDays: attendanceRate !== null ? (totalAttDays || totalSchoolDays) : 0,
          rate: attendanceRate,
        },
        hasEvaluatedGoals,
        domains: {
          physical: domains.physical,
          cognitive: domains.cognitive,
          language: domains.language,
          socioEmotional: domains.socioEmotional,
          aesthetic: domains.aesthetic,
        },
        domainBreakdown: domainGoals,
        totalGoals: hasEvaluatedGoals
          ? {
              achieved: totalAchievedGoals,
              total: totalEvaluatedGoals,
              rate: totalEvaluatedGoals > 0 ? Math.round((totalAchievedGoals / totalEvaluatedGoals) * 100) : 0,
            }
          : null,
        overallGoalsRate,
        health: {
          status: healthStatus,
          examLabel,
          examDate: examDateFormatted,
        },
        teacherNotes: hasSavedNote ? savedNote : '',
        isEvaluated: hasSavedNote,
        updatedAt: existing?.updated_at ? existing.updated_at.toISOString() : null,
      };
    });

    const completedCount = studentList.filter((s) => s.isEvaluated).length;
    const pendingCount = studentList.length - completedCount;

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        academicYear: schoolYear?.name || 'Năm học 2026–2027',
        semester: sem,
        semesterLabel: isSem2 ? 'Học kỳ 2' : 'Học kỳ 1',
        semesterDates,
        calculatedFrom,
        calculatedUntil,
        calculatedFromVN,
        calculatedUntilVN,
        calculationPeriodLabel,
        totalSchoolDays,
        isStarted,
        isOngoing,
        isCompleted,
      },
      stats: {
        totalStudents: studentList.length,
        completedCount,
        pendingCount,
      },
      students: studentList,
    };
  }

  /**
   * Save Semester Assessments
   */
  async saveSemesterAssessments({ classId, semester = 'SEMESTER_1', records = [], evaluatedBy = 40 }) {
    const sem = semester === 'SEMESTER_2' ? 'SEMESTER_2' : 'SEMESTER_1';
    const targetClass = await this.resolveClass(classId);
    const cId = targetClass.class_id;

    let savedCount = 0;
    if (Array.isArray(records) && records.length > 0) {
      const rawIds = records.map((r) => String(r.studentId || r.id).trim()).filter(Boolean);
      const numericIds = rawIds.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
      const uuidIds = rawIds.filter((id) => !/^\d+$/.test(id));

      const matchedStudents = await prisma.student.findMany({
        where: {
          OR: [
            ...(numericIds.length > 0 ? [{ student_id: { in: numericIds } }] : []),
            ...(uuidIds.length > 0 ? [{ public_id: { in: uuidIds } }] : []),
          ],
        },
        select: { student_id: true, public_id: true },
      });

      const studentIdMap = new Map();
      matchedStudents.forEach((st) => {
        studentIdMap.set(st.student_id.toString(), st.student_id);
        if (st.public_id) studentIdMap.set(st.public_id, st.student_id);
      });

      for (const rec of records) {
        const rawId = String(rec.studentId || rec.id).trim();
        const sId = studentIdMap.get(rawId) || (/^\d+$/.test(rawId) ? BigInt(rawId) : null);
        if (!sId) continue;

        await prisma.semesterAssessment.upsert({
          where: {
            student_id_class_id_semester: {
              student_id: sId,
              class_id: cId,
              semester: sem,
            },
          },
          update: {
            teacher_notes: rec.teacherNotes || '',
            updated_at: new Date(),
          },
          create: {
            student_id: sId,
            class_id: cId,
            semester: sem,
            teacher_notes: rec.teacherNotes || '',
            evaluated_by: BigInt(evaluatedBy || 40),
          },
        });
        savedCount++;
      }
    }

    return {
      success: true,
      message: 'Lưu đánh giá cuối kỳ thành công vào cơ sở dữ liệu',
      savedCount,
    };
  }
}

export const assessmentService = new AssessmentService();
export default assessmentService;
