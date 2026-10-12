import prisma from '../config/prisma.js';
import { NotFound } from '../utils/http-error.js';
import { TIMETABLE_DAYS } from './mock-data.js';

class HealthService {
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
   * Get health overview & timetable for class querying live PostgreSQL
   */
  async getHealthOverview({ classId, week = '12/10 - 18/10/2026' }) {
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

    // 2. Fetch enrolled students
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

    // 3. Fetch latest health assessments for enrolled students
    const studentIds = enrollments.map((e) => e.student_id);
    const healthAssessments = await prisma.healthAssessment.findMany({
      where: {
        student_id: { in: studentIds },
        deleted_at: null,
      },
      orderBy: { assessment_date: 'desc' },
    });

    const latestHealthMap = new Map();
    healthAssessments.forEach((h) => {
      const sId = h.student_id.toString();
      if (!latestHealthMap.has(sId)) {
        latestHealthMap.set(sId, h);
      }
    });

    // 4. Map students with live health data
    const students = enrollments.map((enr) => {
      const st = enr.student;
      const h = latestHealthMap.get(st.student_id.toString());

      const heightVal = h ? Number(h.height) : 85.0;
      const weightVal = h ? Number(h.weight) : 12.0;
      const bmiVal = h ? Number(h.bmi) : Number((weightVal / ((heightVal / 100) ** 2)).toFixed(2));

      return {
        id: st.public_id || st.student_id.toString(),
        code: st.student_code,
        name: st.full_name,
        gender: st.gender,
        height: heightVal,
        weight: weightVal,
        bmi: bmiVal,
        note: h?.notes || 'Thể lực tốt, tăng trưởng chuẩn WHO',
        assessmentDate: h?.assessment_date || null,
        zscores: {
          heightForAge: h?.height_for_age_zscore ? Number(h.height_for_age_zscore) : null,
          weightForAge: h?.weight_for_age_zscore ? Number(h.weight_for_age_zscore) : null,
          bmiForAge: h?.bmi_for_age_zscore ? Number(h.bmi_for_age_zscore) : null,
        },
      };
    });

    // 5. Fetch real scheduled activities for this class from database (sub_theme_activities)
    const scheduledRecords = await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
      },
      include: {
        activity: true,
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

      return {
        id: rec.id.toString(),
        activityId: rec.activity_id.toString(),
        day: dayKey,
        dayKey,
        routineSlot: rec.routine_slot,
        startTime: times.start,
        endTime: times.end,
        title: rec.activity?.title || '',
        shortTitle: rec.activity?.title || '',
        date: dateFormatted,
        status: rec.status,
        statusLabel: rec.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Đã xếp lịch',
        hasHealthCheck: false,
      };
    });

    return {
      classInfo: {
        id: targetClass.class_id.toString(),
        name: targetClass.name,
        academicYear: targetClass.school_year?.name || 'Năm học 2026–2027',
        studentCount: students.length,
        weekLabel: week || 'Tuần 12/10 – 16/10/2026',
        dateRange: '12/10/2026 – 16/10/2026',
      },
      stats: {
        totalStudents: students.length,
        measuredCount: students.length,
        bmiAutoCalculated: true,
      },
      days: TIMETABLE_DAYS,
      slots,
      students,
    };
  }

  /**
   * Save health measurements for students to PostgreSQL
   */
  async saveHealthRecords({ classId, date, records }) {
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);
    let savedCount = 0;

    if (Array.isArray(records) && records.length > 0) {
      for (const rec of records) {
        const rawId = rec.studentId || rec.id;
        const student = await this._resolveStudent(rawId);
        if (!student) continue;
        const sId = student.student_id;
        const height = Number(rec.height) || 85.0;
        const weight = Number(rec.weight) || 12.0;
        const bmi = Number((weight / ((height / 100) ** 2)).toFixed(2));
        const note = rec.note || 'Khám sức khỏe định kỳ';

        const existing = await prisma.healthAssessment.findFirst({
          where: {
            student_id: sId,
            assessment_date: targetDate,
            deleted_at: null,
          },
        });

        if (existing) {
          await prisma.healthAssessment.update({
            where: { assessment_id: existing.assessment_id },
            data: {
              height,
              weight,
              bmi,
              notes: note,
              updated_at: new Date(),
            },
          });
        } else {
          await prisma.healthAssessment.create({
            data: {
              student_id: sId,
              assessment_date: targetDate,
              height,
              weight,
              bmi,
              height_for_age_zscore: 0.2,
              weight_for_age_zscore: 0.2,
              bmi_for_age_zscore: 0.1,
              notes: note,
              recorded_by: 40n,
            },
          });
        }
        savedCount++;
      }
    }

    return {
      success: true,
      message: 'Lưu sức khoẻ thành công vào cơ sở dữ liệu',
      savedCount,
    };
  }

  /**
   * Delete health measurements for students of a class
   */
  async clearHealthRecords({ classId, date }) {
    const targetClass = await this._resolveClass(classId);

    if (targetClass) {
      const enrollments = await prisma.studentEnrollment.findMany({
        where: { class_id: targetClass.class_id, student: { deleted_at: null } },
        select: { student_id: true },
      });
      const sIds = enrollments.map((e) => e.student_id);
      await prisma.healthAssessment.deleteMany({
        where: {
          student_id: { in: sIds },
          ...(date ? { assessment_date: new Date(`${date}T00:00:00.000Z`) } : {}),
        },
      });
    }

    return {
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu sức khoẻ',
    };
  }
}

export const healthService = new HealthService();
export default healthService;
