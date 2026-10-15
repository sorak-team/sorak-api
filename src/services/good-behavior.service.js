import prisma from '../config/prisma.js';
import { NotFound } from '../utils/http-error.js';

class GoodBehaviorService {
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
   * Get weekly good behavior (Phiếu bé ngoan) overview querying live PostgreSQL
   */
  async getGoodBehaviorOverview({ classId, week = 'Tuần 41 · 12/10–16/10/2026' }) {
    // 1. Resolve class
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

    // 3. Fetch monthly assessments for Month 10 / 2026
    const monthlyRecords = await prisma.monthlyAssessment.findMany({
      where: {
        class_id: targetClass.class_id,
        month: 10,
        year: 2026,
      },
    });

    const monthlyMap = new Map();
    monthlyRecords.forEach((m) => {
      monthlyMap.set(m.student_id.toString(), m);
    });

    const students = enrollments.map((enr) => {
      const st = enr.student;
      const m = monthlyMap.get(st.student_id.toString());
      const roses = m ? (m.roses_count ?? 0) : 0;
      const starRating = m ? Math.min(5, Math.max(1, roses)) : 0;
      const status = m ? 'Hoàn thành' : 'Chưa đánh giá';
      const statusCode = m ? 'COMPLETED' : 'UNRATED';

      return {
        id: st.public_id || st.student_id.toString(),
        code: st.student_code,
        name: st.full_name,
        gender: st.gender,
        starRating,
        status,
        statusCode,
        comment: m?.teacher_notes || '',
        roses: {
          week1: Boolean(m?.week_1_rose),
          week2: Boolean(m?.week_2_rose),
          week3: Boolean(m?.week_3_rose),
          week4: Boolean(m?.week_4_rose),
        },
      };
    });

    return {
      classInfo: {
        id: targetClass.public_id || targetClass.class_id.toString(),
        name: targetClass.name,
        academicYear: targetClass.school_year?.name || 'Năm học 2026–2027',
        week: week || 'Tuần 41 · 12/10–16/10/2026',
      },
      stats: {
        studentCount: students.length,
        teacherCount: 2,
        transferCount: 0,
      },
      ratingLegend: [
        { stars: 1, label: 'Còn cần cố gắng hơn' },
        { stars: 2, label: 'Con thể hiện ở mức cơ bản' },
        { stars: 3, label: 'Con đạt yêu cầu' },
        { stars: 4, label: 'Con thể hiện tốt' },
        { stars: 5, label: 'Con thể hiện rất tốt' },
      ],
      students,
    };
  }

  /**
   * Save good behavior certificate rating / comment to PostgreSQL
   */
  async saveGoodBehaviorRecords({ classId, records }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) {
      throw new NotFound('Lớp học không tồn tại hoặc mã định danh không hợp lệ');
    }
    const cId = targetClass.class_id;
    let savedCount = 0;

    if (Array.isArray(records) && records.length > 0) {
      for (const rec of records) {
        const rawId = rec.studentId || rec.id;
        const student = await this._resolveStudent(rawId);
        if (!student) continue;
        const sId = student.student_id;
        const comment = rec.comment || 'Con đạt phiếu bé ngoan';
        const stars = Number(rec.starRating) || 3;

        const existing = await prisma.monthlyAssessment.findFirst({
          where: {
            student_id: sId,
            month: 10,
            year: 2026,
          },
        });

        if (existing) {
          await prisma.monthlyAssessment.update({
            where: { monthly_assessment_id: existing.monthly_assessment_id },
            data: {
              teacher_notes: comment,
              roses_count: stars,
              updated_at: new Date(),
            },
          });
        } else {
          await prisma.monthlyAssessment.create({
            data: {
              student_id: sId,
              class_id: cId,
              month: 10,
              year: 2026,
              roses_count: stars,
              teacher_notes: comment,
              evaluated_by: 40n,
            },
          });
        }
        savedCount++;
      }
    }

    return {
      success: true,
      message: 'Lưu phiếu bé ngoan thành công vào cơ sở dữ liệu',
      savedCount,
    };
  }
}

export const goodBehaviorService = new GoodBehaviorService();
export default goodBehaviorService;export class GoodBehaviorService {

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

}
export const goodBehaviorService = new GoodBehaviorService();
export default goodBehaviorService;
