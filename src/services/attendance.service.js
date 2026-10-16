import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class AttendanceService {
  _parseId(id) {
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
  }

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

    // 2. Fetch enrolled students from database
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClass.class_id,
        student: { deleted_at: null },
      },
      include: {
        student: true,
      },
      orderBy: { student: { student_code: 'asc' } },
    });

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

    // 4. Resolve target date (e.g. today or requested date)
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    // 5. Fetch real attendance records for this class & date
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
        assessment_date: targetDate,
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
    const students = enrollments.map((enr) => {
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
        reason,
        note: reason,
        notes: reason,
        checkInTime: att?.check_in_time || null,
        checkOutTime: att?.check_out_time || null,
        pickupPerson: att?.pickup_person_name || '',
        height: h ? Number(h.height) : '',
        weight: h ? Number(h.weight) : '',
        bmi: h ? Number(h.bmi) : '',
        healthNote: h?.notes || '',
      };
    });

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
        subThemeId: rec.sub_theme_id.toString(),
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

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        academicYear: targetClass.school_year?.name || 'Năm học 2026–2027',
        studentCount: enrollments.length,
        weekLabel: week || 'Tuần 12/10 – 16/10/2026',
        dateRange: '12/10/2026 – 16/10/2026',
        selectedDate: targetDateStr,
      },
      stats: {
        totalStudents: enrollments.length,
        presentCount,
        absentCount,
        isRecorded: isDateRecorded,
        isHealthRecorded,
        isDismissalRecorded,
      },
      attendanceDays: attendedDateMap,
      healthDays: healthDateMap,
      dismissalDays: dismissalDateMap,
      days: TIMETABLE_DAYS,
      slots,
      students,
    };
  }

  async updateAttendance({ classId, date, records }) {
    const defaultDateStr = new Date().toISOString().slice(0, 10);
    const targetDate = date ? new Date(`${date}T00:00:00.000Z`) : new Date(`${defaultDateStr}T00:00:00.000Z`);
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
    }
    const cId = targetClass.class_id;

    if (Array.isArray(records) && records.length > 0) {
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
              check_in_by: 40n,
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

  async clearAttendance({ classId, date }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
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
}
export const attendanceService = new AttendanceService();
export default attendanceService;
