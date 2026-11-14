import prisma from '../config/prisma.js';
import { NotFound, BadRequest } from '../utils/http-error.js';
import { TIMETABLE_DAYS } from './mock-data.js';
import { calculateWhoAssessment, getClassificationFromZScores } from '../utils/who-calculator.js';
import {
  createStandardWorkbook,
  addSchoolHeaderBanner,
  applyHeaderStyles,
  applyZebraRows,
  autoFitColumns,
  formatDateDMY,
} from '../utils/excel.helper.js';

class HealthService {
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
    if (/^\d+$/.test(str)) {
      return prisma.student.findFirst({
        where: { student_id: BigInt(str), deleted_at: null },
      });
    }
    return prisma.student.findFirst({
      where: { student_code: str, deleted_at: null },
    });
  }

  /**
   * Get health overview & timetable for class querying live PostgreSQL
   */
  async getHealthOverview({ classId, week = '12/10 - 18/10/2026', date }) {
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
    const targetDateStart = new Date(`${targetDateStr}T00:00:00.000Z`);
    const targetDateEnd = new Date(`${targetDateStr}T23:59:59.999Z`);

    // 2. Fetch enrolled students active on targetDate
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

    const existingAtts = await prisma.attendance.findMany({
      where: {
        class_id: targetClass.class_id,
        date: { gte: targetDateStart, lte: targetDateEnd },
        deleted_at: null,
      },
      select: { student_id: true, status: true, notes: true, absence_reason: true },
    });
    const existingAttMap = new Map();
    existingAtts.forEach((a) => {
      existingAttMap.set(a.student_id.toString(), a);
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
      const evaluation = getClassificationFromZScores({
        heightZ: h?.height_for_age_zscore,
        weightZ: h?.weight_for_age_zscore,
        bmiZ: h?.bmi_for_age_zscore,
        bmiVal: bmiVal,
      });

      const att = existingAttMap.get(st.student_id.toString());
      const isAbsent = att
        ? att.status === 'EXCUSED_ABSENCE' || att.status === 'UNEXCUSED_ABSENCE' || att.status === 'ABSENT'
        : false;
      const attStatus = att ? att.status : 'PRESENT';

      return {
        id: st.public_id || st.student_id.toString(),
        code: st.student_code,
        name: st.full_name,
        gender: st.gender,
        status: attStatus,
        rawStatus: attStatus,
        isAbsent,
        height: heightVal,
        weight: weightVal,
        bmi: bmiVal,
        classification: evaluation.label,
        classificationColor: evaluation.color,
        classificationStatus: evaluation.status,
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
  async saveHealthRecords({ classId, date, records, recordedBy }) {
    const targetDateStr = date || new Date().toISOString().slice(0, 10);
    const targetDateStart = new Date(`${targetDateStr}T00:00:00.000Z`);
    const targetDateEnd = new Date(`${targetDateStr}T23:59:59.999Z`);
    const targetDate = targetDateStart;

    const now = new Date();
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    if (targetDate > todayEnd) {
      throw new BadRequest('Không được thực hiện đo trong thời gian tương lai');
    }

    let savedCount = 0;

    let recorderId = null;
    if (recordedBy) {
      const str = String(recordedBy).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (isUuid) {
        const acc = await prisma.account.findFirst({
          where: { public_id: str, deleted_at: null },
          select: { account_id: true },
        });
        if (acc) recorderId = acc.account_id;
      } else if (/^\d+$/.test(str)) {
        recorderId = BigInt(str);
      }
    }
    if (!recorderId) {
      const anyStaff = await prisma.account.findFirst({
        where: { role: { in: ['PRINCIPAL_BGH', 'TEACHER_GV'] }, deleted_at: null },
        select: { account_id: true },
      });
      recorderId = anyStaff?.account_id || 1n;
    }

    if (Array.isArray(records) && records.length > 0) {
      for (const rec of records) {
        const rawId = rec.studentId || rec.id;
        const student = await this._resolveStudent(rawId);
        if (!student) continue;

        const sId = student.student_id;
        const isAbsent = Boolean(
          rec.isAbsent ||
          rec.status === 'ABSENT' ||
          rec.status === 'EXCUSED_ABSENCE' ||
          rec.status === 'UNEXCUSED_ABSENCE' ||
          rec.rawStatus === 'EXCUSED_ABSENCE' ||
          rec.rawStatus === 'UNEXCUSED_ABSENCE'
        );

        const rawHeight =
          rec.height !== undefined && rec.height !== null && rec.height !== ''
            ? Number(rec.height)
            : null;
        const rawWeight =
          rec.weight !== undefined && rec.weight !== null && rec.weight !== ''
            ? Number(rec.weight)
            : null;

        const isExamined =
          !isAbsent &&
          rawHeight !== null &&
          !isNaN(rawHeight) &&
          rawHeight > 0 &&
          rawWeight !== null &&
          !isNaN(rawWeight) &&
          rawWeight > 0;

        // Nếu học sinh vắng hoặc không khám sức khỏe trong ngày này:
        if (!isExamined) {
          const existing = await prisma.healthAssessment.findFirst({
            where: {
              student_id: sId,
              assessment_date: {
                gte: targetDateStart,
                lte: targetDateEnd,
              },
              deleted_at: null,
            },
          });
          if (existing) {
            await prisma.healthAssessment.delete({
              where: { assessment_id: existing.assessment_id },
            });
          }
          // Bỏ qua, không lưu bản ghi giả
          continue;
        }

        // Với học sinh có khám, kiểm tra giới hạn chiều cao & cân nặng
        if (rawHeight <= 0 || rawHeight > 150) {
          throw new BadRequest(`Chiều cao phải lớn hơn 0 và không vượt quá 150 cm (${student.full_name})`);
        }
        if (rawWeight <= 0 || rawWeight > 50) {
          throw new BadRequest(`Cân nặng phải lớn hơn 0 và không vượt quá 50 kg (${student.full_name})`);
        }

        const height = rawHeight;
        const weight = rawWeight;
        const note = rec.note || rec.notes || null;
        const fallbackBmi = Number((weight / ((height / 100) ** 2)).toFixed(2));
        const whoRes = await calculateWhoAssessment({
          gender: student.gender,
          dateOfBirth: student.date_of_birth,
          dateOfMeasurement: targetDate,
          height,
          weight,
        });

        const computedBmi = whoRes?.bmi ?? fallbackBmi;
        const hz = whoRes?.zscores?.heightForAge ?? null;
        const wz = whoRes?.zscores?.weightForAge ?? null;
        const bz = whoRes?.zscores?.bmiForAge ?? null;

        const existing = await prisma.healthAssessment.findFirst({
          where: {
            student_id: sId,
            assessment_date: {
              gte: targetDateStart,
              lte: targetDateEnd,
            },
            deleted_at: null,
          },
        });

        if (existing) {
          await prisma.healthAssessment.update({
            where: { assessment_id: existing.assessment_id },
            data: {
              height,
              weight,
              bmi: computedBmi,
              height_for_age_zscore: hz,
              weight_for_age_zscore: wz,
              bmi_for_age_zscore: bz,
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
              bmi: computedBmi,
              height_for_age_zscore: hz,
              weight_for_age_zscore: wz,
              bmi_for_age_zscore: bz,
              notes: note,
              recorded_by: recorderId,
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

  /**
   * Xuất danh sách theo dõi sức khỏe & thể lực ra Excel
   */
  async exportHealthExcel({ classId, schoolYearId, date }) {
    let targetClass = null;
    if (classId) {
      targetClass = await this._resolveClass(classId);
      if (!targetClass) {
        throw new NotFound('Không tìm thấy lớp học yêu cầu.');
      }
    }

    let records = [];

    if (targetClass) {
      const enrollments = await prisma.studentEnrollment.findMany({
        where: {
          class_id: targetClass.class_id,
          status: { notIn: ['TRANSFERRED_SCHOOL', 'DROPPED_OUT'] },
          student: { deleted_at: null },
        },
        include: {
          student: {
            include: {
              health_assessments: {
                where: {
                  deleted_at: null,
                  ...(date ? { assessment_date: new Date(`${date}T00:00:00.000Z`) } : {}),
                },
                orderBy: { assessment_date: 'desc' },
              },
            },
          },
        },
        orderBy: { student: { student_code: 'asc' } },
      });

      for (const enr of enrollments) {
        const st = enr.student;
        const assessments = st.health_assessments || [];
        if (assessments.length === 0) {
          records.push({
            student: st,
            assessment: null,
            className: targetClass.name,
          });
        } else {
          for (const a of assessments) {
            records.push({
              student: st,
              assessment: a,
              className: targetClass.name,
            });
          }
        }
      }
    } else {
      const assessments = await prisma.healthAssessment.findMany({
        where: {
          deleted_at: null,
          ...(date ? { assessment_date: new Date(`${date}T00:00:00.000Z`) } : {}),
        },
        include: {
          student: {
            include: {
              student_enrollments: {
                where: { status: { notIn: ['TRANSFERRED_SCHOOL', 'DROPPED_OUT'] } },
                include: { class: true },
                take: 1,
              },
            },
          },
        },
        orderBy: [{ assessment_date: 'desc' }, { student: { student_code: 'asc' } }],
      });

      records = assessments.map((a) => ({
        student: a.student,
        assessment: a,
        className: a.student?.student_enrollments?.[0]?.class?.name || 'Chưa xếp lớp',
      }));
    }

    const { workbook, worksheet } = createStandardWorkbook('Theo dõi sức khỏe');

    const title = targetClass
      ? `SỔ THEO DÕI SỨC KHỎE & THỂ LỰC - LỚP ${targetClass.name.toUpperCase()}`
      : 'SỔ THEO DÕI SỨC KHỎE & THỂ LỰC TOÀN TRƯỜNG';
    const subtitle = `Năm học: ${targetClass?.school_year?.name || 'Hiện tại'} | Đơn vị: Trường Mầm non Sorak | Ngày xuất: ${formatDateDMY(new Date())} | Tổng cộng: ${records.length} bản ghi`;

    const totalCols = 17;
    const startRow = addSchoolHeaderBanner(worksheet, { title, subtitle, totalCols });

    const headerRow = worksheet.addRow([
      'STT',
      'Mã học sinh',
      'Họ và tên',
      'Ngày sinh',
      'Giới tính',
      'Lớp',
      'Ngày đo',
      'Chiều cao (cm)',
      'Cân nặng (kg)',
      'Chỉ số BMI',
      'HAZ (Chiều cao/tuổi)',
      'Đánh giá chiều cao',
      'WAZ (Cân nặng/tuổi)',
      'Đánh giá cân nặng',
      'BAZ (BMI/tuổi)',
      'Thể trạng dinh dưỡng',
      'Ghi chú / Lời dặn y tế',
    ]);
    applyHeaderStyles(headerRow);

    records.forEach((item, index) => {
      const st = item.student;
      const h = item.assessment;

      let hazStr = '—';
      let wazStr = '—';
      let bazStr = '—';
      let heightEval = '—';
      let weightEval = '—';
      let overallEval = 'Chưa có số đo';
      let statusColor = 'NORMAL';

      if (h) {
        const heightZ = h.height_for_age_zscore != null ? Number(h.height_for_age_zscore) : null;
        const weightZ = h.weight_for_age_zscore != null ? Number(h.weight_for_age_zscore) : null;
        const bmiZ = h.bmi_for_age_zscore != null ? Number(h.bmi_for_age_zscore) : null;
        const bmiVal = Number(h.bmi);

        hazStr = heightZ != null ? heightZ.toFixed(2) : '—';
        wazStr = weightZ != null ? weightZ.toFixed(2) : '—';
        bazStr = bmiZ != null ? bmiZ.toFixed(2) : '—';

        if (heightZ != null) {
          if (heightZ < -3) heightEval = 'Thấp còi độ 2';
          else if (heightZ < -2) heightEval = 'Thấp còi độ 1';
          else if (heightZ > 2) heightEval = 'Cao hơn so với tuổi';
          else heightEval = 'Bình thường';
        }

        if (weightZ != null) {
          if (weightZ < -3) weightEval = 'Suy dinh dưỡng nặng';
          else if (weightZ < -2) weightEval = 'Suy dinh dưỡng vừa';
          else if (weightZ > 2) weightEval = 'Cân nặng cao hơn tuổi';
          else weightEval = 'Bình thường';
        }

        const evaluation = getClassificationFromZScores({
          heightZ,
          weightZ,
          bmiZ,
          bmiVal,
        });

        overallEval = evaluation.label || 'Bình thường';
        statusColor = evaluation.status || 'NORMAL';
      }

      const row = worksheet.addRow([
        index + 1,
        st.student_code || '',
        st.full_name || `${st.last_name || ''} ${st.first_name || ''}`.trim(),
        st.dob ? formatDateDMY(st.dob) : '',
        st.gender === 'MALE' ? 'Nam' : 'Nữ',
        item.className,
        h ? formatDateDMY(h.assessment_date) : 'Chưa đo',
        h ? Number(h.height) : '—',
        h ? Number(h.weight) : '—',
        h ? Number(h.bmi) : '—',
        hazStr,
        heightEval,
        wazStr,
        weightEval,
        bazStr,
        overallEval,
        h?.notes || 'Bình thường',
      ]);

      if (statusColor === 'SEVERE') {
        row.getCell(16).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' },
        };
        row.getCell(16).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
      } else if (statusColor === 'MODERATE' || statusColor === 'UNDERWEIGHT' || statusColor === 'RISK_OVERWEIGHT') {
        row.getCell(16).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' },
        };
        row.getCell(16).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB45309' } };
      }
    });

    applyZebraRows(worksheet, startRow + 1, records.length);
    autoFitColumns(worksheet);

    return await workbook.xlsx.writeBuffer();
  }
}

export const healthService = new HealthService();
export default healthService;
