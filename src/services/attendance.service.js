import prisma from '../config/prisma.js';
import { BadRequest, NotFound } from '../utils/http-error.js';
import { validatePickupQuota, getStudentPickupQuotaInfo } from '../utils/pickup-quota.helper.js';
import { notificationService } from './notification.service.js';
import { TIMETABLE_DAYS, TIMETABLE_SLOTS } from './mock-data.js';
import {
  createStandardWorkbook,
  addSchoolHeaderBanner,
  applyHeaderStyles,
  applyZebraRows,
  autoFitColumns,
  formatDateDMY,
} from '../utils/excel.helper.js';

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

class AttendanceService {
  /**
   * Helper to resolve target class
   */
  async _resolveClass(classId) {
    if (!classId) return null;
    const str = String(classId).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) {
      return prisma.class.findFirst({
        where: { public_id: str, deleted_at: null },
        include: { school_year: true },
      });
    }
    if (/^\d+$/.test(str)) {
      return prisma.class.findFirst({
        where: { class_id: BigInt(str), deleted_at: null },
        include: { school_year: true },
      });
    }
    return prisma.class.findFirst({
      where: { name: str, deleted_at: null },
      include: { school_year: true },
    });
  }

  /**
   * Helper to resolve student
   */
  async _resolveStudent(studentId) {
    if (!studentId) return null;
    const str = String(studentId).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) {
      return prisma.student.findFirst({
        where: { public_id: str, deleted_at: null },
      });
    }
    if (/^[A-Za-z0-9_-]+$/.test(str) && !/^\d+$/.test(str)) {
      return prisma.student.findFirst({
        where: { student_code: str, deleted_at: null },
      });
    }
    return null;
  }

  /**
   * Get attendance & teacher weekly timetable overview querying live PostgreSQL
   */
  async getTimetableOverview({ classId, week = '12/10 - 18/10/2026', date, startDate, endDate, weekId }) {
    // 1. Resolve class from database
    let targetClass = null;
    if (classId) {
      targetClass = await this._resolveClass(classId);
      if (!targetClass) {
        throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
      }
    } else {
      targetClass = await prisma.class.findFirst({
        where: { deleted_at: null },
        include: { school_year: true },
        orderBy: { class_id: 'asc' },
      });
      if (!targetClass) {
        throw new NotFound('Không tìm thấy lớp học nào');
      }
    }

    // 2. Resolve target date (e.g. today or requested date)
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);
    const targetDateStart = new Date(`${targetDateStr}T00:00:00.000Z`);
    const targetDateEnd = new Date(`${targetDateStr}T23:59:59.999Z`);

    // 2.1 Fetch enrolled students active on targetDate (only active ENROLLED students)
    const rawEnrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClass.class_id,
        student: { deleted_at: null },
        status: 'ENROLLED',
        left_at: null,
      },
      include: {
        student: true,
      },
      orderBy: { student: { student_code: 'asc' } },
    });

    // Query students who already have attendance records in this class on this date
    const existingAtts = await prisma.attendance.findMany({
      where: {
        class_id: targetClass.class_id,
        date: { gte: targetDateStart, lte: targetDateEnd },
        deleted_at: null,
      },
      select: { student_id: true },
    });
    const existingAttSet = new Set(existingAtts.map((a) => a.student_id.toString()));

    const enrollments = [];
    for (const enr of rawEnrollments) {
      const sId = enr.student_id.toString();
      if (existingAttSet.has(sId)) {
        enrollments.push(enr);
        continue;
      }
      if (enr.enrolled_at) {
        if (new Date(enr.enrolled_at) <= targetDateEnd) {
          enrollments.push(enr);
        }
        continue;
      }
      const inOtherClass = await prisma.studentEnrollment.findFirst({
        where: {
          student_id: enr.student_id,
          class_id: { not: targetClass.class_id },
          enrolled_at: { lte: targetDateEnd },
          OR: [
            { left_at: null },
            { left_at: { gt: targetDateStart } },
          ],
        },
      });
      if (!inOtherClass) {
        enrollments.push(enr);
      }
    }

    // 3. Query all dates in DB that actually have attendance records for this class
    const distinctAttendanceDates = await prisma.attendance.findMany({
      where: {
        class_id: targetClass.class_id,
        deleted_at: null,
      },
      select: { date: true },
      distinct: ['date'],
    });

    const attendedDateMap = {};
    if (enrollments.length > 0) {
      distinctAttendanceDates.forEach((r) => {
        attendedDateMap[r.date.toISOString().slice(0, 10)] = true;
      });
    }

    // 3.1 Query all dates in DB where all present students have been checked out ("đón trẻ full")
    const presentAttendanceRecords = await prisma.attendance.findMany({
      where: {
        class_id: targetClass.class_id,
        status: 'PRESENT',
        deleted_at: null,
      },
      select: {
        date: true,
        check_out_time: true,
      },
    });

    const dismissalDateMap = {};
    if (enrollments.length > 0 && presentAttendanceRecords.length > 0) {
      const dateStats = {};
      presentAttendanceRecords.forEach((r) => {
        const dStr = r.date.toISOString().slice(0, 10);
        if (!dateStats[dStr]) {
          dateStats[dStr] = { presentCount: 0, checkedOutCount: 0 };
        }
        dateStats[dStr].presentCount += 1;
        if (r.check_out_time !== null) {
          dateStats[dStr].checkedOutCount += 1;
        }
      });

      Object.entries(dateStats).forEach(([dStr, stat]) => {
        if (stat.presentCount > 0 && stat.checkedOutCount === stat.presentCount) {
          dismissalDateMap[dStr] = true;
        }
      });
    }

    // 4. Fetch real attendance records for this class & date
    const studentIds = enrollments.map((e) => e.student_id);
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        class_id: targetClass.class_id,
        student_id: { in: studentIds },
        date: targetDate,
        deleted_at: null,
      },
    });

    const attendanceMap = new Map();
    attendanceRecords.forEach((att) => {
      attendanceMap.set(att.student_id.toString(), att);
    });

    // 5.1 Fetch real health assessments for this class & date
    const healthRecords = await prisma.healthAssessment.findMany({
      where: {
        student_id: { in: studentIds },
        assessment_date: {
          gte: targetDateStart,
          lte: targetDateEnd,
        },
        deleted_at: null,
      },
    });
    const healthMap = new Map();
    healthRecords.forEach((h) => {
      healthMap.set(h.student_id.toString(), h);
    });

    // 5.2 Query distinct health dates for the class
    const distinctHealthDates = await prisma.healthAssessment.findMany({
      where: {
        student_id: { in: studentIds },
        deleted_at: null,
      },
      select: { assessment_date: true },
      distinct: ['assessment_date'],
    });
    const healthDateMap = {};
    distinctHealthDates.forEach((r) => {
      healthDateMap[r.assessment_date.toISOString().slice(0, 10)] = true;
    });

    const isDateRecorded = Boolean(attendanceRecords.length > 0 && enrollments.length > 0);
    const isHealthRecorded = Boolean(healthRecords.length > 0 && enrollments.length > 0);
    const presentStudentsCount = attendanceRecords.filter((att) => att.status === 'PRESENT').length;
    const dismissedPresentCount = attendanceRecords.filter(
      (att) => att.status === 'PRESENT' && att.check_out_time !== null
    ).length;
    const isDismissalRecorded = Boolean(
      presentStudentsCount > 0 && dismissedPresentCount === presentStudentsCount
    );

    // 6. Map students with live attendance & health records
    const targetDateMidnight = new Date(
      Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())
    );

    const students = enrollments.map((enr) => {
      // Check transfer & enrollment cutoffs against targetDate
      if (enr.left_at) {
        const leftAtMidnight = new Date(
          Date.UTC(enr.left_at.getUTCFullYear(), enr.left_at.getUTCMonth(), enr.left_at.getUTCDate())
        );
        // Từ ngày chuyển có hiệu lực: không hiển thị học sinh trong lớp cũ
        if (targetDateMidnight >= leftAtMidnight) {
          return null;
        }
      }

      if (enr.enrolled_at) {
        const enrolledAtMidnight = new Date(
          Date.UTC(enr.enrolled_at.getUTCFullYear(), enr.enrolled_at.getUTCMonth(), enr.enrolled_at.getUTCDate())
        );
        // Trước ngày nhập học: chưa vào lớp này
        if (targetDateMidnight < enrolledAtMidnight) {
          return null;
        }
      }

      const st = enr.student;
      const att = attendanceMap.get(st.student_id.toString());
      const h = healthMap.get(st.student_id.toString());

      const rawStatus = att ? att.status : (isDateRecorded ? 'PRESENT' : 'UNRECORDED');
      const status = rawStatus === 'PRESENT' ? 'PRESENT' : (rawStatus === 'UNRECORDED' ? 'PRESENT' : 'ABSENT');
      const reason = att?.notes || att?.absence_reason || (rawStatus === 'EXCUSED_ABSENCE' ? 'Nghỉ có phép' : '');

      return {
        id: st.public_id || st.student_id.toString(),
        code: st.student_code,
        name: st.full_name,
        gender: st.gender,
        status,
        rawStatus,
        isAbsent: rawStatus === 'EXCUSED_ABSENCE' || rawStatus === 'UNEXCUSED_ABSENCE' || rawStatus === 'ABSENT' || status === 'ABSENT',
        reason,
        note: reason,
        notes: reason,
        // Trước ngày chuyển có hiệu lực: giữ nguyên trạng thái học sinh bình thường, không gắn mác "Đã chuyển lớp"
        isTransferred: false,
        leftAt: enr.left_at,
        checkInTime: att?.check_in_time || null,
        checkOutTime: att?.check_out_time || null,
        pickupPerson: att?.pickup_person_name || '',
        height: h ? Number(h.height) : '',
        weight: h ? Number(h.weight) : '',
        bmi: h ? Number(h.bmi) : '',
        healthNote: h?.notes || '',
      };
    }).filter(Boolean);

    const presentCount = students.filter((s) => s.status === 'PRESENT').length;
    const absentCount = students.filter((s) => s.status === 'ABSENT').length;

    // 6. Fetch real scheduled activities for this class from database (sub_theme_activities)
    const slotWhere = {
      class_id: targetClass.class_id,
    };

    const effectiveStartDate = startDate || (weekId ? resolveAcademicWeekDates(weekId)?.startDate : null);
    const effectiveEndDate = endDate || (weekId ? resolveAcademicWeekDates(weekId)?.endDate : null);

    if (effectiveStartDate && effectiveEndDate) {
      const sDate = new Date(`${effectiveStartDate}T00:00:00.000Z`);
      const eDate = new Date(`${effectiveEndDate}T23:59:59.999Z`);
      slotWhere.scheduled_date = {
        gte: sDate,
        lte: eDate,
      };
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
        sub_theme: {
          include: {
            theme: true,
          },
        },
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

    const dbSlots = scheduledRecords.map((rec) => {
      const dayKey = dayKeyMap[rec.day_of_week] || 'T2';
      const times = slotTimes[rec.routine_slot] || { start: '08:30', end: '09:15' };
      const dateStr = rec.scheduled_date ? rec.scheduled_date.toISOString().slice(0, 10) : '';
      const dateFormatted = dateStr ? `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}` : '';
      const act = rec.activity;
      const content = act?.content;
      const goal = content?.goal;

      return {
        id: rec.id.toString(),
        activityId: rec.activity_id.toString(),
        subThemeId: rec.sub_theme_id ? rec.sub_theme_id.toString() : '',
        subThemeName: rec.sub_theme?.name || '',
        themeId: rec.sub_theme?.theme_id ? rec.sub_theme.theme_id.toString() : (rec.sub_theme?.theme?.public_id || ''),
        themeName: rec.sub_theme?.theme?.name || '',
        day: dayKey,
        dayKey,
        routineSlot: rec.routine_slot,
        orderIndex: rec.order_index,
        order_index: rec.order_index,
        startTime: times.start,
        endTime: times.end,
        title: act?.title || '',
        shortTitle: act?.title || '',
        date: dateFormatted,
        fullDate: dateStr,
        notes: rec.notes || '',
        status: rec.status,
        statusLabel: rec.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Đã xếp lịch',
        objective: act?.objective || '',
        planObjective: act?.objective || '',
        preparation: act?.preparation || '',
        procedure: act?.procedure || '',
        evaluation: act?.evaluation_criteria || '',
        evaluationCriteria: act?.evaluation_criteria || '',
        domain: goal?.domain || '',
        goalCode: goal?.goal_code || '',
        goalTitle: goal?.title || '',
        indicatorCode: goal?.indicator_code || '',
        contentTitle: content?.title || '',
        criteria: act ? {
          domain: goal?.domain || '',
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

    const slots = dbSlots;

    // 7. Resolve active Theme & SubTheme for the requested week
    let activeTheme = null;
    let activeSubTheme = null;

    try {
      // 7.1 Priority 1: Check if any scheduled activity in this week has sub_theme & theme
      const recordWithTheme = scheduledRecords.find((r) => r.sub_theme?.theme);
      if (recordWithTheme?.sub_theme) {
        const st = recordWithTheme.sub_theme;
        const th = st.theme;
        activeTheme = {
          id: th.public_id || th.theme_id?.toString(),
          name: th.name,
          startDate: th.start_date ? th.start_date.toISOString().slice(0, 10) : null,
          endDate: th.end_date ? th.end_date.toISOString().slice(0, 10) : null,
        };
        activeSubTheme = {
          id: st.public_id || st.sub_theme_id?.toString(),
          name: st.name,
          startDate: st.start_date ? st.start_date.toISOString().slice(0, 10) : null,
          endDate: st.end_date ? st.end_date.toISOString().slice(0, 10) : null,
        };
      }

      // 7.2 Priority 2: Query curriculum themes & subThemes for this class's age_group and school_year
      if (!activeTheme || !activeSubTheme) {
        const themes = await prisma.curriculumTheme.findMany({
          where: {
            school_year_id: targetClass.school_year_id,
            age_group: targetClass.age_group,
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

        if (themes.length > 0) {
          let foundTheme = null;
          let foundSubTheme = null;

          if (effectiveStartDate && effectiveEndDate) {
            for (const th of themes) {
              for (const st of th.sub_themes || []) {
                const stStart = st.start_date.toISOString().slice(0, 10);
                const stEnd = st.end_date.toISOString().slice(0, 10);
                if (stStart <= effectiveEndDate && stEnd >= effectiveStartDate) {
                  foundTheme = th;
                  foundSubTheme = st;
                  break;
                }
              }
              if (foundTheme) break;
            }
          }

          // If no matching theme found for this week, do NOT fallback to themes[0]
          // so that weeks without a theme correctly return null ("Chưa có chủ đề")

          if (!activeTheme && foundTheme) {
            activeTheme = {
              id: foundTheme.public_id || foundTheme.theme_id?.toString(),
              name: foundTheme.name,
              startDate: foundTheme.start_date ? foundTheme.start_date.toISOString().slice(0, 10) : null,
              endDate: foundTheme.end_date ? foundTheme.end_date.toISOString().slice(0, 10) : null,
            };
          }

          if (!activeSubTheme && foundSubTheme) {
            activeSubTheme = {
              id: foundSubTheme.public_id || foundSubTheme.sub_theme_id?.toString(),
              name: foundSubTheme.name,
              startDate: foundSubTheme.start_date ? foundSubTheme.start_date.toISOString().slice(0, 10) : null,
              endDate: foundSubTheme.end_date ? foundSubTheme.end_date.toISOString().slice(0, 10) : null,
            };
          }
        }
      }
    } catch (err) {
      console.warn('Failed to resolve theme and sub-theme for timetable overview:', err);
    }

    // 8. Query school year calendar holidays & events
    let holidays = [];
    try {
      const dbHolidays = await prisma.schoolHoliday.findMany({
        where: {
          school_year_id: targetClass.school_year_id,
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
          makeupDate: h.makeup_date ? h.makeup_date.toISOString().slice(0, 10) : null,
          isTeachingAllowed: h.is_teaching_allowed,
          type: itemType,
          targetGrades: h.target_grades || [],
        };
      });
    } catch (err) {
      console.warn('Failed to fetch holidays for timetable overview:', err);
    }

    // Check if Saturday is a make-up day in this week and mirror slots if empty
    const makeupHoliday = holidays.find((h) => {
      if (!h.makeupDate) return false;
      if (effectiveStartDate && effectiveEndDate) {
        return h.makeupDate >= effectiveStartDate && h.makeupDate <= effectiveEndDate;
      }
      return true;
    });

    if (makeupHoliday && !dbSlots.some((s) => s.day === 'T7')) {
      const origSlots = dbSlots.filter((s) => {
        if (s.fullDate && makeupHoliday.startDate && s.fullDate === makeupHoliday.startDate) return true;
        return false;
      });

      if (origSlots.length > 0) {
        const makeupDateStr = makeupHoliday.makeupDate;
        const [my, mm, md] = makeupDateStr.split('-');
        const origDateStr = makeupHoliday.startDate;
        const [oy, om, od] = origDateStr.split('-');

        const mirroredSlots = origSlots.map((s, idx) => ({
          ...s,
          id: `makeup-${s.id || idx}`,
          day: 'T7',
          dayKey: 'T7',
          date: `${md}/${mm}`,
          fullDate: makeupDateStr,
          notes: s.notes ? `[Dạy bù ngày ${od}/${om}] ${s.notes}` : `[Dạy bù ngày ${od}/${om}]`,
        }));
        dbSlots.push(...mirroredSlots);
      }
    }

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        academicYear: targetClass.school_year?.name || 'Năm học 2026–2027',
        studentCount: students.length,
        weekLabel: week || 'Tuần 12/10 – 16/10/2026',
        dateRange: '12/10/2026 – 16/10/2026',
        selectedDate: targetDateStr,
        themeName: activeTheme?.name || null,
        subThemeName: activeSubTheme?.name || null,
        ageGroup: targetClass.age_group,
      },
      theme: activeTheme,
      selectedTheme: activeTheme,
      subTheme: activeSubTheme,
      selectedSubTheme: activeSubTheme,
      stats: {
        totalStudents: students.length,
        presentCount,
        absentCount: Math.max(0, students.length - presentCount),
        dismissedCount: dismissedPresentCount,
        healthCount: healthRecords.length,
        isRecorded: isDateRecorded,
        isHealthRecorded,
        isDismissalRecorded,
      },
      attendanceDays: attendedDateMap,
      healthDays: healthDateMap,
      dismissalDays: dismissalDateMap,
      days: TIMETABLE_DAYS,
      holidays,
      slots,
      students,
    };
  }

  /**
   * Update student attendance status for a slot/date with live PostgreSQL persistence
   */
  async updateAttendance({ classId, date, records, accountId }) {
    const defaultDateStr = new Date().toISOString().slice(0, 10);
    const targetDate = date ? new Date(`${date}T00:00:00.000Z`) : new Date(`${defaultDateStr}T00:00:00.000Z`);
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
    }
    if (targetClass.school_year?.status === 'COMPLETED' || targetClass.school_year?.status === 'ENDED') {
      throw new BadRequest('Năm học đã kết thúc. Không thể chỉnh sửa điểm danh.');
    }
    const cId = targetClass.class_id;

    let staffId = 40n;
    if (accountId) {
      try {
        if (typeof accountId === 'string' && accountId.includes('-')) {
          const userAcc = await prisma.account.findFirst({
            where: { public_id: accountId },
            select: { account_id: true },
          });
          if (userAcc) {
            staffId = userAcc.account_id;
          }
        }
      } catch {
        staffId = 40n;
      }
    }

    if (Array.isArray(records) && records.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      for (const rec of records) {
        const rawId = rec.studentId || rec.id;
        const student = await this._resolveStudent(rawId);
        if (!student) continue;
        const sId = student.student_id;
        let status = 'PRESENT';
        if (rec.status === 'EXCUSED_ABSENCE' || rec.status === 'ABSENT' || rec.status === 'ABSENT_EXCUSED') {
          status = 'EXCUSED_ABSENCE';
        } else if (rec.status === 'UNEXCUSED_ABSENCE' || rec.status === 'ABSENT_UNEXCUSED') {
          status = 'UNEXCUSED_ABSENCE';
        } else {
          status = 'PRESENT';
        }

        const noteText = rec.notes !== undefined ? rec.notes : (rec.note !== undefined ? rec.note : (rec.reason !== undefined ? rec.reason : null));
        const savedReason = noteText !== null && noteText !== undefined && String(noteText).trim() !== ''
          ? String(noteText).trim()
          : (status === 'EXCUSED_ABSENCE' ? 'Nghỉ có phép' : null);

        const isPresent = status === 'PRESENT';
        let defaultCheckInTime = null;
        if (isPresent) {
          if (rec.checkInTime) {
            const parsed = new Date(rec.checkInTime);
            defaultCheckInTime = !isNaN(parsed.getTime()) ? parsed : new Date(`${targetDateStr}T${rec.checkInTime}:00.000Z`);
          } else if (targetDateStr === todayStr) {
            defaultCheckInTime = new Date();
          } else {
            defaultCheckInTime = new Date(`${targetDateStr}T07:30:00.000Z`);
          }
        }

        const existing = await prisma.attendance.findFirst({
          where: {
            student_id: sId,
            class_id: cId,
            date: targetDate,
          },
        });

        if (existing) {
          await prisma.attendance.update({
            where: { attendance_id: existing.attendance_id },
            data: {
              status,
              notes: savedReason,
              check_in_time: isPresent ? (existing.check_in_time || defaultCheckInTime) : null,
              check_in_by: existing?.check_in_by || staffId,
              ...(isPresent ? {} : {
                check_out_time: null,
                check_out_by: null,
                pickup_person_name: null,
                pickup_relationship: null,
                pickup_person_phone: null,
                pickup_citizen_id: null,
                pickup_photo_url: null,
                pickup_note: null,
              }),
              updated_at: new Date(),
            },
          });
        } else {
          await prisma.attendance.create({
            data: {
              student_id: sId,
              class_id: cId,
              date: targetDate,
              status,
              check_in_by: staffId,
              check_in_time: isPresent ? defaultCheckInTime : null,
              notes: savedReason,
            },
          });
        }
      }
    }

    return {
      success: true,
      message: 'Lưu điểm danh thành công',
      updatedCount: records ? records.length : 0,
      date: targetDate.toISOString().slice(0, 10),
    };
  }

  /**
   * Delete attendance records for a class on a specific date
   */
  async clearAttendance({ classId, date }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
    }
    if (targetClass.school_year?.status === 'COMPLETED' || targetClass.school_year?.status === 'ENDED') {
      throw new BadRequest('Năm học đã kết thúc. Không thể chỉnh sửa điểm danh.');
    }
    const cId = targetClass.class_id;
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    await prisma.attendance.deleteMany({
      where: {
        class_id: cId,
        date: targetDate,
      },
    });

    return {
      success: true,
      message: 'Đã xóa toàn bộ điểm danh của ngày này',
      date: targetDateStr,
    };
  }

  /**
   * Get child dismissal overview for a class and date
   * Pre-loads attendance check-in status, parents, and approved pickup authorizations
   */
  async getDismissalOverview({ classId, date }) {
    // 1. Resolve target class
    let targetClass = null;
    if (classId) {
      targetClass = await this._resolveClass(classId);
      if (!targetClass) {
        throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
      }
    } else {
      targetClass = await prisma.class.findFirst({
        where: { deleted_at: null },
        include: { school_year: true },
        orderBy: { class_id: 'asc' },
      });
      if (!targetClass) {
        throw new NotFound('Không tìm thấy lớp học nào');
      }
    }

    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);
    const targetDateStart = new Date(`${targetDateStr}T00:00:00.000Z`);
    const targetDateEnd = new Date(`${targetDateStr}T23:59:59.999Z`);

    // 2. Fetch enrolled students with their parents and active pickup authorizations (active on targetDate)
    const rawEnrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClass.class_id,
        student: { deleted_at: null },
        status: 'ENROLLED',
        left_at: null,
      },
      include: {
        student: {
          include: {
            parents: {
              where: { deleted_at: null },
              orderBy: { parent_id: 'asc' },
            },
            pickup_authorizations: {
              where: {
                deleted_at: null,
                status: 'APPROVED',
                start_date: { lte: new Date(`${targetDateStr}T23:59:59.999Z`) },
                end_date: { gte: new Date(`${targetDateStr}T00:00:00.000Z`) },
              },
              orderBy: { authorization_id: 'desc' },
            },
          },
        },
      },
      orderBy: { student: { student_code: 'asc' } },
    });

    const existingAtts = await prisma.attendance.findMany({
      where: {
        class_id: targetClass.class_id,
        date: { gte: targetDateStart, lte: targetDateEnd },
        deleted_at: null,
      },
      select: { student_id: true },
    });
    const existingAttSet = new Set(existingAtts.map((a) => a.student_id.toString()));

    const enrollments = [];
    for (const enr of rawEnrollments) {
      const sId = enr.student_id.toString();
      if (existingAttSet.has(sId)) {
        enrollments.push(enr);
        continue;
      }
      if (enr.enrolled_at) {
        if (new Date(enr.enrolled_at) <= targetDateEnd) {
          enrollments.push(enr);
        }
        continue;
      }
      const inOtherClass = await prisma.studentEnrollment.findFirst({
        where: {
          student_id: enr.student_id,
          class_id: { not: targetClass.class_id },
          enrolled_at: { lte: targetDateEnd },
          OR: [
            { left_at: null },
            { left_at: { gt: targetDateStart } },
          ],
        },
      });
      if (!inOtherClass) {
        enrollments.push(enr);
      }
    }

    const studentIds = enrollments.map((e) => e.student_id);

    // 3. Fetch attendance records for this date
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        class_id: targetClass.class_id,
        student_id: { in: studentIds },
        date: targetDate,
        deleted_at: null,
      },
    });

    const attendanceMap = new Map();
    attendanceRecords.forEach((r) => {
      attendanceMap.set(r.student_id.toString(), r);
    });

    // 4. Map into rich student dismissal objects
    const mappedStudents = enrollments.map((e) => {
      const s = e.student;
      const sId = s.student_id.toString();
      const att = attendanceMap.get(sId);

      const attendanceStatus = att ? att.status : 'NOT_RECORDED';
      const isPresent = attendanceStatus === 'PRESENT';
      const isAbsent = attendanceStatus === 'EXCUSED_ABSENCE' || attendanceStatus === 'UNEXCUSED_ABSENCE';
      const isAttendanceRecorded = Boolean(att);

      const isDismissed = Boolean(att && att.check_out_time);
      const checkOutTime = att?.check_out_time ? att.check_out_time.toISOString() : null;

      let checkOutTimeFormatted = null;
      if (att?.check_out_time) {
        const d = new Date(att.check_out_time);
        checkOutTimeFormatted = d.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      }

      const availableParents = (s.parents || []).map((p) => ({
        id: p.parent_id.toString(),
        name: p.full_name,
        relationship: p.relationship,
        phone: p.phone,
        avatarUrl:
          p.avatar_url ||
          `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(p.full_name || 'PH')}`,
      }));

      const availableAuthorizations = (s.pickup_authorizations || []).map((pa) => ({
        id: pa.authorization_id.toString(),
        name: pa.pickup_person_name,
        relationship: pa.relationship,
        phone: pa.pickup_person_phone,
        citizenId: pa.pickup_citizen_id,
        photoUrl:
          pa.photo_url ||
          `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(pa.pickup_person_name || 'UQ')}`,
        note: pa.note,
        startDate: pa.start_date.toISOString().slice(0, 10),
        endDate: pa.end_date.toISOString().slice(0, 10),
        createdAt: pa.created_at ? pa.created_at.toISOString() : null,
      }));

      return {
        id: s.public_id || sId,
        code: s.student_code,
        name: s.full_name,
        avatarUrl: s.avatar_url,
        gender: s.gender,
        attendanceStatus,
        attendanceLabel:
          attendanceStatus === 'PRESENT'
            ? 'Có mặt'
            : attendanceStatus === 'EXCUSED_ABSENCE'
            ? 'Nghỉ có phép'
            : attendanceStatus === 'UNEXCUSED_ABSENCE'
            ? 'Nghỉ không phép'
            : 'Chưa điểm danh',
        isPresent,
        isAbsent,
        isAttendanceRecorded,
        attendanceNote: att?.notes || null,
        // Dismissal / Check-out status
        isDismissed,
        checkOutTime,
        checkOutTimeFormatted,
        pickupPersonName: att?.pickup_person_name || null,
        pickupRelationship: att?.pickup_relationship || null,
        pickupPersonPhone: att?.pickup_person_phone || null,
        pickupCitizenId: att?.pickup_citizen_id || null,
        pickupPhotoUrl: att?.pickup_photo_url || null,
        pickupNote: att?.pickup_note || null,
        // Contact options
        parents: availableParents,
        authorizations: availableAuthorizations,
      };
    });

    const pendingAuthCount = await prisma.pickupAuthorization.count({
      where: {
        student_id: { in: studentIds },
        status: 'PENDING',
        deleted_at: null,
      },
    });

    const summary = {
      totalStudents: mappedStudents.length,
      presentCount: mappedStudents.filter((s) => s.isPresent).length,
      dismissedCount: mappedStudents.filter((s) => s.isDismissed).length,
      remainingInClassCount: mappedStudents.filter((s) => s.isPresent && !s.isDismissed).length,
      absentCount: mappedStudents.filter((s) => s.isAbsent).length,
      unrecordedCount: mappedStudents.filter((s) => !s.isAttendanceRecorded).length,
      pendingAuthorizationsCount: pendingAuthCount,
    };

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        yearName: targetClass.school_year?.name || 'Năm học 2026–2027',
      },
      date: targetDateStr,
      summary,
      students: mappedStudents,
    };
  }

  /**
   * Record child dismissal (check-out)
   * Strictly enforces that student must be checked in with status === 'PRESENT'
   */
  async recordDismissal({ classId, date, accountId, records }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
    }
    const cId = targetClass.class_id;
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);
    let staffId = 40n;
    if (accountId) {
      try {
        if (typeof accountId === 'string' && accountId.includes('-')) {
          const userAcc = await prisma.account.findFirst({
            where: { public_id: accountId },
            select: { account_id: true },
          });
          if (userAcc) {
            staffId = userAcc.account_id;
          }
        }
      } catch {
        staffId = 40n;
      }
    }

    if (!Array.isArray(records) || records.length === 0) {
      throw new BadRequest('Danh sách học sinh đón trẻ không hợp lệ');
    }

    const now = new Date();

    for (const rec of records) {
      const rawId = rec.studentId || rec.id;
      const std = await this._resolveStudent(rawId);
      if (!std) continue;
      const sId = std.student_id;

      // Verify attendance record
      const attendance = await prisma.attendance.findFirst({
        where: {
          class_id: cId,
          student_id: sId,
          date: targetDate,
          deleted_at: null,
        },
      });

      if (!attendance) {
        throw new BadRequest(`Học sinh ID ${sId} chưa được điểm danh ngày ${targetDateStr}. Cần điểm danh trước khi đón trẻ.`);
      }

      if (attendance.status !== 'PRESENT') {
        throw new BadRequest(`Học sinh ID ${sId} hôm nay vắng mặt (${attendance.status}). Không thể ghi nhận đón trẻ.`);
      }

      let checkOutDate = targetDateStr === new Date().toISOString().slice(0, 10) ? now : new Date(`${targetDateStr}T16:30:00.000Z`);
      if (rec.checkOutTime) {
        const parsed = new Date(rec.checkOutTime);
        if (!isNaN(parsed.getTime())) {
          checkOutDate = parsed;
        } else if (typeof rec.checkOutTime === 'string' && rec.checkOutTime.includes(':')) {
          checkOutDate = new Date(`${targetDateStr}T${rec.checkOutTime}:00.000Z`);
        }
      } else if (attendance.check_out_time) {
        checkOutDate = attendance.check_out_time;
      }

      await prisma.attendance.update({
        where: { attendance_id: attendance.attendance_id },
        data: {
          check_out_time: checkOutDate,
          check_out_by: staffId,
          pickup_person_name: rec.pickupPersonName || rec.pickupName || 'Phụ huynh',
          pickup_relationship: rec.pickupRelationship || 'Phụ huynh',
          pickup_person_phone: rec.pickupPersonPhone || rec.phone || null,
          pickup_citizen_id: rec.pickupCitizenId || null,
          pickup_photo_url: rec.pickupPhotoUrl || null,
          pickup_note: rec.pickupNote || rec.note || null,
          updated_at: now,
        },
      });
    }

    return {
      success: true,
      message: 'Ghi nhận đón trẻ thành công',
      updatedCount: records.length,
      date: targetDateStr,
    };
  }

  /**
   * Cancel child dismissal (reset to In-Class state)
   */
  async cancelDismissal({ classId, date, studentId }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
    }
    const cId = targetClass.class_id;
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    let sId = null;
    const strStudentId = String(studentId || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strStudentId)) {
      const std = await prisma.student.findFirst({
        where: { public_id: strStudentId },
        select: { student_id: true },
      });
      if (std) sId = std.student_id;
    } else if (/^\d+$/.test(strStudentId)) {
      sId = BigInt(strStudentId);
    }

    if (!sId) {
      throw new NotFound('Học sinh không tồn tại hoặc mã định danh không hợp lệ');
    }

    const attendance = await prisma.attendance.findFirst({
      where: {
        class_id: cId,
        student_id: sId,
        date: targetDate,
        deleted_at: null,
      },
    });

    if (!attendance) {
      throw new NotFound('Không tìm thấy bản ghi điểm danh');
    }

    await prisma.attendance.update({
      where: { attendance_id: attendance.attendance_id },
      data: {
        check_out_time: null,
        check_out_by: null,
        pickup_person_name: null,
        pickup_relationship: null,
        pickup_person_phone: null,
        pickup_citizen_id: null,
        pickup_photo_url: null,
        pickup_note: null,
        updated_at: new Date(),
      },
    });

    return {
      success: true,
      message: 'Đã hoàn tác trạng thái đón trẻ',
      studentId: sId.toString(),
      date: targetDateStr,
    };
  }

  /**
   * Clear all child dismissals for a class and date
   */
  async clearAllDismissals({ classId, date }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
    }
    const cId = targetClass.class_id;
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    const result = await prisma.attendance.updateMany({
      where: {
        class_id: cId,
        date: targetDate,
        deleted_at: null,
      },
      data: {
        check_out_time: null,
        check_out_by: null,
        pickup_person_name: null,
        pickup_relationship: null,
        pickup_person_phone: null,
        pickup_citizen_id: null,
        pickup_photo_url: null,
        pickup_note: null,
        updated_at: new Date(),
      },
    });

    return {
      success: true,
      message: 'Đã xóa toàn bộ thông tin đón trẻ ngày này',
      clearedCount: result.count,
      date: targetDateStr,
    };
  }

  /**
   * Get pickup authorizations for a class with optional status & date filtering
   */
  async getPickupAuthorizations({ classId, status, date }) {
    let targetClassId;
    if (classId) {
      const cls = await this._resolveClass(classId);
      if (!cls) {
        throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
      }
      targetClassId = cls.class_id;
    } else {
      const defaultCls = await prisma.class.findFirst({
        where: { deleted_at: null },
        orderBy: { class_id: 'asc' },
      });
      if (!defaultCls) {
        throw new NotFound('Không tìm thấy lớp học nào');
      }
      targetClassId = defaultCls.class_id;
    }

    const filterDateStr = date || new Date().toISOString().slice(0, 10);
    const filterDateStart = new Date(`${filterDateStr}T00:00:00.000Z`);
    const filterDateEnd = new Date(`${filterDateStr}T23:59:59.999Z`);
    const rawEnrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClassId,
        student: { deleted_at: null },
        status: 'ENROLLED',
        left_at: null,
      },
      select: { student_id: true, enrolled_at: true },
    });

    const existingAtts = await prisma.attendance.findMany({
      where: {
        class_id: targetClassId,
        date: { gte: filterDateStart, lte: filterDateEnd },
        deleted_at: null,
      },
      select: { student_id: true },
    });
    const existingAttSet = new Set(existingAtts.map((a) => a.student_id.toString()));

    const enrollments = [];
    for (const enr of rawEnrollments) {
      const sId = enr.student_id.toString();
      if (existingAttSet.has(sId)) {
        enrollments.push(enr);
        continue;
      }
      if (enr.enrolled_at) {
        if (new Date(enr.enrolled_at) <= filterDateEnd) {
          enrollments.push(enr);
        }
        continue;
      }
      const inOtherClass = await prisma.studentEnrollment.findFirst({
        where: {
          student_id: enr.student_id,
          class_id: { not: targetClassId },
          enrolled_at: { lte: filterDateEnd },
          OR: [
            { left_at: null },
            { left_at: { gt: filterDateStart } },
          ],
        },
      });
      if (!inOtherClass) {
        enrollments.push(enr);
      }
    }
    const studentIds = enrollments.map((e) => e.student_id);

    const whereClause = {
      student_id: { in: studentIds },
      deleted_at: null,
    };

    if (status && status !== 'ALL') {
      whereClause.status = status;
    }

    const auths = await prisma.pickupAuthorization.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            student_id: true,
            student_code: true,
            full_name: true,
            avatar_url: true,
            account: {
              select: {
                account_id: true,
                is_active: true,
                deleted_at: true,
              },
            },
          },
        },
        authorizer: {
          select: {
            account_id: true,
            username: true,
            is_active: true,
            deleted_at: true,
          },
        },
        approver: {
          select: {
            account_id: true,
            username: true,
          },
        },
      },
      orderBy: [
        { created_at: 'desc' },
      ],
    });

    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.pickupAuthorization.count({
        where: { student_id: { in: studentIds }, status: 'PENDING', deleted_at: null },
      }),
      prisma.pickupAuthorization.count({
        where: { student_id: { in: studentIds }, status: 'APPROVED', deleted_at: null },
      }),
      prisma.pickupAuthorization.count({
        where: { student_id: { in: studentIds }, status: 'REJECTED', deleted_at: null },
      }),
    ]);

    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    const mapped = auths.map((a) => {
      const s = a.student;
      const isDateActive = a.start_date <= targetDate && a.end_date >= targetDate;
      const isParentLocked = Boolean(
        (a.authorizer && (!a.authorizer.is_active || a.authorizer.deleted_at !== null)) ||
        (s?.account && (!s.account.is_active || s.account.deleted_at !== null))
      );

      return {
        id: a.public_id || a.authorization_id.toString(),
        publicId: a.public_id,
        isParentLocked,
        student: {
          id: s.public_id || s.student_id.toString(),
          code: s.student_code,
          name: s.full_name,
          avatarUrl: s.avatar_url,
        },
        pickupPersonName: a.pickup_person_name,
        pickupPersonPhone: a.pickup_person_phone,
        pickupCitizenId: a.pickup_citizen_id,
        relationship: a.relationship,
        photoUrl: a.photo_url,
        note: a.note,
        startDate: a.start_date.toISOString().slice(0, 10),
        endDate: a.end_date.toISOString().slice(0, 10),
        status: a.status,
        isDateActive,
        authorizer: {
          id: a.authorizer?.account_id?.toString() || null,
          username: a.authorizer?.username || null,
          phone: a.authorizer?.phone || null,
        },
        approver: a.approver ? {
          id: a.approver?.account_id?.toString() || null,
          username: a.approver?.username || null,
        } : null,
        approvedAt: a.approved_at ? a.approved_at.toISOString() : null,
        rejectedReason: a.rejected_reason,
        createdAt: a.created_at.toISOString(),
      };
    });

    return {
      authorizations: mapped,
      stats: {
        pendingCount,
        approvedCount,
        rejectedCount,
        totalCount: pendingCount + approvedCount + rejectedCount,
      },
    };
  }

  /**
   * Create a pickup authorization (e.g. by teacher on behalf of parent)
   */
  async createPickupAuthorization({
    classId,
    accountId,
    studentId,
    pickupPersonName,
    pickupPersonPhone,
    pickupCitizenId,
    relationship,
    photoUrl,
    note,
    startDate,
    endDate,
    status = 'APPROVED',
  }) {
    let staffId = 40n;
    if (accountId) {
      try {
        if (typeof accountId === 'string' && accountId.includes('-')) {
          const userAcc = await prisma.account.findFirst({
            where: { public_id: accountId },
            select: { account_id: true },
          });
          if (userAcc) staffId = userAcc.account_id;
        } else {
          staffId = BigInt(accountId);
        }
      } catch (e) {
        console.warn('Could not parse staff accountId:', e);
      }
    }

    const student = await this._resolveStudent(studentId);
    if (!student) {
      throw new NotFound('Không tìm thấy học sinh để tạo ủy quyền đón.');
    }

    if (pickupCitizenId && pickupCitizenId.trim()) {
      if (!/^[0-9]{12}$/.test(pickupCitizenId.trim())) {
        throw new BadRequest('Số CCCD/Định danh cá nhân phải gồm 12 chữ số.');
      }
    }
    const sId = student.student_id;
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);

    // Rule: Daily limit: delegates <= (4 - parents)
    await validatePickupQuota(prisma, sId, {
      startDate,
      endDate,
    });

    const created = await prisma.pickupAuthorization.create({
      data: {
        student_id: sId,
        authorized_by: staffId,
        pickup_person_name: pickupPersonName.trim(),
        pickup_person_phone: pickupPersonPhone?.trim() || '',
        pickup_citizen_id: pickupCitizenId?.trim() || null,
        relationship: relationship?.trim() || 'Người được ủy quyền',
        photo_url: photoUrl?.trim() || null,
        note: note?.trim() || null,
        start_date: start,
        end_date: end,
        status,
        approved_by: status === 'APPROVED' ? staffId : null,
        approved_at: status === 'APPROVED' ? new Date() : null,
      },
      include: {
        student: true,
      },
    });

    return {
      id: created.authorization_id.toString(),
      publicId: created.public_id,
      studentName: created.student?.full_name,
      status: created.status,
    };
  }

  /**
   * Approve a pickup authorization
   */
  async approvePickupAuthorization({ classId, authId, accountId }) {
    let staffId = null;
    if (accountId) {
      try {
        const str = String(accountId).trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        if (isUuid) {
          const userAcc = await prisma.account.findFirst({
            where: { public_id: str, deleted_at: null },
            select: { account_id: true },
          });
          if (userAcc) staffId = userAcc.account_id;
        } else if (/^\d+$/.test(str)) {
          staffId = BigInt(str);
        }
      } catch (e) {
        console.warn('Could not parse staff accountId:', e);
      }
    }
    if (!staffId) {
      const anyStaff = await prisma.account.findFirst({
        where: { role: { in: ['PRINCIPAL_BGH', 'TEACHER_GV'] }, deleted_at: null },
        select: { account_id: true },
      });
      staffId = anyStaff?.account_id || null;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(authId).trim());
    const where = isUuid
      ? { public_id: String(authId).trim() }
      : { authorization_id: BigInt(authId) };

    const existingAuth = await prisma.pickupAuthorization.findFirst({
      where,
      include: {
        authorizer: true,
        student: {
          include: {
            account: true,
          },
        },
      },
    });
    if (!existingAuth) throw new NotFound('Yêu cầu ủy quyền đón không tồn tại');

    // Rule: Do not allow approving requests sent from locked parent account
    const isAuthorizerLocked =
      existingAuth.authorizer && (!existingAuth.authorizer.is_active || existingAuth.authorizer.deleted_at !== null);
    const isStudentParentLocked =
      existingAuth.student?.account && (!existingAuth.student.account.is_active || existingAuth.student.account.deleted_at !== null);

    if (isAuthorizerLocked || isStudentParentLocked) {
      throw new BadRequest('Tài khoản phụ huynh đã bị khóa, không thể phê duyệt yêu cầu ủy quyền đưa đón.');
    }

    // Rule: Total guardians + approved pickup authorizers per day <= 4
    // (i.e. delegates on any day in range <= 4 - parents)
    const startIso = existingAuth.start_date.toISOString().split('T')[0];
    const endIso = existingAuth.end_date.toISOString().split('T')[0];
    await validatePickupQuota(prisma, existingAuth.student_id, {
      startDate: startIso,
      endDate: endIso,
      excludeAuthId: existingAuth.authorization_id,
    });

    const updated = await prisma.pickupAuthorization.update({
      where,
      data: {
        status: 'APPROVED',
        approved_by: staffId,
        approved_at: new Date(),
        rejected_reason: null,
      },
      include: {
        student: true,
      },
    });

    // Notification 12: Approve Authorization (GV duyệt người đón hộ -> Phụ huynh của trẻ)
    const parentAccountId = updated.student?.account_id || updated.created_by;
    if (parentAccountId) {
      notificationService
        .emitSystemNotification({
          recipientAccountIds: [parentAccountId],
          creatorAccountId: staffId,
          type: 'SCHOOL_ANNOUNCEMENT',
          title: 'Ủy quyền đón trẻ đã được duyệt',
          body: `Giáo viên đã duyệt người được ủy quyền đón bé ${updated.student?.full_name}: ${updated.pickup_person_name} (${updated.relationship}).`,
          data: {
            type: 'PICKUP_AUTH_APPROVED',
            authId: updated.public_id || updated.authorization_id.toString(),
            studentId: updated.student_id?.toString(),
          },
        })
        .catch(() => {});
    }

    return {
      id: updated.public_id || updated.authorization_id.toString(),
      status: updated.status,
      approvedAt: updated.approved_at,
      studentName: updated.student?.full_name,
    };
  }

  /**
   * Reject a pickup authorization with reason
   */
  async rejectPickupAuthorization({ classId, authId, accountId, reason }) {
    let staffId = null;
    if (accountId) {
      try {
        const str = String(accountId).trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        if (isUuid) {
          const userAcc = await prisma.account.findFirst({
            where: { public_id: str, deleted_at: null },
            select: { account_id: true },
          });
          if (userAcc) staffId = userAcc.account_id;
        } else if (/^\d+$/.test(str)) {
          staffId = BigInt(str);
        }
      } catch (e) {
        console.warn('Could not parse staff accountId:', e);
      }
    }
    if (!staffId) {
      const anyStaff = await prisma.account.findFirst({
        where: { role: { in: ['PRINCIPAL_BGH', 'TEACHER_GV'] }, deleted_at: null },
        select: { account_id: true },
      });
      staffId = anyStaff?.account_id || null;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(authId).trim());
    const where = isUuid
      ? { public_id: String(authId).trim() }
      : { authorization_id: BigInt(authId) };

    const existingAuth = await prisma.pickupAuthorization.findFirst({ where });
    if (!existingAuth) throw new NotFound('Yêu cầu ủy quyền đón không tồn tại');

    const updated = await prisma.pickupAuthorization.update({
      where,
      data: {
        status: 'REJECTED',
        approved_by: staffId,
        approved_at: new Date(),
        rejected_reason: reason || 'Từ chối bởi giáo viên',
      },
      include: {
        student: true,
      },
    });

    // Notification 13: Reject Authorization (GV từ chối yêu cầu đón hộ -> Phụ huynh của trẻ)
    const parentAccountId = updated.student?.account_id || updated.created_by;
    if (parentAccountId) {
      const reasonText = updated.rejected_reason ? ` Lý do: ${updated.rejected_reason}` : '';
      notificationService
        .emitSystemNotification({
          recipientAccountIds: [parentAccountId],
          creatorAccountId: staffId,
          type: 'SCHOOL_ANNOUNCEMENT',
          title: 'Ủy quyền đón trẻ bị từ chối',
          body: `Yêu cầu ủy quyền đón bé ${updated.student?.full_name} đã bị giáo viên từ chối.${reasonText}`,
          data: {
            type: 'PICKUP_AUTH_REJECTED',
            authId: updated.public_id || updated.authorization_id.toString(),
            studentId: updated.student_id?.toString(),
            reason: updated.rejected_reason,
          },
        })
        .catch(() => {});
    }

    return {
      id: updated.public_id || updated.authorization_id.toString(),
      status: updated.status,
      approvedAt: updated.approved_at,
      rejectedReason: updated.rejected_reason,
      studentName: updated.student?.full_name,
    };
  }

  /**
   * Get pickup quota information and blocked dates for a student
   */
  async getStudentPickupQuota({ studentId, startDate, endDate, month }) {
    const student = await this._resolveStudent(studentId);
    if (!student) {
      throw new NotFound('Không tìm thấy thông tin học sinh.');
    }

    let start = startDate;
    let end = endDate;
    if (month && !start && !end) {
      const parts = month.split('-');
      if (parts.length === 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        start = `${month}-01`;
        end = `${month}-${String(lastDay).padStart(2, '0')}`;
      }
    }

    return getStudentPickupQuotaInfo(prisma, student.student_id, {
      startDate: start,
      endDate: end,
    });
  }

  /**
   * Helper: Vẽ bảng điểm danh chi tiết của một tháng lên worksheet
   */
  _renderAttendanceMonthSheet(worksheet, {
    targetClass,
    targetMonth,
    targetYear,
    enrollments,
    attendances,
    holidays,
    now,
  }) {
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));
    const daysInMonth = endOfMonth.getUTCDate();

    const attMap = new Map();
    attendances.forEach((att) => {
      const d = new Date(att.date);
      const dayNum = d.getUTCDate();
      const sId = att.student_id.toString();
      attMap.set(`${sId}_${dayNum}`, att.status);
    });

    const isHolidayDay = (dayNum) => {
      const curDate = new Date(Date.UTC(targetYear, targetMonth - 1, dayNum));
      const curIso = curDate.toISOString().slice(0, 10);
      const isMakeup = holidays.some((h) => {
        if (!h.makeup_date) return false;
        const mDate = new Date(h.makeup_date);
        return curIso === mDate.toISOString().slice(0, 10);
      });
      if (isMakeup) return false;

      return holidays.some((h) => {
        const hStart = new Date(h.start_date);
        const hEnd = new Date(h.end_date);
        return curDate >= hStart && curDate <= hEnd && !h.is_teaching_allowed;
      });
    };

    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    const totalCols = 3 + daysInMonth + 4;
    const title = `SỔ THEO DÕI ĐIỂM DANH & CHUYÊN CẦN - THÁNG ${String(targetMonth).padStart(2, '0')}/${targetYear}`;
    const subtitle = `Lớp: ${targetClass.name.toUpperCase()} | Năm học: ${targetClass.school_year?.name || '2026-2027'} | Sĩ số: ${enrollments.length} học sinh | Ngày xuất: ${formatDateDMY(now)}`;

    const startRow = addSchoolHeaderBanner(worksheet, { title, subtitle, totalCols });

    // Header 1: Day numbers
    const row1Values = ['STT', 'Mã học sinh', 'Họ và tên trẻ'];
    for (let d = 1; d <= daysInMonth; d++) {
      row1Values.push(`Ngày ${d}`);
    }
    row1Values.push('Tổng đi học', 'Nghỉ có phép', 'Nghỉ K.phép', 'Chuyên cần (%)');

    const headerRow1 = worksheet.addRow(row1Values);
    applyHeaderStyles(headerRow1);

    // Header 2: Day of week indicator
    const row2Values = ['', '', ''];
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(Date.UTC(targetYear, targetMonth - 1, d));
      const dow = dayNames[curDate.getUTCDay()];
      row2Values.push(dow);
    }
    row2Values.push('', '', '', '');
    const headerRow2 = worksheet.addRow(row2Values);

    headerRow2.height = 20;
    headerRow2.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' },
      };
      cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    let classTotalPresent = 0;
    let classTotalExcused = 0;
    let classTotalUnexcused = 0;
    const studentStats = new Map();

    enrollments.forEach((enr, idx) => {
      const st = enr.student;
      const sId = st.student_id.toString();
      const rowValues = [
        idx + 1,
        st.student_code || '',
        st.full_name || `${st.last_name || ''} ${st.first_name || ''}`.trim(),
      ];

      let studentPresent = 0;
      let studentExcused = 0;
      let studentUnexcused = 0;
      let studentSchoolDays = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const curDate = new Date(Date.UTC(targetYear, targetMonth - 1, d));
        const dayOfWeek = curDate.getUTCDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const isHol = isHolidayDay(d);

        const status = attMap.get(`${sId}_${d}`);

        if (status === 'PRESENT') {
          rowValues.push('x');
          studentPresent++;
          studentSchoolDays++;
        } else if (status === 'EXCUSED_ABSENCE') {
          rowValues.push('P');
          studentExcused++;
          studentSchoolDays++;
        } else if (status === 'UNEXCUSED_ABSENCE') {
          rowValues.push('K');
          studentUnexcused++;
          studentSchoolDays++;
        } else if (isWeekend || isHol) {
          rowValues.push('-');
        } else {
          rowValues.push('');
        }
      }

      classTotalPresent += studentPresent;
      classTotalExcused += studentExcused;
      classTotalUnexcused += studentUnexcused;

      const rate = studentSchoolDays > 0 ? ((studentPresent / studentSchoolDays) * 100).toFixed(1) + '%' : '100%';

      studentStats.set(sId, {
        present: studentPresent,
        excused: studentExcused,
        unexcused: studentUnexcused,
        schoolDays: studentSchoolDays,
        rate,
      });

      rowValues.push(studentPresent, studentExcused, studentUnexcused, rate);
      const studentRow = worksheet.addRow(rowValues);

      studentRow.eachCell((cell, colNumber) => {
        if (colNumber > 3) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        if (cell.value === 'x') {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
        } else if (cell.value === 'P') {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFD97706' } };
        } else if (cell.value === 'K') {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } };
        } else if (cell.value === '-') {
          cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF94A3B8' } };
        }
      });
    });

    // Summary total row
    const totalRowValues = ['TỔNG CỘNG', '', ''];
    for (let d = 1; d <= daysInMonth; d++) {
      totalRowValues.push('');
    }
    const totalSchoolDaysAll = classTotalPresent + classTotalExcused + classTotalUnexcused;
    const avgRate = totalSchoolDaysAll > 0 ? ((classTotalPresent / totalSchoolDaysAll) * 100).toFixed(1) + '%' : '100%';
    totalRowValues.push(classTotalPresent, classTotalExcused, classTotalUnexcused, avgRate);

    const summaryRow = worksheet.addRow(totalRowValues);
    summaryRow.height = 24;
    summaryRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF64748B' } },
        bottom: { style: 'medium', color: { argb: 'FF64748B' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
    summaryRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.addRow([]);
    const legendRow = worksheet.addRow([
      'Ghi chú ký hiệu:',
      'x: Có mặt',
      'P: Nghỉ học có phép',
      'K: Nghỉ học không phép',
      '-: Nghỉ thứ Bảy, Chủ Nhật hoặc ngày Lễ',
    ]);
    legendRow.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } };

    autoFitColumns(worksheet);

    for (let c = 4; c < 4 + daysInMonth; c++) {
      worksheet.getColumn(c).width = 7.5;
    }

    return {
      month: targetMonth,
      year: targetYear,
      label: `Tháng ${String(targetMonth).padStart(2, '0')}`,
      classPresent: classTotalPresent,
      classExcused: classTotalExcused,
      classUnexcused: classTotalUnexcused,
      classDays: totalSchoolDaysAll,
      studentStats,
    };
  }

  /**
   * Helper: Vẽ trang tổng kết chuyên cần cả năm học
   */
  _renderAttendanceFullYearSummary(worksheet, {
    targetClass,
    enrollments,
    monthsList,
    monthlyResults,
    now,
  }) {
    const totalCols = 3 + monthsList.length + 4;
    const title = `BẢNG TỔNG HỢP CHUYÊN CẦN NĂM HỌC ${targetClass.school_year?.name || '2026-2027'}`;
    const subtitle = `Lớp: ${targetClass.name.toUpperCase()} | Sĩ số: ${enrollments.length} học sinh | Tổng số tháng: ${monthsList.length} tháng | Ngày xuất: ${formatDateDMY(now)}`;

    const startRow = addSchoolHeaderBanner(worksheet, { title, subtitle, totalCols });

    const headerValues = ['STT', 'Mã học sinh', 'Họ và tên trẻ'];
    monthsList.forEach((m) => {
      headerValues.push(m.label);
    });
    headerValues.push('Tổng ngày đi học', 'Nghỉ có phép (CP)', 'Nghỉ K.phép (KP)', 'Chuyên cần (%)');

    const headerRow = worksheet.addRow(headerValues);
    applyHeaderStyles(headerRow);

    let classYearPresent = 0;
    let classYearExcused = 0;
    let classYearUnexcused = 0;
    let classYearDays = 0;

    enrollments.forEach((enr, idx) => {
      const st = enr.student;
      const sId = st.student_id.toString();
      const rowValues = [
        idx + 1,
        st.student_code || '',
        st.full_name || `${st.last_name || ''} ${st.first_name || ''}`.trim(),
      ];

      let totalStudentPresent = 0;
      let totalStudentExcused = 0;
      let totalStudentUnexcused = 0;
      let totalStudentDays = 0;

      monthsList.forEach((m) => {
        const mRes = monthlyResults.find((r) => r.month === m.month && r.year === m.year);
        const sStat = mRes?.studentStats?.get(sId);
        if (sStat && sStat.schoolDays > 0) {
          rowValues.push(`${sStat.present}/${sStat.schoolDays}`);
          totalStudentPresent += sStat.present;
          totalStudentExcused += sStat.excused;
          totalStudentUnexcused += sStat.unexcused;
          totalStudentDays += sStat.schoolDays;
        } else {
          rowValues.push('-');
        }
      });

      classYearPresent += totalStudentPresent;
      classYearExcused += totalStudentExcused;
      classYearUnexcused += totalStudentUnexcused;
      classYearDays += totalStudentDays;

      const rate = totalStudentDays > 0
        ? ((totalStudentPresent / totalStudentDays) * 100).toFixed(1) + '%'
        : '100%';

      rowValues.push(totalStudentPresent, totalStudentExcused, totalStudentUnexcused, rate);
      const studentRow = worksheet.addRow(rowValues);
      studentRow.eachCell((cell, colNumber) => {
        if (colNumber > 3) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    });

    const totalRowValues = ['TỔNG CỘNG', '', ''];
    monthsList.forEach((m) => {
      const mRes = monthlyResults.find((r) => r.month === m.month && r.year === m.year);
      if (mRes && mRes.classDays > 0) {
        totalRowValues.push(`${mRes.classPresent}/${mRes.classDays}`);
      } else {
        totalRowValues.push('-');
      }
    });

    const totalClassYearDaysAll = classYearPresent + classYearExcused + classYearUnexcused;
    const avgYearRate = totalClassYearDaysAll > 0
      ? ((classYearPresent / totalClassYearDaysAll) * 100).toFixed(1) + '%'
      : '100%';

    totalRowValues.push(classYearPresent, classYearExcused, classYearUnexcused, avgYearRate);

    const summaryRow = worksheet.addRow(totalRowValues);
    summaryRow.height = 24;
    summaryRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF64748B' } },
        bottom: { style: 'medium', color: { argb: 'FF64748B' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
    summaryRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    applyZebraRows(worksheet, startRow + 1, startRow + enrollments.length);
    autoFitColumns(worksheet);
  }

  /**
   * Xuất ma trận sổ điểm danh & chuyên cần ra Excel:
   * - Nếu isFullYear = true (hoặc không truyền tháng): Xuất trọn bộ cả năm học (Mỗi tháng 1 sheet + Trang tổng hợp cả năm)
   * - Nếu có tháng cụ thể: Xuất 1 sheet điểm danh tháng tương ứng (tương thích ngược)
   */
  async exportAttendanceExcel({ classId, month, year, isFullYear }) {
    let targetClass = null;
    if (classId) {
      targetClass = await this._resolveClass(classId);
    }
    if (!targetClass) {
      targetClass = await prisma.class.findFirst({
        where: { deleted_at: null },
        include: { school_year: true },
        orderBy: { class_id: 'asc' },
      });
    }
    if (!targetClass) {
      throw new NotFound('Không tìm thấy lớp học yêu cầu.');
    }

    const now = new Date();

    // 1. Fetch active students in class
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClass.class_id,
        status: { notIn: ['TRANSFERRED_SCHOOL', 'DROPPED_OUT'] },
        student: { deleted_at: null },
      },
      include: {
        student: true,
      },
      orderBy: { student: { student_code: 'asc' } },
    });

    const isFullYearExport = isFullYear || month === 'all' || (!month && !year);

    if (!isFullYearExport) {
      // Xuất 1 tháng đơn lẻ (backward compatibility)
      const targetMonth = month ? parseInt(month, 10) : (now.getMonth() + 1);
      const targetYear = year ? parseInt(year, 10) : now.getFullYear();

      const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

      const [attendances, holidays] = await Promise.all([
        prisma.attendance.findMany({
          where: {
            class_id: targetClass.class_id,
            date: { gte: startOfMonth, lte: endOfMonth },
            deleted_at: null,
          },
        }),
        prisma.schoolHoliday.findMany({
          where: {
            school_year_id: targetClass.school_year_id,
            start_date: { lte: endOfMonth },
            end_date: { gte: startOfMonth },
            deleted_at: null,
          },
        }),
      ]);

      const { workbook, worksheet } = createStandardWorkbook('Sổ điểm danh');
      this._renderAttendanceMonthSheet(worksheet, {
        targetClass,
        targetMonth,
        targetYear,
        enrollments,
        attendances,
        holidays,
        now,
      });

      return await workbook.xlsx.writeBuffer();
    }

    // Xuất trọn bộ cả năm học (Mỗi tháng 1 sheet riêng + Sheet Tổng hợp cả năm)
    let monthsList = [];
    if (targetClass.school_year?.start_date && targetClass.school_year?.end_date) {
      const cur = new Date(targetClass.school_year.start_date);
      const end = new Date(targetClass.school_year.end_date);
      while (cur <= end) {
        monthsList.push({
          month: cur.getUTCMonth() + 1,
          year: cur.getUTCFullYear(),
          label: `Tháng ${String(cur.getUTCMonth() + 1).padStart(2, '0')}`,
        });
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }

    if (monthsList.length === 0) {
      const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      monthsList = [
        { month: 9, year: startYear, label: 'Tháng 09' },
        { month: 10, year: startYear, label: 'Tháng 10' },
        { month: 11, year: startYear, label: 'Tháng 11' },
        { month: 12, year: startYear, label: 'Tháng 12' },
        { month: 1, year: startYear + 1, label: 'Tháng 01' },
        { month: 2, year: startYear + 1, label: 'Tháng 02' },
        { month: 3, year: startYear + 1, label: 'Tháng 03' },
        { month: 4, year: startYear + 1, label: 'Tháng 04' },
        { month: 5, year: startYear + 1, label: 'Tháng 05' },
      ];
    }

    const { workbook, worksheet: summarySheet } = createStandardWorkbook('Tổng hợp cả năm');

    const monthlyResults = [];
    for (const mItem of monthsList) {
      const startOfMonth = new Date(Date.UTC(mItem.year, mItem.month - 1, 1, 0, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(mItem.year, mItem.month, 0, 23, 59, 59, 999));

      const [attendances, holidays] = await Promise.all([
        prisma.attendance.findMany({
          where: {
            class_id: targetClass.class_id,
            date: { gte: startOfMonth, lte: endOfMonth },
            deleted_at: null,
          },
        }),
        prisma.schoolHoliday.findMany({
          where: {
            school_year_id: targetClass.school_year_id,
            start_date: { lte: endOfMonth },
            end_date: { gte: startOfMonth },
            deleted_at: null,
          },
        }),
      ]);

      const monthSheet = workbook.addWorksheet(mItem.label, {
        views: [{ showGridLines: true }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });

      const mRes = this._renderAttendanceMonthSheet(monthSheet, {
        targetClass,
        targetMonth: mItem.month,
        targetYear: mItem.year,
        enrollments,
        attendances,
        holidays,
        now,
      });

      monthlyResults.push(mRes);
    }

    this._renderAttendanceFullYearSummary(summarySheet, {
      targetClass,
      enrollments,
      monthsList,
      monthlyResults,
      now,
    });

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * UC 66: Class Attendance Statistics (Thống kê điểm danh theo lớp)
   * Displays attendance totals and rates for a selected class and period (week, month, semester, or custom range).
   */
  async getClassAttendanceStats({ classId, period = 'month', date, startDate, endDate, month, year, semester }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
    }

    const now = new Date();

    // 1. Resolve date range
    let rangeStart = null;
    let rangeEnd = null;

    if (startDate && endDate) {
      rangeStart = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`);
      rangeEnd = new Date(`${endDate.slice(0, 10)}T23:59:59.999Z`);
    } else if (period === 'week') {
      const refDate = date ? new Date(date) : now;
      const day = refDate.getDay();
      const diffToMonday = refDate.getDate() - day + (day === 0 ? -6 : 1);
      rangeStart = new Date(refDate.setDate(diffToMonday));
      rangeStart.setUTCHours(0, 0, 0, 0);
      rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeStart.getDate() + 6);
      rangeEnd.setUTCHours(23, 59, 59, 999);
    } else if (period === 'year' || period === 'all' || period === 'school_year') {
      const yearStart = targetClass.school_year?.start_date;
      const yearEnd = targetClass.school_year?.end_date;
      rangeStart = yearStart ? new Date(yearStart) : new Date(Date.UTC(now.getFullYear(), 8, 1));
      rangeEnd = yearEnd ? new Date(yearEnd) : now;
    } else if (period === 'semester') {
      const sem1Start = targetClass.school_year?.semester1_start_date || targetClass.school_year?.start_date;
      const sem1End = targetClass.school_year?.semester1_end_date;
      const sem2Start = targetClass.school_year?.semester2_start_date;
      const sem2End = targetClass.school_year?.semester2_end_date || targetClass.school_year?.end_date;

      const isSem2 = String(semester) === '2' || (date && sem2Start && new Date(date) >= new Date(sem2Start));
      if (isSem2 && sem2Start) {
        rangeStart = new Date(sem2Start);
        rangeEnd = sem2End ? new Date(sem2End) : now;
      } else if (sem1Start) {
        rangeStart = new Date(sem1Start);
        rangeEnd = sem1End ? new Date(sem1End) : now;
      } else {
        rangeStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        rangeEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
      }
    } else {
      // Default: Month
      const targetMonth = month ? parseInt(month, 10) : (date ? new Date(date).getMonth() + 1 : now.getMonth() + 1);
      const targetYear = year ? parseInt(year, 10) : (date ? new Date(date).getFullYear() : now.getFullYear());
      rangeStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0, 0));
      rangeEnd = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));
    }

    // 2. Fetch active students in class
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClass.class_id,
        status: { notIn: ['DROPPED_OUT', 'TRANSFERRED_SCHOOL'] },
        student: { deleted_at: null },
      },
      include: {
        student: true,
      },
      orderBy: { student: { student_code: 'asc' } },
    });
    const totalStudents = enrollments.length;

    // 3. Query attendance records in period
    const records = await prisma.attendance.findMany({
      where: {
        class_id: targetClass.class_id,
        date: { gte: rangeStart, lte: rangeEnd },
        deleted_at: null,
      },
      orderBy: { date: 'asc' },
    });

    // 4. Compute totals
    let presentCount = 0;
    let excusedCount = 0;
    let unexcusedCount = 0;
    const dailyMap = new Map();
    const studentMap = new Map();

    for (const enr of enrollments) {
      studentMap.set(enr.student_id, {
        id: enr.student_id,
        publicId: enr.student.public_id,
        studentCode: enr.student.student_code,
        fullName: enr.student.full_name,
        gender: enr.student.gender,
        avatarUrl: enr.student.avatar_url,
        presentCount: 0,
        excusedCount: 0,
        unexcusedCount: 0,
        total: 0,
        presentRate: 100,
      });
    }

    for (const r of records) {
      const dStr = r.date.toISOString().slice(0, 10);
      if (!dailyMap.has(dStr)) {
        dailyMap.set(dStr, {
          date: dStr,
          presentCount: 0,
          excusedCount: 0,
          unexcusedCount: 0,
          total: 0,
        });
      }
      const dayStat = dailyMap.get(dStr);
      dayStat.total++;

      if (studentMap.has(r.student_id)) {
        studentMap.get(r.student_id).total++;
      }

      if (r.status === 'PRESENT') {
        presentCount++;
        dayStat.presentCount++;
        if (studentMap.has(r.student_id)) {
          studentMap.get(r.student_id).presentCount++;
        }
      } else if (r.status === 'EXCUSED_ABSENCE') {
        excusedCount++;
        dayStat.excusedCount++;
        if (studentMap.has(r.student_id)) {
          studentMap.get(r.student_id).excusedCount++;
        }
      } else if (r.status === 'UNEXCUSED_ABSENCE') {
        unexcusedCount++;
        dayStat.unexcusedCount++;
        if (studentMap.has(r.student_id)) {
          studentMap.get(r.student_id).unexcusedCount++;
        }
      }
    }

    for (const s of studentMap.values()) {
      s.presentRate = s.total > 0 ? Math.round((s.presentCount / s.total) * 100) : 100;
    }
    const studentsSummary = Array.from(studentMap.values());

    const totalLoggedDays = dailyMap.size;
    const totalRecordedSlots = presentCount + excusedCount + unexcusedCount;
    const presentRate = totalRecordedSlots > 0 ? Math.round((presentCount / totalRecordedSlots) * 100) : 100;

    const dailyTrend = Array.from(dailyMap.values()).map((d) => {
      const dt = new Date(`${d.date}T00:00:00.000Z`);
      const dayNum = dt.getUTCDay();
      const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      const dayRate = d.total > 0 ? Math.round((d.presentCount / d.total) * 100) : 0;
      return {
        date: d.date,
        dateFormatted: `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`,
        dayOfWeek: dayNames[dayNum],
        totalStudents,
        totalRecorded: d.total,
        presentCount: d.presentCount,
        excusedCount: d.excusedCount,
        unexcusedCount: d.unexcusedCount,
        presentRate: dayRate,
      };
    });

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        ageGroup: targetClass.age_group,
        schoolYear: targetClass.school_year?.name,
      },
      periodInfo: {
        period,
        startDate: rangeStart.toISOString().slice(0, 10),
        endDate: rangeEnd.toISOString().slice(0, 10),
      },
      totalStudents,
      stats: {
        totalLoggedDays,
        totalRecordedSlots,
        presentCount,
        excusedCount,
        unexcusedCount,
        presentRate,
        absentCount: excusedCount + unexcusedCount,
      },
      dailyTrend,
      studentsSummary,
    };
  }
}

export const attendanceService = new AttendanceService();
export default attendanceService;
