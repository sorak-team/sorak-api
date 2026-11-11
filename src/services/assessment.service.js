import prisma from '../config/prisma.js';
import { NotFound } from '../utils/http-error.js';
import { notificationService } from './notification.service.js';
import { TIMETABLE_DAYS } from './mock-data.js';
import { getClassificationFromZScores } from '../utils/who-calculator.js';

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
   * Helper to resolve evaluator account_id (BigInt)
   * Handles numeric string/number, UUID public_id, or fallback to class teacher / default (40n)
   */
  async resolveEvaluatorAccountId(evaluatedBy, classId = null) {
    let evalAccountId = null;
    if (evaluatedBy) {
      const strEval = String(evaluatedBy).trim();
      if (/^\d+$/.test(strEval)) {
        const acc = await prisma.account.findUnique({
          where: { account_id: BigInt(strEval) },
          select: { account_id: true },
        });
        if (acc) evalAccountId = acc.account_id;
      } else if (isUuid(strEval)) {
        const acc = await prisma.account.findUnique({
          where: { public_id: strEval },
          select: { account_id: true },
        });
        if (acc) {
          evalAccountId = acc.account_id;
        }
      }
    }
    if (!evalAccountId && classId) {
      try {
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
      } catch (err) {
        // ignore fallback errors
      }
    }
    if (!evalAccountId) {
      const firstAcc = await prisma.account.findFirst({
        where: { is_active: true },
        orderBy: { account_id: 'asc' },
        select: { account_id: true },
      });
      evalAccountId = firstAcc ? firstAcc.account_id : 1n;
    }
    return evalAccountId;
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
      enrolledAt: e.enrolled_at ? new Date(e.enrolled_at).toISOString().slice(0, 10) : null,
      leftAt: e.left_at ? new Date(e.left_at).toISOString().slice(0, 10) : null,
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
        if (act) {
          targetActivityId = act.activity_id;
        } else if (isNum) {
          // If not found in educationalActivity, activityId might be a slot ID in subThemeActivity
          try {
            const subSlot = await prisma.subThemeActivity.findUnique({
              where: { id: BigInt(strId) },
            });
            if (subSlot && subSlot.activity_id) {
              targetActivityId = subSlot.activity_id;
            }
          } catch {}
        }
      }
    }

    if (!targetActivityId && slotId && !isNaN(Number(slotId))) {
      try {
        const subSlot = await prisma.subThemeActivity.findUnique({
          where: { id: BigInt(slotId) },
        });
        if (subSlot && subSlot.activity_id) {
          targetActivityId = subSlot.activity_id;
        }
      } catch {}
    }

    if (!targetActivityId) {
      const firstActivity = await prisma.educationalActivity.findFirst({
        where: { deleted_at: null },
        orderBy: { activity_id: 'asc' },
      });
      if (firstActivity) {
        targetActivityId = firstActivity.activity_id;
      } else {
        const created = await prisma.educationalActivity.create({
          data: {
            title: 'Hoạt động học tập và sinh hoạt hàng ngày',
            activity_type: 'ROUTINE',
            routine_slot: 'DIRECTED_STUDY',
          },
        });
        targetActivityId = created.activity_id;
      }
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

      const evalAccountId = await this.resolveEvaluatorAccountId(evaluatedBy, classId);

      for (const rec of records) {
        const rawId = String(rec.studentId || rec.id).trim();
        const sId = studentIdMap.get(rawId) || (/^\d+$/.test(rawId) ? BigInt(rawId) : null);
        if (!sId) continue;

        let status = ['ACHIEVED', 'NOT_ACHIEVED', 'OUTSTANDING'].includes(rec.status)
          ? rec.status
          : (rec.status === 'N' ? 'NOT_ACHIEVED' : 'ACHIEVED');

        // Nghiệp vụ: Bé nghỉ học không cho phép đánh giá đạt hoặc vượt trội
        const att = await prisma.attendance.findFirst({
          where: {
            student_id: sId,
            date: today,
            status: { in: ['ABSENT', 'EXCUSED_ABSENCE', 'UNEXCUSED_ABSENCE'] },
            deleted_at: null,
          },
        });
        if (att && (status === 'ACHIEVED' || status === 'OUTSTANDING')) {
          status = 'NOT_ACHIEVED';
        }

        const note = rec.note || (att ? 'Nghỉ học' : (status === 'ACHIEVED' ? 'Con đạt yêu cầu' : (status === 'OUTSTANDING' ? 'Con xuất sắc' : 'Cần cô hỗ trợ thêm')));

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

    // Ngày bắt đầu năm học 2026-2027 (Mặc định Thứ Hai 07/09/2026)
    const syStartDate = targetClass.school_year?.start_date
      ? new Date(targetClass.school_year.start_date)
      : new Date(2026, 8, 7);

    // Xây dựng danh sách 9 tháng học kỳ (mỗi tháng gồm đúng 4 tuần trọn vẹn = 28 ngày)
    const ACADEMIC_MONTHS = [
      { month: 9, year: 2026, label: 'Tháng 9/2026' },
      { month: 10, year: 2026, label: 'Tháng 10/2026' },
      { month: 11, year: 2026, label: 'Tháng 11/2026' },
      { month: 12, year: 2026, label: 'Tháng 12/2026' },
      { month: 1, year: 2027, label: 'Tháng 1/2027' },
      { month: 2, year: 2027, label: 'Tháng 2/2027' },
      { month: 3, year: 2027, label: 'Tháng 3/2027' },
      { month: 4, year: 2027, label: 'Tháng 4/2027' },
      { month: 5, year: 2027, label: 'Tháng 5/2027' },
    ];

    const academicMonthsMap = {};
    let cursorStart = new Date(syStartDate);
    cursorStart.setHours(0, 0, 0, 0);

    ACADEMIC_MONTHS.forEach((mObj) => {
      const key = `${mObj.year}-${mObj.month}`;
      const weeks = {};
      const weeksList = [];
      const mStart = new Date(cursorStart);

      for (let w = 1; w <= 4; w++) {
        const wStart = new Date(cursorStart);
        wStart.setHours(0, 0, 0, 0);

        const wEnd = new Date(cursorStart);
        wEnd.setDate(wStart.getDate() + 6);
        wEnd.setHours(23, 59, 59, 999);

        const sDay = String(wStart.getDate()).padStart(2, '0');
        const sMonth = String(wStart.getMonth() + 1).padStart(2, '0');
        const sYear = wStart.getFullYear();
        const eDay = String(wEnd.getDate()).padStart(2, '0');
        const eMonth = String(wEnd.getMonth() + 1).padStart(2, '0');
        const eYear = wEnd.getFullYear();

        const weekInfo = {
          week: w,
          start: wStart,
          end: wEnd,
          startDateStr: `${sDay}/${sMonth}/${sYear}`,
          endDateStr: `${eDay}/${eMonth}/${eYear}`,
          shortLabel: `${sDay}/${sMonth} – ${eDay}/${eMonth}`,
          rangeText: `Từ ngày ${sDay}/${sMonth}/${sYear} đến ngày ${eDay}/${eMonth}/${eYear}`,
        };

        weeks[w] = weekInfo;
        weeksList.push(weekInfo);
        cursorStart.setDate(cursorStart.getDate() + 7);
      }

      const mEnd = new Date(weeks[4].end);
      academicMonthsMap[key] = {
        month: mObj.month,
        year: mObj.year,
        label: mObj.label,
        start: mStart,
        end: mEnd,
        weeks,
        weeksList,
      };
    });

    const activeAcademicMonth = academicMonthsMap[`${numYear}-${numMonth}`] || academicMonthsMap['2026-9'];
    const monthStart = activeAcademicMonth.start;
    const monthEnd = activeAcademicMonth.end;
    const isEnded = monthEnd < now;
    const totalWeeks = 4;
    const weekRanges = activeAcademicMonth.weeks;

    const students = await this.getEnrolledStudents(targetClass.class_id, monthEnd);
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

    const attendances = await prisma.attendance.findMany({
      where: {
        student_id: { in: studentDbIds },
        date: { gte: monthStart, lte: monthEnd },
        deleted_at: null,
      },
      select: { student_id: true, date: true, status: true },
    });

    const dailyAssessments = await prisma.dailyAssessment.findMany({
      where: {
        student_id: { in: studentDbIds },
        assessment_date: { gte: monthStart, lte: monthEnd },
      },
      include: {
        activity: {
          include: {
            content: {
              select: { goal_id: true },
            },
          },
        },
      },
    });

    // Helper: phân loại ngày học vào tuần 1..4 của tháng học kỳ
    const getWeekOfMonth = (date) => {
      if (!date) return 0;
      const d = new Date(date);
      for (let w = 1; w <= 4; w++) {
        if (d >= weekRanges[w].start && d <= weekRanges[w].end) {
          return w;
        }
      }
      return 0;
    };

    // Query planned activities in this month for this class to get real distinct goals per week
    const plannedActivities = await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
        scheduled_date: { gte: monthStart, lte: monthEnd },
      },
      include: {
        activity: {
          include: {
            content: {
              select: { goal_id: true },
            },
          },
        },
      },
    });

    const weekDistinctGoals = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
    plannedActivities.forEach((pa) => {
      const w = getWeekOfMonth(pa.scheduled_date);
      const gid = pa.activity?.content?.goal_id;
      if (w >= 1 && w <= 4 && gid) {
        weekDistinctGoals[w].add(gid.toString());
      }
    });
    dailyAssessments.forEach((da) => {
      const w = getWeekOfMonth(da.assessment_date);
      const gid = da.goal_id ? da.goal_id.toString() : da.activity?.content?.goal_id?.toString();
      if (w >= 1 && w <= 4 && gid) {
        weekDistinctGoals[w].add(gid);
      }
    });

    // Fetch real health assessments from PostgreSQL for all enrolled students
    const healthAssessments = await prisma.healthAssessment.findMany({
      where: {
        student_id: { in: studentDbIds },
        deleted_at: null,
      },
      orderBy: { assessment_date: 'asc' },
    });

    // Fetch curriculum sub-themes for this class's school year and age group
    let subThemes = [];
    try {
      subThemes = await prisma.subTheme.findMany({
        where: {
          theme: {
            school_year_id: targetClass.school_year_id || undefined,
            age_group: targetClass.age_group || undefined,
          },
        },
        include: { theme: true },
        orderBy: { start_date: 'asc' },
      });
      if (subThemes.length === 0) {
        subThemes = await prisma.subTheme.findMany({
          include: { theme: true },
          orderBy: { start_date: 'asc' },
        });
      }
    } catch (err) {
      console.warn('Could not query subThemes for assessment:', err?.message);
    }

    const resolveHealthAssessmentStatus = (h) => {
      if (!h) return { status: 'Chưa đánh giá', dateStr: '', heightStatus: 'Chưa đánh giá', weightStatus: 'Chưa đánh giá', height: null, weight: null };
      const d = new Date(h.assessment_date);
      const pad = (n) => String(n).padStart(2, '0');
      const dStr = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
      const evalResult = getClassificationFromZScores({
        heightZ: h.height_for_age_zscore,
        weightZ: h.weight_for_age_zscore,
        bmiZ: h.bmi_for_age_zscore,
        bmiVal: h.bmi,
      });

      let heightStatus = 'Đạt chuẩn';
      const hz = h.height_for_age_zscore != null ? Number(h.height_for_age_zscore) : null;
      if (hz != null && !isNaN(hz)) {
        if (hz < -3) heightStatus = 'Thấp còi độ 2 (nặng)';
        else if (hz < -2) heightStatus = 'Thấp còi độ 1';
        else if (hz > 2) heightStatus = 'Cao hơn tuổi';
      }

      let weightStatus = 'Đạt chuẩn';
      const bz = h.bmi_for_age_zscore != null ? Number(h.bmi_for_age_zscore) : null;
      const wz = h.weight_for_age_zscore != null ? Number(h.weight_for_age_zscore) : null;
      if (bz != null && !isNaN(bz)) {
        if (bz > 3) weightStatus = 'Béo phì';
        else if (bz > 2) weightStatus = 'Thừa cân';
        else if (bz > 1.5 && (wz == null || wz > 1.5)) weightStatus = 'Nguy cơ thừa cân';
        else if (bz < -3) weightStatus = 'Gầy còm nặng';
        else if (bz < -2) weightStatus = 'Gầy còm';
      }
      if (weightStatus === 'Đạt chuẩn' && wz != null && !isNaN(wz)) {
        if (wz < -3) weightStatus = 'Suy dinh dưỡng nặng';
        else if (wz < -2) weightStatus = 'Suy dinh dưỡng nhẹ cân';
        else if (wz > 2) weightStatus = 'Cân nặng cao hơn tuổi';
      }

      return {
        status: evalResult.label,
        heightStatus,
        weightStatus,
        height: h.height ? Number(h.height) : null,
        weight: h.weight ? Number(h.weight) : null,
        dateStr: dStr,
      };
    };

    const hasRealActivityData = attendances.length > 0 || dailyAssessments.length > 0;

    const buildWeeklyStat = (present, totalAtt = 5, achieved = 0, totalGoals = 0, healthInfo = {}) => {
      const tA = Number(totalAtt || 5);
      const p = Math.min(Number(present ?? 0), tA);
      const tG = Number(totalGoals || 0);
      const a = Math.min(Number(achieved ?? 0), tG > 0 ? tG : Number(achieved ?? 0));
      return {
        attendancePresent: p,
        attendanceTotal: tA,
        attendanceRate: Math.min(100, Math.round((p / tA) * 100)),
        goalsAchieved: a,
        goalsTotal: tG,
        goalsRate: tG > 0 ? Math.min(100, Math.round((a / tG) * 100)) : 0,
        hasPlanThisWeek: tG > 0,
        healthStatus: healthInfo.healthStatus || 'Bình thường',
        heightStatus: healthInfo.heightStatus || 'Đạt chuẩn',
        weightStatus: healthInfo.weightStatus || 'Đạt chuẩn',
        height: healthInfo.height ?? null,
        weight: healthInfo.weight ?? null,
        heightZ: healthInfo.heightZ ?? null,
        weightZ: healthInfo.weightZ ?? null,
        bmiZ: healthInfo.bmiZ ?? null,
        healthSourceLabel: healthInfo.healthSourceLabel || '',
        healthExamDate: healthInfo.healthExamDate || null,
        examDateVN: healthInfo.examDateVN || null,
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
          return { healthStatus: 'Bình thường', heightStatus: 'Đạt chuẩn', weightStatus: 'Đạt chuẩn', healthSourceLabel: '' };
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
            heightStatus: res.heightStatus,
            weightStatus: res.weightStatus,
            height: res.height,
            weight: res.weight,
            heightZ: latest.height_for_age_zscore ? Number(latest.height_for_age_zscore) : null,
            weightZ: latest.weight_for_age_zscore ? Number(latest.weight_for_age_zscore) : null,
            bmiZ: latest.bmi_for_age_zscore ? Number(latest.bmi_for_age_zscore) : null,
            healthExamDate: latest.assessment_date ? new Date(latest.assessment_date).toISOString().slice(0, 10) : null,
            examDateVN: res.dateStr,
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
            heightStatus: res.heightStatus,
            weightStatus: res.weightStatus,
            height: res.height,
            weight: res.weight,
            heightZ: latestPrev.height_for_age_zscore ? Number(latestPrev.height_for_age_zscore) : null,
            weightZ: latestPrev.weight_for_age_zscore ? Number(latestPrev.weight_for_age_zscore) : null,
            bmiZ: latestPrev.bmi_for_age_zscore ? Number(latestPrev.bmi_for_age_zscore) : null,
            healthExamDate: latestPrev.assessment_date ? new Date(latestPrev.assessment_date).toISOString().slice(0, 10) : null,
            examDateVN: res.dateStr,
            hasHealthCheckThisWeek: false,
            healthSourceLabel: `Tuần ${w} không đo - Kế thừa lần đo gần nhất ngày ${res.dateStr}`,
          };
        }

        return {
          healthStatus: 'Chưa đánh giá',
          heightStatus: 'Chưa đánh giá',
          weightStatus: 'Chưa đánh giá',
          height: null,
          weight: null,
          heightZ: null,
          weightZ: null,
          bmiZ: null,
          healthExamDate: null,
          examDateVN: null,
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

      const weekAchievedGoalSets = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
      sAss.forEach((a) => {
        if (a.status === 'ACHIEVED' || a.status === 'OUTSTANDING') {
          const w = getWeekOfMonth(a.assessment_date);
          const gid = a.goal_id ? a.goal_id.toString() : a.activity?.content?.goal_id?.toString();
          if (w >= 1 && w <= 4 && gid) {
            weekAchievedGoalSets[w].add(gid);
          }
        }
      });

      const getWeekGoalsAchieved = (w) => weekAchievedGoalSets[w]?.size || 0;
      const getWeekGoalsTotal = (w) => {
        const planned = weekDistinctGoals[w]?.size || 0;
        if (planned > 0) return planned;
        return weekAchievedGoalSets[w]?.size || 0;
      };

      const w1Health = resolveWeekHealth(1);
      const w2Health = resolveWeekHealth(2);
      const w3Health = resolveWeekHealth(3);
      const w4Health = resolveWeekHealth(4);

      const isEnrolledInWeek = (w) => {
        const wR = weekRanges[w];
        if (!wR) return false;
        if (s.enrolledAt) {
          const enrD = new Date(s.enrolledAt);
          if (enrD > wR.end) return false;
        }
        if (s.leftAt) {
          const leftD = new Date(s.leftAt);
          if (leftD < wR.start) return false;
        }
        return true;
      };

      const getWeekStat = (w, healthObj, fallbackPresent = 0, fallbackAchieved = 0) => {
        if (!isEnrolledInWeek(w)) {
          return buildWeeklyStat(0, 0, 0, 0, {
            healthStatus: 'Chưa vào lớp',
            heightStatus: 'Chưa vào lớp',
            weightStatus: 'Chưa vào lớp',
            healthSourceLabel: 'Chưa vào lớp',
          });
        }
        return buildWeeklyStat(
          weekAttCounts[w] || fallbackPresent,
          5,
          getWeekGoalsAchieved(w) || fallbackAchieved,
          getWeekGoalsTotal(w) || (fallbackAchieved ? 4 : 0),
          healthObj
        );
      };

      if (existing) {
        const w1R = isEnrolledInWeek(1) && Boolean(existing.week_1_rose);
        const w2R = isEnrolledInWeek(2) && Boolean(existing.week_2_rose);
        const w3R = isEnrolledInWeek(3) && Boolean(existing.week_3_rose);
        const w4R = isEnrolledInWeek(4) && Boolean(existing.week_4_rose);
        const count = (w1R ? 1 : 0) + (w2R ? 1 : 0) + (w3R ? 1 : 0) + (w4R ? 1 : 0);

        return {
          id: s.id,
          code: s.code,
          name: s.name,
          gender: s.gender,
          enrolledAt: s.enrolledAt,
          leftAt: s.leftAt,
          week1Rose: w1R,
          week2Rose: w2R,
          week3Rose: w3R,
          week4Rose: w4R,
          week5Rose: false,
          rosesCount: count,
          isLotus: count >= 4,
          teacherNotes: existing.teacher_notes || '',
          isPublished: Boolean(existing.is_published),
          parentFeedback: existing.parent_feedback || null,
          feedbackAt: existing.feedback_at ? existing.feedback_at.toISOString() : null,
          feedbackBy: existing.feedback_by ? 'Phụ huynh' : null,
          weeklyStats: {
            week1: getWeekStat(1, w1Health, existing.week_1_rose ? 5 : 4, existing.week_1_rose ? 4 : 3),
            week2: getWeekStat(2, w2Health, existing.week_2_rose ? 5 : 4, existing.week_2_rose ? 4 : 3),
            week3: getWeekStat(3, w3Health, existing.week_3_rose ? 5 : 4, existing.week_3_rose ? 4 : 3),
            week4: getWeekStat(4, w4Health, existing.week_4_rose ? 5 : 4, existing.week_4_rose ? 4 : 3),
          },
        };
      }

      if (!isEnded) {
        // Month has NOT ended yet (e.g. Month 11 or future): not yet evaluated
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          gender: s.gender,
          enrolledAt: s.enrolledAt,
          leftAt: s.leftAt,
          week1Rose: false,
          week2Rose: false,
          week3Rose: false,
          week4Rose: false,
          rosesCount: 0,
          isLotus: false,
          teacherNotes: '',
          parentFeedback: null,
          feedbackAt: null,
          feedbackBy: null,
          weeklyStats: {
            week1: getWeekStat(1, w1Health),
            week2: getWeekStat(2, w2Health),
            week3: getWeekStat(3, w3Health),
            week4: getWeekStat(4, w4Health),
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
          enrolledAt: s.enrolledAt,
          leftAt: s.leftAt,
          week1Rose: false,
          week2Rose: false,
          week3Rose: false,
          week4Rose: false,
          rosesCount: 0,
          isLotus: false,
          teacherNotes: '',
          parentFeedback: null,
          feedbackAt: null,
          feedbackBy: null,
          weeklyStats: {
            week1: getWeekStat(1, w1Health),
            week2: getWeekStat(2, w2Health),
            week3: getWeekStat(3, w3Health),
            week4: getWeekStat(4, w4Health),
          },
        };
      }

      const isWeekGoalPassed = (w) => {
        if (!isEnrolledInWeek(w)) return false;
        const tot = getWeekGoalsTotal(w);
        const ach = getWeekGoalsAchieved(w);
        if (tot === 0) return true;
        return ach >= Math.ceil(tot * 0.7);
      };
      const w1 = isEnrolledInWeek(1) && weekAttCounts[1] >= 4 && isWeekGoalPassed(1);
      const w2 = isEnrolledInWeek(2) && weekAttCounts[2] >= 4 && isWeekGoalPassed(2);
      const w3 = isEnrolledInWeek(3) && weekAttCounts[3] >= 4 && isWeekGoalPassed(3);
      const w4 = isEnrolledInWeek(4) && weekAttCounts[4] >= 4 && isWeekGoalPassed(4);
      const count = (w1 ? 1 : 0) + (w2 ? 1 : 0) + (w3 ? 1 : 0) + (w4 ? 1 : 0);

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        gender: s.gender,
        enrolledAt: s.enrolledAt,
        leftAt: s.leftAt,
        week1Rose: w1,
        week2Rose: w2,
        week3Rose: w3,
        week4Rose: w4,
        rosesCount: count,
        isLotus: count >= 4,
        teacherNotes: '',
        parentFeedback: null,
        feedbackAt: null,
        feedbackBy: null,
        weeklyStats: {
          week1: getWeekStat(1, w1Health),
          week2: getWeekStat(2, w2Health),
          week3: getWeekStat(3, w3Health),
          week4: getWeekStat(4, w4Health),
        },
      };
    });

    const lotusCount = studentList.filter((s) => s.isLotus).length;
    const completedCount = studentList.filter((s) => s.teacherNotes?.trim().length > 0).length;
    const parentFeedbackCount = studentList.filter((s) => Boolean(s.parentFeedback)).length;

    const weekRangesFormatted = activeAcademicMonth.weeksList.map((r) => {
      // 1. Check if planned activities in this week have an assigned sub-theme
      const plannedInWeek = plannedActivities.find((pa) => {
        if (!pa.scheduled_date || !pa.sub_theme) return false;
        const d = new Date(pa.scheduled_date);
        return d >= r.start && d <= r.end;
      });

      // 2. Check overlap by midpoint of the week to avoid boundary-day collisions
      const rMid = new Date((r.start.getTime() + r.end.getTime()) / 2);
      let matchedSubTheme = plannedInWeek?.sub_theme || subThemes.find((st) => {
        const stStart = new Date(st.start_date);
        const stEnd = new Date(st.end_date);
        stEnd.setHours(23, 59, 59, 999);
        return stStart <= rMid && stEnd >= rMid;
      });

      if (!matchedSubTheme) {
        matchedSubTheme = subThemes.find((st) => {
          const stStart = new Date(st.start_date);
          const stEnd = new Date(st.end_date);
          stEnd.setHours(23, 59, 59, 999);
          return stStart < r.end && stEnd > r.start;
        });
      }

      return {
        week: r.week,
        startDateStr: r.startDateStr,
        endDateStr: r.endDateStr,
        shortLabel: r.shortLabel,
        rangeText: r.rangeText,
        themeName: matchedSubTheme?.theme?.name || null,
        subThemeName: matchedSubTheme?.name || null,
      };
    });

    const isClassPublished = dbAssessments.length > 0 && dbAssessments.some((d) => d.is_published);

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        academicYear: targetClass.school_year?.name || 'Năm học 2026–2027',
        month: numMonth,
        year: numYear,
        monthLabel: `Tháng ${numMonth}/${numYear}`,
        isEnded,
        isPublished: isClassPublished,
        totalWeeks,
        latestEvaluatedMonth: latestRecord ? { month: latestRecord.month, year: latestRecord.year } : null,
        weekRanges: weekRangesFormatted,
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
    const evalAccountId = await this.resolveEvaluatorAccountId(evaluatedBy, classId);

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
          (rec.week4Rose ? 1 : 0);

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
            evaluated_by: evalAccountId,
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
            evaluated_by: evalAccountId,
          },
        });
        savedCount++;
      }

      // Notification 17: Add Teacher Monthly Comment / công bố sổ tháng (Nhận xét tháng của trẻ đã sẵn sàng cho PH -> PH của trẻ)
      (async () => {
        try {
          for (const rec of records) {
            const rawId = String(rec.studentId || rec.id).trim();
            const sId = studentIdMap.get(rawId) || (/^\d+$/.test(rawId) ? BigInt(rawId) : null);
            if (!sId) continue;
            const targetStudent = matchedStudents.find((s) => s.student_id === sId);
            if (targetStudent?.account_id && (rec.teacherNotes || rec.week1Rose !== undefined)) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: [targetStudent.account_id],
                creatorAccountId: evalAccountId,
                type: 'MONTHLY_ROSE_REPORT',
                title: `Sổ bé ngoan tháng ${numMonth}/${numYear}`,
                body: `Nhận xét và kết quả rèn luyện tháng ${numMonth}/${numYear} của bé ${targetStudent.full_name} đã sẵn sàng trên ứng dụng.`,
                data: {
                  type: 'MONTHLY_COMMENT_PUBLISHED',
                  studentId: sId.toString(),
                  month: numMonth,
                  year: numYear,
                },
              });
            }
          }
        } catch (e) {
          console.warn('Failed to emit notification for monthly assessment saving:', e.message);
        }
      })();
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

    // Query planned activities in semester to collect all distinct planned goals per domain
    const semesterSubThemeActivities = await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
        scheduled_date: {
          gte: semStart,
          lte: effectiveEnd,
        },
      },
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
    });

    const semesterClassGoals = new Map();
    const domainTargetGoals = {
      PHYSICAL: new Set(),
      COGNITIVE: new Set(),
      LANGUAGE: new Set(),
      SOCIO_EMOTIONAL: new Set(),
      AESTHETIC: new Set(),
    };

    semesterSubThemeActivities.forEach((sa) => {
      const goal = sa.activity?.content?.goal;
      if (goal) {
        const gid = goal.goal_id ? goal.goal_id.toString() : null;
        const dom = goal.domain || 'PHYSICAL';
        if (gid && domainTargetGoals[dom]) {
          domainTargetGoals[dom].add(gid);
          semesterClassGoals.set(gid, {
            goalId: gid,
            domain: dom,
            title: goal.title || goal.goal_code,
          });
        }
      }
    });

    dailyAssessmentRecords.forEach((da) => {
      const goal = da.goal || da.activity?.content?.goal;
      if (goal) {
        const gid = goal.goal_id ? goal.goal_id.toString() : da.goal_id?.toString();
        const dom = goal.domain || 'PHYSICAL';
        if (gid && domainTargetGoals[dom]) {
          domainTargetGoals[dom].add(gid);
          semesterClassGoals.set(gid, {
            goalId: gid,
            domain: dom,
            title: goal.title || goal.goal_code,
          });
        }
      }
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
            heightStatus: '--',
            weightStatus: '--',
            height: null,
            weight: null,
            examLabel: '--',
            examDate: '--',
          },
          teacherNotes: existing?.teacher_notes || '',
          isEvaluated: Boolean(existing?.teacher_notes?.trim()),
          updatedAt: existing?.updated_at ? existing.updated_at.toISOString() : null,
        };
      }

      // Real health assessment resolution from PostgreSQL using WHO Z-Scores
      const healthRec = healthMap.get(s._student_id.toString());
      let healthStatus = 'Bình thường';
      let heightStatus = 'Đạt chuẩn';
      let weightStatus = 'Đạt chuẩn';
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
        const evalResult = getClassificationFromZScores({
          heightZ: healthRec.height_for_age_zscore,
          weightZ: healthRec.weight_for_age_zscore,
          bmiZ: healthRec.bmi_for_age_zscore,
          bmiVal: healthRec.bmi,
        });
        healthStatus = evalResult.label;

        const hz = healthRec.height_for_age_zscore != null ? Number(healthRec.height_for_age_zscore) : null;
        if (hz != null && !isNaN(hz)) {
          if (hz < -3) heightStatus = 'Thấp còi độ 2 (nặng)';
          else if (hz < -2) heightStatus = 'Thấp còi độ 1';
          else if (hz > 2) heightStatus = 'Cao hơn tuổi';
        }

        const bz = healthRec.bmi_for_age_zscore != null ? Number(healthRec.bmi_for_age_zscore) : null;
        const wz = healthRec.weight_for_age_zscore != null ? Number(healthRec.weight_for_age_zscore) : null;
        if (bz != null && !isNaN(bz)) {
          if (bz > 3) weightStatus = 'Béo phì';
          else if (bz > 2) weightStatus = 'Thừa cân';
          else if (bz > 1.5 && (wz == null || wz > 1.5)) weightStatus = 'Nguy cơ thừa cân';
          else if (bz < -3) weightStatus = 'Gầy còm nặng';
          else if (bz < -2) weightStatus = 'Gầy còm';
        }
        if (weightStatus === 'Đạt chuẩn' && wz != null && !isNaN(wz)) {
          if (wz < -3) weightStatus = 'Suy dinh dưỡng nặng';
          else if (wz < -2) weightStatus = 'Suy dinh dưỡng nhẹ cân';
          else if (wz > 2) weightStatus = 'Cân nặng cao hơn tuổi';
        }
      } else {
        healthStatus = 'Chưa đánh giá';
        heightStatus = 'Chưa đánh giá';
        weightStatus = 'Chưa đánh giá';
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

      // 5 Developmental domains calculations based on DISTINCT Educational Goals
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
        // Group evaluated DAs by DISTINCT goal
        const studentGoalMap = new Map();
        evaluatedDAs.forEach((da) => {
          const goal = da.goal || da.activity?.content?.goal;
          if (!goal) return;
          const gid = goal.goal_id ? goal.goal_id.toString() : da.goal_id?.toString();
          if (!gid) return;
          const dom = goal.domain || 'PHYSICAL';
          const isAchieved = da.status === 'ACHIEVED' || da.status === 'OUTSTANDING';

          if (!studentGoalMap.has(gid)) {
            studentGoalMap.set(gid, { domain: dom, achieved: isAchieved });
          } else if (isAchieved) {
            studentGoalMap.get(gid).achieved = true;
          }
        });

        const domainCounts = {
          PHYSICAL: { passed: 0, evaluated: 0, total: domainTargetGoals.PHYSICAL.size },
          COGNITIVE: { passed: 0, evaluated: 0, total: domainTargetGoals.COGNITIVE.size },
          LANGUAGE: { passed: 0, evaluated: 0, total: domainTargetGoals.LANGUAGE.size },
          SOCIO_EMOTIONAL: { passed: 0, evaluated: 0, total: domainTargetGoals.SOCIO_EMOTIONAL.size },
          AESTHETIC: { passed: 0, evaluated: 0, total: domainTargetGoals.AESTHETIC.size },
        };

        studentGoalMap.forEach(({ domain, achieved }) => {
          if (domainCounts[domain]) {
            domainCounts[domain].evaluated++;
            if (achieved) {
              domainCounts[domain].passed++;
            }
          }
        });

        const calcDomain = (domKey) => {
          const dc = domainCounts[domKey];
          if (!dc) return null;
          const targetTotal = dc.total > 0 ? dc.total : dc.evaluated;
          if (targetTotal === 0 && dc.evaluated === 0) return null;
          const effectiveTotal = targetTotal > 0 ? targetTotal : dc.evaluated;
          const rate = Math.round((dc.passed / effectiveTotal) * 100);
          return { rate, achieved: dc.passed, total: effectiveTotal, targetTotal: effectiveTotal };
        };

        const phys = calcDomain('PHYSICAL');
        const cogn = calcDomain('COGNITIVE');
        const lang = calcDomain('LANGUAGE');
        const soci = calcDomain('SOCIO_EMOTIONAL');
        const aest = calcDomain('AESTHETIC');

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
          heightStatus,
          weightStatus,
          height: healthRec?.height ? Number(healthRec.height) : null,
          weight: healthRec?.weight ? Number(healthRec.weight) : null,
          heightZ: healthRec?.height_for_age_zscore ? Number(healthRec.height_for_age_zscore) : null,
          weightZ: healthRec?.weight_for_age_zscore ? Number(healthRec.weight_for_age_zscore) : null,
          bmiZ: healthRec?.bmi_for_age_zscore ? Number(healthRec.bmi_for_age_zscore) : null,
          examLabel,
          examDate: examDateFormatted,
        },
        teacherNotes: hasSavedNote ? savedNote : '',
        isEvaluated: hasSavedNote,
        isPublished: Boolean(existing?.is_published),
        updatedAt: existing?.updated_at ? existing.updated_at.toISOString() : null,
      };
    });

    const completedCount = studentList.filter((s) => s.isEvaluated).length;
    const pendingCount = studentList.length - completedCount;
    const isClassPublished = dbAssessments.length > 0 && dbAssessments.some((d) => d.is_published);

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
        isPublished: isClassPublished,
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
    const evalAccountId = await this.resolveEvaluatorAccountId(evaluatedBy, classId);

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
            evaluated_by: evalAccountId,
            updated_at: new Date(),
          },
          create: {
            student_id: sId,
            class_id: cId,
            semester: sem,
            teacher_notes: rec.teacherNotes || '',
            evaluated_by: evalAccountId,
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

  /**
   * Publish / Unpublish Monthly Assessments for the whole class
   */
  async publishMonthlyAssessments({ classId, month, year, isPublished = true, publishedBy = 40 }) {
    const targetClass = await this.resolveClass(classId);
    const cId = targetClass.class_id;
    const numMonth = Number(month) || 10;
    const numYear = Number(year) || 2026;
    const evalAccountId = await this.resolveEvaluatorAccountId(publishedBy, classId);

    const result = await prisma.monthlyAssessment.updateMany({
      where: {
        class_id: cId,
        month: numMonth,
        year: numYear,
      },
      data: {
        is_published: Boolean(isPublished),
        published_at: isPublished ? new Date() : null,
        updated_at: new Date(),
      },
    });

    if (isPublished) {
      (async () => {
        try {
          const assessments = await prisma.monthlyAssessment.findMany({
            where: { class_id: cId, month: numMonth, year: numYear, is_published: true },
            include: { student: true },
          });

          for (const item of assessments) {
            if (item.student?.account_id) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: [item.student.account_id],
                creatorAccountId: evalAccountId,
                type: 'MONTHLY_ROSE_REPORT',
                title: `Sổ bé ngoan tháng ${numMonth}/${numYear}`,
                body: `Sổ bé ngoan và nhận xét tháng ${numMonth}/${numYear} của bé ${item.student.full_name} đã được công bố chính thức.`,
                data: {
                  type: 'MONTHLY_COMMENT_PUBLISHED',
                  studentId: item.student_id.toString(),
                  month: numMonth,
                  year: numYear,
                },
              });
            }
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit publish notifications for monthly assessment');
        }
      })();
    }

    return {
      success: true,
      isPublished: Boolean(isPublished),
      message: isPublished
        ? `Đã công bố Sổ Bé Ngoan tháng ${numMonth}/${numYear} cho cả lớp!`
        : `Đã gỡ công bố Sổ Bé Ngoan tháng ${numMonth}/${numYear}.`,
      updatedCount: result.count,
    };
  }

  /**
   * Publish / Unpublish Semester Assessments for the whole class
   */
  async publishSemesterAssessments({ classId, semester = 'SEMESTER_1', isPublished = true, publishedBy = 40 }) {
    const targetClass = await this.resolveClass(classId);
    const cId = targetClass.class_id;
    const sem = semester === 'SEMESTER_2' ? 'SEMESTER_2' : 'SEMESTER_1';
    const semLabel = sem === 'SEMESTER_2' ? 'Học kỳ 2' : 'Học kỳ 1';
    const evalAccountId = await this.resolveEvaluatorAccountId(publishedBy, classId);

    const result = await prisma.semesterAssessment.updateMany({
      where: {
        class_id: cId,
        semester: sem,
      },
      data: {
        is_published: Boolean(isPublished),
        published_at: isPublished ? new Date() : null,
        updated_at: new Date(),
      },
    });

    if (isPublished) {
      (async () => {
        try {
          const assessments = await prisma.semesterAssessment.findMany({
            where: { class_id: cId, semester: sem, is_published: true },
            include: { student: true },
          });

          for (const item of assessments) {
            if (item.student?.account_id) {
              await notificationService.emitSystemNotification({
                recipientAccountIds: [item.student.account_id],
                creatorAccountId: evalAccountId,
                type: 'SEMESTER_REPORT_PUBLISHED',
                title: `Kết quả đánh giá ${semLabel}`,
                body: `Kết quả đánh giá tổng kết ${semLabel} của bé ${item.student.full_name} đã được công bố chính thức.`,
                data: {
                  type: 'SEMESTER_REPORT_PUBLISHED',
                  studentId: item.student_id.toString(),
                  semester: sem,
                },
              });
            }
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit publish notifications for semester assessment');
        }
      })();
    }

    return {
      success: true,
      isPublished: Boolean(isPublished),
      message: isPublished
        ? `Đã công bố kết quả đánh giá ${semLabel} cho cả lớp!`
        : `Đã gỡ công bố kết quả đánh giá ${semLabel}.`,
      updatedCount: result.count,
    };
  }
}

export const assessmentService = new AssessmentService();
export default assessmentService;
