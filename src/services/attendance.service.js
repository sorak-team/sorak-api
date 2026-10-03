import prisma from '../config/prisma.js';
import { BadRequest, NotFound } from '../utils/http-error.js';
import { TIMETABLE_DAYS, TIMETABLE_SLOTS } from './mock-data.js';

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
    if (!isUuid) return null;
    return prisma.class.findFirst({
      where: { public_id: str, deleted_at: null },
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

  /**
   * Update student attendance status for a slot/date with live PostgreSQL persistence
   */
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

  /**
   * Delete attendance records for a class on a specific date
   */
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

  /**
   * Get child dismissal overview for a class and date
   * Pre-loads attendance check-in status, parents (can_pickup), and approved pickup authorizations
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

    // 2. Fetch enrolled students with their parents and active pickup authorizations
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClass.class_id,
        student: { deleted_at: null },
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
        canPickup: p.can_pickup,
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

      let checkOutDate = now;
      if (rec.checkOutTime) {
        const parsed = new Date(rec.checkOutTime);
        if (!isNaN(parsed.getTime())) {
          checkOutDate = parsed;
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
    const cId = BigInt(classId || 5);
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);
    let sId;
    try {
      if (typeof studentId === 'string' && studentId.includes('-')) {
        const std = await prisma.student.findFirst({
          where: { public_id: studentId },
          select: { student_id: true },
        });
        sId = std ? std.student_id : BigInt(studentId);
      } else {
        sId = BigInt(studentId);
      }
    } catch {
      sId = BigInt(studentId);
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
    const cId = BigInt(classId || 5);
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

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClassId,
        student: { deleted_at: null },
      },
      select: { student_id: true },
    });
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
          },
        },
        authorizer: {
          select: {
            account_id: true,
            username: true,
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

      return {
        id: a.public_id || a.authorization_id.toString(),
        publicId: a.public_id,
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

    const sId = BigInt(studentId);
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);

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

    const aId = BigInt(authId);
    const updated = await prisma.pickupAuthorization.update({
      where: { authorization_id: aId },
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

    return {
      id: updated.authorization_id.toString(),
      status: updated.status,
      approvedAt: updated.approved_at,
      studentName: updated.student?.full_name,
    };
  }

  /**
   * Reject a pickup authorization with reason
   */
  async rejectPickupAuthorization({ classId, authId, accountId, reason }) {
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

    const aId = BigInt(authId);
    const updated = await prisma.pickupAuthorization.update({
      where: { authorization_id: aId },
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

    return {
      id: updated.authorization_id.toString(),
      status: updated.status,
      approvedAt: updated.approved_at,
      rejectedReason: updated.rejected_reason,
      studentName: updated.student?.full_name,
    };
  }
}

export const attendanceService = new AttendanceService();
export default attendanceService;export class AttendanceService {

  async _resolveClass(classId) {
      if (!classId) return null;
      const str = String(classId).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (!isUuid) return null;
      return prisma.class.findFirst({
        where: { public_id: str, deleted_at: null },
        include: { school_year: true },
      });
    }

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
  
      // 2. Fetch enrolled students with their parents and active pickup authorizations
      const enrollments = await prisma.studentEnrollment.findMany({
        where: {
          class_id: targetClass.class_id,
          student: { deleted_at: null },
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
          canPickup: p.can_pickup,
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
  
        let checkOutDate = now;
        if (rec.checkOutTime) {
          const parsed = new Date(rec.checkOutTime);
          if (!isNaN(parsed.getTime())) {
            checkOutDate = parsed;
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

  async cancelDismissal({ classId, date, studentId }) {
      const cId = BigInt(classId || 5);
      const targetDateStr = date || new Date().toISOString().slice(0, 10);
      const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);
      let sId;
      try {
        if (typeof studentId === 'string' && studentId.includes('-')) {
          const std = await prisma.student.findFirst({
            where: { public_id: studentId },
            select: { student_id: true },
          });
          sId = std ? std.student_id : BigInt(studentId);
        } else {
          sId = BigInt(studentId);
        }
      } catch {
        sId = BigInt(studentId);
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

  async clearAllDismissals({ classId, date }) {
      const cId = BigInt(classId || 5);
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
  
      const enrollments = await prisma.studentEnrollment.findMany({
        where: {
          class_id: targetClassId,
          student: { deleted_at: null },
        },
        select: { student_id: true },
      });
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
            },
          },
          authorizer: {
            select: {
              account_id: true,
              username: true,
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
  
        return {
          id: a.public_id || a.authorization_id.toString(),
          publicId: a.public_id,
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

}
export const attendanceService = new AttendanceService();
export default attendanceService;
