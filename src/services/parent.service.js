import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { NotFound, BadRequest, Forbidden } from '../utils/http-error.js';
import { validatePickupQuota, getStudentPickupQuotaInfo } from '../utils/pickup-quota.helper.js';
import logger from '../utils/logger.js';
import { notificationService } from './notification.service.js';
import { getClassificationFromZScores } from '../utils/who-calculator.js';
import { assessmentService } from './assessment.service.js';
import { classService } from './class.service.js';

function resolveAcademicWeekDates(weekId) {
  if (!weekId) return null;
  const startMonday = new Date(Date.UTC(2026, 8, 7)); // 07 Sep 2026
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

class ParentService {
  /**
   * Helper: Retrieve student connected to current authenticated parent account
   */
  async _getStudentForAccount(accountSub, targetStudentId = null) {
    const account = await prisma.account.findUnique({
      where: { public_id: accountSub },
      include: {
        student: {
          include: {
            parents: { where: { deleted_at: null } },
            student_enrollments: {
              orderBy: { enrolled_at: 'desc' },
              include: {
                class: {
                  include: {
                    school_year: true,
                    teacher_classes: {
                      where: { left_at: null },
                      include: { teacher: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!account || !account.is_active || account.deleted_at) {
      throw NotFound('Không tìm thấy tài khoản hợp lệ.');
    }

    if (!account.student) {
      throw Forbidden('Tài khoản này không liên kết với hồ sơ học sinh.');
    }

    let selectedStudent = account.student;
    if (
      targetStudentId &&
      targetStudentId !== account.student.public_id &&
      targetStudentId !== account.student.student_id.toString() &&
      targetStudentId !== account.student.student_code
    ) {
      // Check if targetStudentId belongs to a verified sibling
      const siblings = await this._getSiblingStudents(account.student);
      const isSibling = siblings.some(
        (s) =>
          s.id === targetStudentId ||
          s.studentCode === targetStudentId ||
          s.username === targetStudentId ||
          String(s.studentId) === targetStudentId
      );

      if (!isSibling) {
        throw Forbidden('Bạn không có quyền truy cập hồ sơ học sinh này.');
      }

      const siblingStudent = await prisma.student.findFirst({
        where: {
          OR: [
            { public_id: targetStudentId },
            { student_code: targetStudentId },
            ...( /^\d+$/.test(targetStudentId) ? [{ student_id: BigInt(targetStudentId) }] : [] ),
          ],
          deleted_at: null,
        },
        include: {
          parents: { where: { deleted_at: null } },
          student_enrollments: {
            orderBy: { enrolled_at: 'desc' },
            include: {
              class: {
                include: {
                  school_year: true,
                  teacher_classes: {
                    where: { left_at: null },
                    include: { teacher: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!siblingStudent) {
        throw NotFound('Không tìm thấy hồ sơ học sinh.');
      }
      selectedStudent = siblingStudent;
    }

    return { account, student: selectedStudent };
  }

  /**
   * Helper to retrieve verified sibling students via Citizen ID (CCCD)
   * OR verified parent phone (>= 9 digits) + parent full_name.
   * Prevents leaking unrelated students while maintaining real multi-child families in DB.
   */
  async _getSiblingStudents(student) {
    if (!student) return [];
    const validCccds = (student.parents || [])
      .map((p) => p.citizen_id?.trim())
      .filter((cccd) => cccd && cccd.length >= 9 && cccd !== '000000000000');

    const validParents = (student.parents || [])
      .filter((p) => {
        const ph = p.phone ? p.phone.replace(/\D/g, '') : '';
        const fn = p.full_name?.trim();
        return ph && ph.length >= 9 && ph !== '0000000000' && fn && fn.length >= 2;
      })
      .map((p) => ({
        phone: p.phone.replace(/\D/g, ''),
        fullName: p.full_name.trim(),
      }));

    const orConditions = [];
    if (validCccds.length > 0) {
      orConditions.push({
        parents: {
          some: {
            citizen_id: { in: validCccds },
            deleted_at: null,
          },
        },
      });
    }

    if (validParents.length > 0) {
      for (const vp of validParents) {
        orConditions.push({
          parents: {
            some: {
              phone: vp.phone,
              full_name: { equals: vp.fullName, mode: 'insensitive' },
              deleted_at: null,
            },
          },
        });
      }
    }

    let siblingRecords = [];
    if (orConditions.length > 0) {
      siblingRecords = await prisma.student.findMany({
        where: {
          deleted_at: null,
          OR: orConditions,
        },
        include: {
          student_enrollments: {
            where: { left_at: null },
            include: {
              class: true,
            },
          },
          account: true,
        },
      });
    }

    if (siblingRecords.length === 0) {
      const activeEnr = student.student_enrollments?.[0];
      return [
        {
          id: student.public_id,
          studentCode: student.student_code,
          fullName: student.full_name,
          avatarUrl: student.avatar_url,
          className: activeEnr?.class?.name || null,
          classId: activeEnr?.class?.public_id || null,
          isCurrent: true,
          username: student.account?.username || null,
        },
      ];
    }

    return siblingRecords.map((s) => {
      const activeEnr = s.student_enrollments?.[0];
      return {
        id: s.public_id,
        studentCode: s.student_code,
        fullName: s.full_name,
        avatarUrl: s.avatar_url,
        className: activeEnr?.class?.name || null,
        classId: activeEnr?.class?.public_id || null,
        isCurrent: s.student_id === student.student_id,
        username: s.account?.username || null,
      };
    });
  }

  /**
   * Helper: Calculate BMI category based on WHO standards for children
   */
  _calculateBmiCategory(bmi, zscores = {}) {
    return getClassificationFromZScores({
      heightZ: zscores.heightZ ?? zscores.height_for_age_zscore,
      weightZ: zscores.weightZ ?? zscores.weight_for_age_zscore,
      bmiZ: zscores.bmiZ ?? zscores.bmi_for_age_zscore,
      bmiVal: bmi,
    });
  }

  /**
   * 1. GET /parent/home
   * Comprehensive Dashboard overview for the active child
   */
  async getHomeData(accountSub, classPublicId = null) {
    const { account, student } = await this._getStudentForAccount(accountSub);

    const enrollments = (student.student_enrollments || []).map((e) => ({
      classId: e.class?.public_id,
      className: e.class?.name,
      ageGroup: e.class?.age_group,
      schoolYear: e.class?.school_year?.name,
      status: e.status,
      isCurrent: !e.left_at,
      enrolledAt: e.enrolled_at,
      leftAt: e.left_at,
    }));

    let selectedEnrollment = null;
    if (classPublicId) {
      selectedEnrollment = student.student_enrollments?.find(
        (e) => e.class?.public_id === classPublicId,
      );
    }
    if (!selectedEnrollment) {
      selectedEnrollment =
        student.student_enrollments?.find((e) => !e.left_at) ||
        student.student_enrollments?.[0];
    }

    const homeroomClass = selectedEnrollment?.class;
    const isHistorical = Boolean(selectedEnrollment?.left_at || selectedEnrollment?.status === 'COMPLETED');
    const primaryTeacher =
      homeroomClass?.teacher_classes?.find((tc) => !tc.left_at)?.teacher ||
      homeroomClass?.teacher_classes?.[0]?.teacher;

    // Calculate Child Age
    const birthDate = new Date(student.date_of_birth);
    const today = new Date();
    let ageYears = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      ageYears--;
    }
    const ageString = ageYears > 0 ? `${ageYears} tuổi` : `${Math.max(1, monthDiff + 12)} tháng`;

    // 1. Today's Attendance
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Check if today is a school holiday
    let todayHoliday = null;
    try {
      const syId = homeroomClass?.school_year_id;
      if (syId) {
        const holidayRecord = await prisma.schoolHoliday.findFirst({
          where: {
            school_year_id: syId,
            deleted_at: null,
            start_date: { lte: todayEnd },
            end_date: { gte: todayStart },
          },
        });
        if (holidayRecord) {
          const isExplicitEvent = (holidayRecord.description || '').includes('[SỰ KIỆN]') || (holidayRecord.description || '').includes('[EVENT]');
          const itemType = isExplicitEvent ? 'EVENT' : (holidayRecord.is_teaching_allowed ? 'EVENT' : 'HOLIDAY');
          todayHoliday = {
            id: holidayRecord.public_id || holidayRecord.holiday_id.toString(),
            name: holidayRecord.name,
            startDate: holidayRecord.start_date.toISOString().slice(0, 10),
            endDate: holidayRecord.end_date.toISOString().slice(0, 10),
            makeupDate: holidayRecord.makeup_date ? holidayRecord.makeup_date.toISOString().slice(0, 10) : null,
            isTeachingAllowed: holidayRecord.is_teaching_allowed,
            type: itemType,
            description: holidayRecord.description,
          };
        }
      }
    } catch (e) {
      logger.warn({ error: e.message }, 'Failed to check today holiday for parent home');
    }

    const todayAttendance = await prisma.attendance.findFirst({
      where: {
        student_id: student.student_id,
        date: { gte: todayStart, lte: todayEnd },
      },
    });

    // 2. Monthly Attendance Rate (Current month)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthAttendances = await prisma.attendance.findMany({
      where: {
        student_id: student.student_id,
        date: { gte: monthStart, lte: todayEnd },
      },
    });

    const presentDays = monthAttendances.filter((a) => a.status === 'PRESENT').length;
    // Estimated weekdays passed this month
    let weekdaysCount = 0;
    const cur = new Date(monthStart);
    while (cur <= today) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) weekdaysCount++;
      cur.setDate(cur.getDate() + 1);
    }
    const totalWorkingDays = Math.max(1, weekdaysCount);
    const attendanceRate = Math.min(100, Math.round((presentDays / totalWorkingDays) * 100));

    // 3. Active Pickup Authorizations
    const activeAuthorizations = await prisma.pickupAuthorization.findMany({
      where: {
        student_id: student.student_id,
        status: 'APPROVED',
        start_date: { lte: todayEnd },
        end_date: { gte: todayStart },
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    // 4. Good Behavior Snapshot (Current or previous month)
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    let monthlyAssessment = await prisma.monthlyAssessment.findFirst({
      where: {
        student_id: student.student_id,
        month: currentMonth,
        year: currentYear,
      },
      include: { evaluator: { include: { teacher: true } } },
    });

    if (!monthlyAssessment && currentMonth > 1) {
      monthlyAssessment = await prisma.monthlyAssessment.findFirst({
        where: {
          student_id: student.student_id,
          month: currentMonth - 1,
          year: currentYear,
        },
        include: { evaluator: { include: { teacher: true } } },
      });
    }

    // Determine current week of month (1 to 5)
    const dayOfMonth = today.getDate();
    const currentWeekNum = Math.min(5, Math.max(1, Math.ceil(dayOfMonth / 7)));
    const hasCurrentWeekRose = Boolean(monthlyAssessment?.[`week_${currentWeekNum}_rose`]);

    // 5. Latest Health Assessment
    const latestHealth = await prisma.healthAssessment.findFirst({
      where: {
        student_id: student.student_id,
        deleted_at: null,
      },
      orderBy: { assessment_date: 'desc' },
    });

    const bmiInfo = this._calculateBmiCategory(latestHealth?.bmi, {
      heightZ: latestHealth?.height_for_age_zscore,
      weightZ: latestHealth?.weight_for_age_zscore,
      bmiZ: latestHealth?.bmi_for_age_zscore,
    });

    // 6. Routine slots & Today's timetable (Đồng bộ dữ liệu thực tế bài dạy & đánh giá của bé)
    const dayOfWeekMap = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const currentDow = dayOfWeekMap[today.getDay()];

    let todayScheduledActivities = [];
    if (homeroomClass) {
      try {
        todayScheduledActivities = await prisma.subThemeActivity.findMany({
          where: {
            class_id: homeroomClass.class_id,
            OR: [
              {
                scheduled_date: {
                  gte: todayStart,
                  lte: todayEnd,
                },
              },
              {
                day_of_week: currentDow,
              },
            ],
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
        });
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to load today activities for routine slots');
      }
    }

    // Lấy đánh giá trong ngày của học sinh (nếu có)
    let todayDailyAssessments = [];
    try {
      todayDailyAssessments = await prisma.dailyAssessment.findMany({
        where: {
          student_id: student.student_id,
          assessment_date: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      });
    } catch (e) {
      logger.warn({ error: e.message }, 'Failed to load today daily assessments');
    }

    const baseSlots = [
      {
        id: 'slot-1',
        slot: 'ARRIVAL_PLAY',
        time: '07:00 – 08:00',
        title: 'Đón trẻ & Thể dục sáng',
        description: 'Cô giáo đón bé tại cửa lớp, kiểm tra thân nhiệt và hướng dẫn bé cất cặp, giày dép vào ngăn tủ riêng. Bé cùng các bạn ra sân tập bài thể dục buổi sáng theo nhạc sôi động.',
        icon: 'Sun',
        category: 'Đón trẻ',
        status: today.getHours() >= 8 ? 'completed' : today.getHours() >= 7 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-2',
        slot: 'DIRECTED_STUDY',
        time: '08:30 – 09:30',
        title: 'Hoạt động học có chủ đích',
        description: 'Khám phá khoa học, làm quen với toán học và rèn luyện kỹ năng ngôn ngữ theo chủ đề tuần.',
        icon: 'BookOpen',
        category: 'Học có chủ đích',
        status: today.getHours() >= 10 ? 'completed' : today.getHours() >= 8 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-3',
        slot: 'CORNER_PLAY',
        time: '09:30 – 10:30',
        title: 'Hoạt động chơi ở các góc',
        description: 'Góc phân vai: Bé đóng vai đầu bếp nhí nấu súp rau củ. Góc xây dựng: Lắp ráp công viên khủng long cùng nhóm bạn.',
        icon: 'Gamepad2',
        category: 'Chơi góc',
        status: today.getHours() >= 11 ? 'completed' : today.getHours() >= 9 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-4',
        slot: 'OUTDOOR_PLAY',
        time: '10:30 – 11:15',
        title: 'Chơi ngoài trời & Khám phá thiên nhiên',
        description: 'Vận động thể chất, hít thở không khí trong lành, quan sát vườn cây và chơi trò chơi vận động cùng bạn bè.',
        icon: 'Trees',
        category: 'Ngoài trời',
        status: today.getHours() >= 12 ? 'completed' : today.getHours() >= 10 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-5',
        slot: 'HYGIENE_MEAL_SLEEP',
        time: '11:30 – 14:00',
        title: 'Vệ sinh, Ăn trưa & Giấc ngủ trưa',
        description: 'Bé rửa tay sạch sẽ trước khi ăn, tự xúc cơm ngoan, ăn hết phần cơm dinh dưỡng và ngủ trưa tròn giấc.',
        icon: 'Moon',
        category: 'Nuôi dưỡng',
        status: today.getHours() >= 14 ? 'completed' : today.getHours() >= 11 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-6',
        slot: 'AFTERNOON_ACTIVITY',
        time: '14:30 – 15:30',
        title: 'Bữa phụ chiều & Sinh hoạt văn nghệ',
        description: 'Bữa phụ dinh dưỡng (sữa tươi/bánh flan), ôn tập bài hát, thơ và rèn kỹ năng tự phục vụ.',
        icon: 'Coffee',
        category: 'Sinh hoạt chiều',
        status: today.getHours() >= 16 ? 'completed' : today.getHours() >= 14 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-7',
        slot: 'RETURN_CHILD',
        time: '16:30 – 17:30',
        title: 'Trả trẻ & Trao đổi phụ huynh',
        description: 'Bé sắp xếp đồ dùng vào ba lô, chào cô và các bạn. Giáo viên đối chiếu người đón được ủy thác và bàn giao an toàn.',
        icon: 'HeartHandshake',
        category: 'Trả trẻ',
        status: today.getHours() >= 18 ? 'completed' : today.getHours() >= 16 ? 'in_progress' : 'upcoming',
      },
    ];

    const routineSlots = baseSlots.map((base) => {
      const sa = todayScheduledActivities.find((item) => item.routine_slot === base.slot);
      const customTitle = sa?.activity?.title || base.title;
      const customDesc = sa?.activity?.procedure || sa?.activity?.objective || base.description;
      const objective = sa?.activity?.objective || sa?.activity?.content?.goal?.title || null;

      const da = sa?.activity_id
        ? todayDailyAssessments.find((a) => a.activity_id === sa.activity_id)
        : null;

      let badge = 'Sắp diễn ra';
      let isDone = false;

      if (da) {
        isDone = true;
        badge =
          da.status === 'EXCELLENT'
            ? 'Xuất sắc'
            : da.status === 'ACHIEVED'
              ? 'Đạt mục tiêu'
              : da.status === 'NOT_ACHIEVED'
                ? 'Cần rèn thêm'
                : 'Đã đánh giá';
      } else if (base.status === 'completed') {
        isDone = true;
        badge = base.slot === 'HYGIENE_MEAL_SLEEP' ? 'Ăn hết suất' : 'Hoàn thành';
      } else if (base.status === 'in_progress') {
        isDone = false;
        badge = 'Đang diễn ra';
      }

      return {
        ...base,
        title: customTitle,
        description: customDesc,
        objective,
        badge,
        isDone,
        notes: da?.notes || null,
      };
    });

    // Weekly Timetable for homeroom class
    let weeklyTimetable = [];
    if (homeroomClass) {
      try {
        const scheduledActivities = await prisma.subThemeActivity.findMany({
          where: {
            class_id: homeroomClass.class_id,
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
          take: 10,
        });

        weeklyTimetable = scheduledActivities.map((sa) => ({
          id: sa.id.toString(),
          dayOfWeek: sa.day_of_week,
          routineSlot: sa.routine_slot,
          title: sa.activity?.title || 'Hoạt động giáo dục',
          domain: sa.activity?.content?.goal?.domain || 'COGNITIVE',
          date: sa.scheduled_date,
        }));
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to load sub-theme activities for timetable');
      }
    }

    const siblings = await this._getSiblingStudents(student);

    return {
      siblings,
      student: {
        id: student.public_id,
        code: student.student_code,
        fullName: student.full_name,
        avatarUrl: student.avatar_url,
        gender: student.gender === 'MALE' ? 'Nam' : 'Nữ',
        dob: student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString('vi-VN') : null,
        age: ageString,
        status: student.status,
        allergyNotes: student.allergy_notes || 'Không ghi nhận dị ứng',
        medicalNotes: student.medical_notes || 'Sức khỏe ổn định',
        permanentResidence: student.permanent_residence,
        currentResidence: student.current_residence,
      },
      homeroomClass: homeroomClass
        ? {
            id: homeroomClass.public_id,
            name: homeroomClass.name,
            ageGroup: homeroomClass.age_group,
            roomNumber: homeroomClass.room_number,
            schoolYear: homeroomClass.school_year?.name,
            isHistorical,
            status: selectedEnrollment?.status,
          }
        : null,
      primaryTeacher: primaryTeacher
        ? {
            fullName: primaryTeacher.full_name,
            phone: primaryTeacher.phone,
            email: primaryTeacher.email,
            avatarUrl: primaryTeacher.avatar_url,
            position: primaryTeacher.position || 'Giáo viên chủ nhiệm',
          }
        : null,
      teachers: (homeroomClass?.teacher_classes || [])
        .filter((tc) => !tc.left_at)
        .map((tc) => ({
          id: tc.teacher?.public_id,
          fullName: tc.teacher?.full_name,
          phone: tc.teacher?.phone,
          email: tc.teacher?.email,
          avatarUrl: tc.teacher?.avatar_url,
          employeeCode: tc.teacher?.employee_code,
          position: tc.teacher?.position || 'Giáo viên phụ trách',
        })),
      todayAttendance: {
        isRecorded: Boolean(todayAttendance),
        status: todayAttendance?.status || 'NOT_YET',
        statusLabel:
          todayAttendance?.status === 'PRESENT'
            ? (todayAttendance.check_out_time ? 'Đã đón về' : 'Đã điểm danh')
            : todayAttendance?.status === 'EXCUSED_ABSENCE'
              ? 'Nghỉ có phép'
              : todayAttendance?.status === 'UNEXCUSED_ABSENCE'
                ? 'Nghỉ không phép'
                : 'Chưa điểm danh',
        checkInTime: todayAttendance?.check_in_time
          ? new Date(todayAttendance.check_in_time).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : (todayAttendance?.status === 'PRESENT' ? '07:30' : null),
        checkOutTime: todayAttendance?.check_out_time
          ? new Date(todayAttendance.check_out_time).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : null,
        pickupPersonName: todayAttendance?.pickup_person_name || null,
        pickupRelationship: todayAttendance?.pickup_relationship || null,
        pickupNote: todayAttendance?.pickup_note || null,
      },
      monthlyAttendance: {
        presentDays,
        totalWorkingDays,
        attendanceRate,
        currentMonth,
        currentYear,
      },
      activePickupAuthorizations: activeAuthorizations.map((a) => ({
        id: a.public_id,
        name: a.pickup_person_name,
        phone: a.pickup_person_phone,
        relationship: a.relationship,
        photoUrl: a.photo_url,
        startDate: new Date(a.start_date).toLocaleDateString('vi-VN'),
        endDate: new Date(a.end_date).toLocaleDateString('vi-VN'),
      })),
      goodBehaviorSummary: {
        hasRoseThisWeek: hasCurrentWeekRose,
        currentWeekNum,
        rosesCount: monthlyAssessment?.roses_count ?? (hasCurrentWeekRose ? 1 : 0),
        teacherNotes: monthlyAssessment?.teacher_notes || 'Bé ngoan, lễ phép và hòa đồng với bạn bè.',
        evaluatedBy: monthlyAssessment?.evaluator?.teacher?.full_name || 'Cô giáo chủ nhiệm',
      },
      healthSnapshot: {
        isRecorded: Boolean(latestHealth),
        assessmentDate: latestHealth?.assessment_date
          ? new Date(latestHealth.assessment_date).toLocaleDateString('vi-VN')
          : null,
        height: latestHealth?.height ? Number(latestHealth.height) : null,
        weight: latestHealth?.weight ? Number(latestHealth.weight) : null,
        bmi: latestHealth?.bmi ? Number(latestHealth.bmi) : null,
        bmiCategory: bmiInfo.label,
        bmiColor: bmiInfo.color,
        notes: latestHealth?.notes || 'Bé phát triển chiều cao và cân nặng cân đối theo lứa tuổi.',
      },
      guardians: (student.parents || []).map((p) => ({
        id: p.public_id,
        fullName: p.full_name,
        relationship: p.relationship,
        phone: p.phone,
        avatarUrl: p.avatar_url,
      })),
      timeline: routineSlots,
      weeklyTimetable,
      todayHoliday,
      enrollments,
      isHistorical,
      selectedClassId: homeroomClass?.public_id || null,
    };
  }

  /**
   * 2. GET /parent/profile
   * Full student records, medical history & guardians
   */
  async getStudentProfile(accountSub, classPublicId = null) {
    const { student } = await this._getStudentForAccount(accountSub);

    const enrollments = (student.student_enrollments || []).map((e) => ({
      classId: e.class?.public_id,
      className: e.class?.name,
      ageGroup: e.class?.age_group,
      schoolYear: e.class?.school_year?.name,
      status: e.status,
      isCurrent: !e.left_at,
      enrolledAt: e.enrolled_at,
      leftAt: e.left_at,
    }));

    let selectedEnrollment = null;
    if (classPublicId) {
      selectedEnrollment = student.student_enrollments?.find(
        (e) => e.class?.public_id === classPublicId,
      );
    }
    if (!selectedEnrollment) {
      selectedEnrollment =
        student.student_enrollments?.find((e) => !e.left_at) ||
        student.student_enrollments?.[0];
    }

    const homeroomClass = selectedEnrollment?.class;
    const isHistorical = Boolean(selectedEnrollment?.left_at || selectedEnrollment?.status === 'COMPLETED');
    const primaryTeacher =
      homeroomClass?.teacher_classes?.find((tc) => !tc.left_at)?.teacher ||
      homeroomClass?.teacher_classes?.[0]?.teacher;

    // Full Health Assessment history
    const healthHistory = await prisma.healthAssessment.findMany({
      where: {
        student_id: student.student_id,
        deleted_at: null,
      },
      orderBy: { assessment_date: 'desc' },
      include: {
        recorder: {
          include: {
            teacher: true,
          },
        },
      },
    });

    // Pickup Authorizations
    const pickupAuthorizations = await prisma.pickupAuthorization.findMany({
      where: {
        student_id: student.student_id,
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
      include: {
        approver: {
          include: { teacher: true },
        },
      },
    });

    const siblings = await this._getSiblingStudents(student);

    return {
      siblings,
      student: {
        id: student.public_id,
        studentCode: student.student_code,
        fullName: student.full_name,
        avatarUrl: student.avatar_url,
        gender: student.gender === 'MALE' ? 'Nam' : 'Nữ',
        dateOfBirth: student.date_of_birth
          ? new Date(student.date_of_birth).toLocaleDateString('vi-VN')
          : null,
        ethnic: student.ethnic || 'Kinh',
        nationality: student.nationality || 'Việt Nam',
        placeOfBirth: student.place_of_birth || 'Kiên Giang',
        permanentResidence: student.permanent_residence || 'Hòn Tre, Kiên Hải, Kiên Giang',
        currentResidence: student.current_residence || 'Hòn Tre, Kiên Hải, Kiên Giang',
        enrollmentDate: student.enrollment_date
          ? new Date(student.enrollment_date).toLocaleDateString('vi-VN')
          : null,
        status: student.status,
        statusLabel: student.status === 'STUDYING' ? 'Đang học' : 'Đã tốt nghiệp',
        previousSchool: student.previous_school || 'Chưa học trường nào trước đây',
        allergyNotes: student.allergy_notes || 'Không ghi nhận dị ứng thức ăn hay thuốc',
        medicalNotes: student.medical_notes || 'Sức khỏe tổng quát tốt, tiêm chủng đầy đủ',
      },
      classInfo: homeroomClass
        ? {
            id: homeroomClass.public_id,
            name: homeroomClass.name,
            ageGroup: homeroomClass.age_group,
            roomNumber: homeroomClass.room_number,
            schoolYear: homeroomClass.school_year?.name,
            isHistorical,
            status: selectedEnrollment?.status,
          }
        : null,
      primaryTeacher: primaryTeacher
        ? {
            fullName: primaryTeacher.full_name,
            phone: primaryTeacher.phone,
            email: primaryTeacher.email,
            avatarUrl: primaryTeacher.avatar_url,
          }
        : null,
      guardians: (student.parents || []).map((p) => ({
        id: p.public_id,
        fullName: p.full_name,
        relationship: p.relationship,
        phone: p.phone,
        avatarUrl: p.avatar_url,
      })),
      enrollments,
      isHistorical,
      selectedClassId: homeroomClass?.public_id || null,
      healthHistory: healthHistory.map((h) => {
        const bmiInfo = this._calculateBmiCategory(h.bmi, {
          heightZ: h.height_for_age_zscore,
          weightZ: h.weight_for_age_zscore,
          bmiZ: h.bmi_for_age_zscore,
        });
        return {
          id: h.public_id,
          date: new Date(h.assessment_date).toLocaleDateString('vi-VN'),
          rawDate: h.assessment_date,
          height: Number(h.height),
          weight: Number(h.weight),
          bmi: Number(h.bmi),
          bmiCategory: bmiInfo.label,
          bmiColor: bmiInfo.color,
          heightZscore: h.height_for_age_zscore ? Number(h.height_for_age_zscore) : null,
          weightZscore: h.weight_for_age_zscore ? Number(h.weight_for_age_zscore) : null,
          bmiZscore: h.bmi_for_age_zscore ? Number(h.bmi_for_age_zscore) : null,
          notes: h.notes || 'Bình thường',
          recordedBy: h.recorder?.teacher?.full_name || 'Giáo viên phụ trách',
        };
      }),
      pickupAuthorizations: pickupAuthorizations.map((r) => ({
        id: r.public_id,
        pickupPersonName: r.pickup_person_name,
        pickupPersonPhone: r.pickup_person_phone,
        pickupCitizenId: r.pickup_citizen_id || null,
        relationship: r.relationship,
        photoUrl: r.photo_url || null,
        note: r.note || null,
        startDate: new Date(r.start_date).toLocaleDateString('vi-VN'),
        endDate: new Date(r.end_date).toLocaleDateString('vi-VN'),
        status: r.status,
        statusLabel:
          r.status === 'APPROVED'
            ? 'Đã duyệt'
            : r.status === 'PENDING'
              ? 'Chờ duyệt'
              : r.status === 'REJECTED'
                ? 'Từ chối'
                : 'Đã hủy',
        statusColor:
          r.status === 'APPROVED'
            ? 'emerald'
            : r.status === 'PENDING'
              ? 'amber'
              : r.status === 'REJECTED'
                ? 'rose'
                : 'gray',
        rejectedReason: r.rejected_reason || null,
        approvedAt: r.approved_at ? new Date(r.approved_at).toLocaleDateString('vi-VN') : null,
        approverName: r.approver?.teacher?.full_name || null,
        createdAt: new Date(r.created_at).toLocaleDateString('vi-VN'),
      })),
    };
  }

  /**
   * 3. GET /parent/requests
   * Pickup authorization history
   */
  async getRequests(accountSub, { status, studentId } = {}) {
    const { student } = await this._getStudentForAccount(accountSub, studentId);

    const where = {
      student_id: student.student_id,
      deleted_at: null,
    };

    if (status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }

    const [requests, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.pickupAuthorization.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          approver: {
            include: {
              teacher: true,
            },
          },
        },
      }),
      prisma.pickupAuthorization.count({
        where: { student_id: student.student_id, status: 'PENDING', deleted_at: null },
      }),
      prisma.pickupAuthorization.count({
        where: { student_id: student.student_id, status: 'APPROVED', deleted_at: null },
      }),
      prisma.pickupAuthorization.count({
        where: { student_id: student.student_id, status: 'REJECTED', deleted_at: null },
      }),
    ]);

    const siblings = await this._getSiblingStudents(student);

    return {
      siblings,
      student: {
        id: student.public_id,
        fullName: student.full_name,
        studentCode: student.student_code,
      },
      requests: requests.map((r) => ({
        id: r.public_id,
        pickupPersonName: r.pickup_person_name,
        pickupPersonPhone: r.pickup_person_phone,
        pickupCitizenId: r.pickup_citizen_id || null,
        relationship: r.relationship,
        photoUrl: r.photo_url || null,
        note: r.note || null,
        startDate: new Date(r.start_date).toLocaleDateString('vi-VN'),
        endDate: new Date(r.end_date).toLocaleDateString('vi-VN'),
        rawStartDate: r.start_date,
        rawEndDate: r.end_date,
        status: r.status,
        statusLabel:
          r.status === 'APPROVED'
            ? 'Đã duyệt'
            : r.status === 'PENDING'
              ? 'Chờ duyệt'
              : r.status === 'REJECTED'
                ? 'Từ chối'
                : 'Đã hủy',
        statusColor:
          r.status === 'APPROVED'
            ? 'emerald'
            : r.status === 'PENDING'
              ? 'amber'
              : r.status === 'REJECTED'
                ? 'rose'
                : 'gray',
        rejectedReason: r.rejected_reason || null,
        approvedAt: r.approved_at ? new Date(r.approved_at).toLocaleDateString('vi-VN') : null,
        approverName: r.approver?.teacher?.full_name || null,
        createdAt: new Date(r.created_at).toLocaleDateString('vi-VN'),
      })),
      stats: {
        pendingCount,
        approvedCount,
        rejectedCount,
        totalCount: pendingCount + approvedCount + rejectedCount,
      },
    };
  }

  /**
   * 4. POST /parent/requests/pickup
   * Submit new pickup authorization
   */
  async createPickupRequest(accountSub, data) {
    const { account, student } = await this._getStudentForAccount(accountSub);

    const {
      pickup_person_name,
      pickup_person_phone,
      pickup_citizen_id,
      relationship,
      photo_url,
      note,
      start_date,
      end_date,
    } = data;

    if (!pickup_person_name?.trim()) {
      throw BadRequest('Vui lòng nhập họ và tên người được ủy quyền.');
    }
    if (!pickup_person_phone?.trim()) {
      throw BadRequest('Vui lòng nhập số điện thoại người được ủy quyền.');
    }
    if (!relationship?.trim()) {
      throw BadRequest('Vui lòng chọn mối quan hệ với bé.');
    }
    if (!start_date || !end_date) {
      throw BadRequest('Vui lòng chọn thời gian bắt đầu và kết thúc ủy quyền.');
    }

    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      throw BadRequest('Định dạng ngày tháng không hợp lệ.');
    }
    if (endDateObj < startDateObj) {
      throw BadRequest('Ngày kết thúc không được trước ngày bắt đầu.');
    }

    // Validate daily pickup quota: 4 - parents.length
    await validatePickupQuota(prisma, student.student_id, {
      startDate: start_date,
      endDate: end_date,
    });

    if (photo_url && typeof photo_url === 'string' && photo_url.length > 2000000) {
      throw BadRequest('Dung lượng ảnh đính kèm quá lớn. Vui lòng tải lại ảnh dưới 2MB.');
    }

    if (pickup_citizen_id && pickup_citizen_id.trim()) {
      if (!/^[0-9]{12}$/.test(pickup_citizen_id.trim())) {
        throw BadRequest('Số CCCD/Định danh cá nhân phải gồm 12 chữ số.');
      }
    }

    // Check if student is marked absent on start_date (tester_18 Bug 15)
    const checkDate = new Date(startDateObj);
    checkDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(checkDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const attendanceRecord = await prisma.attendance.findFirst({
      where: {
        student_id: student.student_id,
        date: { gte: checkDate, lt: nextDate },
        status: { in: ['EXCUSED_ABSENCE', 'UNEXCUSED_ABSENCE'] },
        deleted_at: null,
      },
    });

    if (attendanceRecord && !data.confirmAbsentWarning) {
      const formattedDate = `${String(startDateObj.getDate()).padStart(2, '0')}/${String(startDateObj.getMonth() + 1).padStart(2, '0')}/${startDateObj.getFullYear()}`;
      return {
        requiresWarning: true,
        warningDate: formattedDate,
        warningMessage: `Học sinh đang được ghi nhận vắng ngày ${formattedDate}. Bạn vẫn có thể tạo đơn ủy quyền, nhưng chỉ được xác nhận đón khi học sinh đã được cập nhật có mặt. Đơn này không thay đổi trạng thái điểm danh.`,
      };
    }

    const newAuth = await prisma.pickupAuthorization.create({
      data: {
        student_id: student.student_id,
        authorized_by: account.account_id,
        pickup_person_name: pickup_person_name.trim(),
        pickup_person_phone: pickup_person_phone.trim(),
        pickup_citizen_id: pickup_citizen_id?.trim() || null,
        relationship: relationship.trim(),
        photo_url: photo_url?.trim() || null,
        note: note?.trim() || null,
        start_date: startDateObj,
        end_date: endDateObj,
        status: 'PENDING',
      },
    });

    // Create system notification for class teachers
    try {
      const activeEnrollment =
        student.student_enrollments?.find((e) => !e.left_at) || student.student_enrollments?.[0];
      const homeroomClass = activeEnrollment?.class;
      const activeTeacherClasses =
        homeroomClass?.teacher_classes?.filter((tc) => !tc.left_at) || [];

      const pickupDataPayload = {
        authorizationId: newAuth.public_id,
        studentCode: student.student_code,
        studentName: student.full_name,
        type: 'PICKUP_AUTH_CREATED',
        class_id: homeroomClass?.public_id || (homeroomClass?.class_id ? homeroomClass.class_id.toString() : null),
        class_public_id: homeroomClass?.public_id || null,
        className: homeroomClass?.name || null,
      };

      for (const tc of activeTeacherClasses) {
        if (tc.teacher?.account_id) {
          await prisma.notification.create({
            data: {
              account_id: tc.teacher.account_id,
              created_by: account.account_id,
              type: 'SCHOOL_ANNOUNCEMENT',
              title: `Yêu cầu đón trẻ mới: ${student.full_name}`,
              body: `Phụ huynh của bé ${student.full_name} vừa tạo đơn ủy thác đón cho ${pickup_person_name.trim()} (${relationship.trim()}).`,
              data: pickupDataPayload,
            },
          });
        }
      }

      // Notification 11: Also notify Principal / BGH
      const bghAccounts = await prisma.account.findMany({
        where: { role: 'PRINCIPAL_BGH', is_active: true, deleted_at: null },
        select: { account_id: true },
      });
      for (const b of bghAccounts) {
        await prisma.notification.create({
          data: {
            account_id: b.account_id,
            created_by: account.account_id,
            type: 'SCHOOL_ANNOUNCEMENT',
            title: `Yêu cầu đón trẻ mới: ${student.full_name}`,
            body: `Phụ huynh của bé ${student.full_name} (${homeroomClass?.name || ''}) vừa tạo đơn ủy thác đón cho ${pickup_person_name.trim()} (${relationship.trim()}).`,
            data: pickupDataPayload,
          },
        });
      }
    } catch (e) {
      logger.warn({ error: e.message }, 'Failed to emit teacher notification for pickup auth');
    }

    return {
      id: newAuth.public_id,
      message: 'Gửi yêu cầu ủy thác đón con thành công. Giáo viên phụ trách sẽ sớm kiểm tra và phê duyệt.',
    };
  }

  /**
   * 5. POST /parent/requests/pickup/:requestId/cancel
   * Cancel pending authorization
   */
  async cancelPickupRequest(accountSub, requestId) {
    const { student } = await this._getStudentForAccount(accountSub);

    const existing = await prisma.pickupAuthorization.findUnique({
      where: { public_id: requestId },
    });

    if (!existing || existing.student_id !== student.student_id) {
      throw NotFound('Không tìm thấy yêu cầu ủy quyền.');
    }

    if (existing.status !== 'PENDING') {
      throw BadRequest('Chỉ có thể hủy yêu cầu đang ở trạng thái Chờ duyệt.');
    }

    await prisma.pickupAuthorization.update({
      where: { authorization_id: existing.authorization_id },
      data: { status: 'CANCELLED' },
    });

    return {
      message: 'Đã hủy yêu cầu ủy thác đón thành công.',
    };
  }

  /**
   * 5b. GET /parent/pickup-quota
   * Get pickup quota information and blocked dates for parent's student
   */
  async getPickupQuota(accountSub, query = {}) {
    const { student } = await this._getStudentForAccount(accountSub);
    let start = query.startDate;
    let end = query.endDate;
    if (query.month && !start && !end) {
      const parts = query.month.split('-');
      if (parts.length === 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        start = `${query.month}-01`;
        end = `${query.month}-${String(lastDay).padStart(2, '0')}`;
      }
    }

    return getStudentPickupQuotaInfo(prisma, student.student_id, {
      startDate: start,
      endDate: end,
    });
  }

  /**
   * 6. GET /parent/good-behavior
   * Good behavior (Phiếu bé ngoan) evaluation & history + semester evaluations
   */
  async getGoodBehavior(accountSub, { month, year, classId } = {}) {
    const { student } = await this._getStudentForAccount(accountSub);

    const enrollments = (student.student_enrollments || []).map((e) => ({
      classId: e.class?.public_id,
      className: e.class?.name,
      ageGroup: e.class?.age_group,
      schoolYear: e.class?.school_year?.name,
      status: e.status,
      isCurrent: !e.left_at,
      enrolledAt: e.enrolled_at,
      leftAt: e.left_at,
    }));

    let selectedEnrollment = null;
    if (classId) {
      selectedEnrollment = student.student_enrollments?.find(
        (e) => e.class?.public_id === classId,
      );
    }
    if (!selectedEnrollment) {
      selectedEnrollment =
        student.student_enrollments?.find((e) => !e.left_at) ||
        student.student_enrollments?.[0];
    }

    const homeroomClass = selectedEnrollment?.class;
    const isHistorical = Boolean(selectedEnrollment?.left_at || selectedEnrollment?.status === 'COMPLETED');

    // Recorded monthly assessments in DB for this student (optionally scoped to selected class)
    const dbAssessments = await prisma.monthlyAssessment.findMany({
      where: {
        student_id: student.student_id,
        ...(homeroomClass?.class_id ? { class_id: homeroomClass.class_id } : {}),
      },
      select: { month: true, year: true, roses_count: true, is_published: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const today = new Date();
    const curM = today.getMonth() + 1;
    const curY = today.getFullYear();

    // Determine school year boundary (default to 2026-2027: Sept 2026 to May 2027)
    const syStart = homeroomClass?.school_year?.start_date
      ? new Date(homeroomClass.school_year.start_date)
      : new Date(2026, 8, 1);
    const startM = syStart.getMonth() + 1;
    const startY = syStart.getFullYear();

    // Build complete list of months in the academic year up to current month (or all school year months)
    const historyMonths = [];
    const seenPeriod = new Set();

    let mRunner = curM;
    let yRunner = curY;
    while (true) {
      const key = `${yRunner}-${mRunner}`;
      if (!seenPeriod.has(key)) {
        seenPeriod.add(key);
        const dbRec = dbAssessments.find((d) => d.month === mRunner && d.year === yRunner);
        const isPub = Boolean(dbRec?.is_published);
        historyMonths.push({
          month: mRunner,
          year: yRunner,
          label: `Tháng ${mRunner}/${yRunner}${mRunner === curM && yRunner === curY ? ' (Hiện tại)' : ''}`,
          rosesCount: isPub ? dbRec.roses_count : 0,
          isEvaluated: isPub,
          isPublished: isPub,
        });
      }
      if (yRunner === startY && mRunner === startM) break;
      if (yRunner < startY || (yRunner === startY && mRunner < startM)) break;
      mRunner--;
      if (mRunner === 0) {
        mRunner = 12;
        yRunner--;
      }
    }

    // Include any additional months from dbAssessments that might fall outside current runner
    for (const d of dbAssessments) {
      const key = `${d.year}-${d.month}`;
      if (!seenPeriod.has(key)) {
        seenPeriod.add(key);
        const isPub = Boolean(d.is_published);
        historyMonths.push({
          month: d.month,
          year: d.year,
          label: `Tháng ${d.month}/${d.year}`,
          rosesCount: isPub ? d.roses_count : 0,
          isEvaluated: isPub,
          isPublished: isPub,
        });
      }
    }

    let targetMonth = month ? parseInt(month, 10) : null;
    let targetYear = year ? parseInt(year, 10) : null;

    // Default to latest published month, or previous completed month (e.g. Month 10)
    if (!targetMonth) {
      const latestPublished = dbAssessments.find((d) => d.is_published && d.roses_count > 0) || dbAssessments.find((d) => d.is_published);
      if (latestPublished) {
        targetMonth = latestPublished.month;
        targetYear = latestPublished.year;
      } else {
        targetMonth = curM === 1 ? 12 : curM - 1;
        targetYear = curM === 1 ? curY - 1 : curY;
      }
    }

    // Query live monthly overview from assessmentService to share identical logic with school side
    let monthlyOverview = null;
    if (homeroomClass?.class_id) {
      try {
        monthlyOverview = await assessmentService.getMonthlyAssessments({
          classId: homeroomClass.class_id,
          month: targetMonth,
          year: targetYear,
        });
      } catch (err) {
        logger.warn('Failed to load monthlyOverview from assessmentService:', err);
      }
    }

    const studentAssessment = monthlyOverview?.students?.find(
      (s) => s.code === student.student_code || s.id === student.public_id,
    );

    const assessment = await prisma.monthlyAssessment.findFirst({
      where: {
        student_id: student.student_id,
        month: targetMonth,
        year: targetYear,
        ...(homeroomClass?.class_id ? { class_id: homeroomClass.class_id } : {}),
      },
      include: {
        evaluator: {
          include: {
            teacher: true,
          },
        },
      },
    });

    const isEnded = monthlyOverview?.classInfo?.isEnded ?? (new Date(targetYear, targetMonth, 0, 23, 59, 59, 999) < today);
    const monthWeeks = [1, 2, 3, 4];

    const weeklyStats = {};
    monthWeeks.forEach((wk) => {
      const liveStat = studentAssessment?.weeklyStats?.[`week${wk}`];
      const liveRose = Boolean(studentAssessment?.[`week${wk}Rose`]);
      const dbRose = Boolean(assessment?.[`week_${wk}_rose`]);
      const isRose = assessment ? dbRose : liveRose;

      const attTotal = liveStat?.attendanceTotal ?? 5;
      const attPresent = Math.min(
        Number(liveStat?.attendancePresent ?? (isRose ? 5 : (assessment ? 4 : 0))),
        attTotal
      );
      const attRate = Math.min(100, Math.round((attPresent / (attTotal || 5)) * 100));

      const goalTotal = liveStat?.goalsTotal ?? 4;
      const goalAchieved = Math.min(
        Number(liveStat?.goalsAchieved ?? (isRose ? 4 : (assessment ? 3 : 0))),
        goalTotal
      );
      const goalRate = Math.min(100, Math.round((goalAchieved / (goalTotal || 4)) * 100));

      const healthStatus = liveStat?.healthStatus || (isEnded ? 'Bình thường' : 'Chưa có dữ liệu');

      const wkRange = monthlyOverview?.classInfo?.weekRanges?.find((r) => r.week === wk) || null;

      // Status of the week:
      // 'ACHIEVED' (Đạt hoa) | 'NOT_ACHIEVED' (Chưa đạt) | 'NOT_EVALUATED' (Chưa đánh giá)
      let status = 'NOT_EVALUATED';
      if (isRose) {
        status = 'ACHIEVED';
      } else if (assessment) {
        status = 'NOT_ACHIEVED';
      } else if (isEnded && (attPresent > 0 || goalAchieved > 0)) {
        status = 'NOT_ACHIEVED';
      } else {
        status = 'NOT_EVALUATED';
      }

      weeklyStats[`week${wk}`] = {
        weekNumber: wk,
        weekLabel: `Tuần ${wk}`,
        rose: isRose,
        status,
        attendancePresent: attPresent,
        attendanceTotal: attTotal,
        attendanceRate: attRate,
        meetsAttendance: attRate >= 80,
        goalsAchieved: goalAchieved,
        goalsTotal: goalTotal,
        goalsRate: goalRate,
        meetsGoals: goalRate >= 70,
        healthStatus,
        meetsHealth: healthStatus !== 'Chưa có dữ liệu' && healthStatus !== 'Chưa đánh giá',
        hasHealthCheckThisWeek: liveStat?.hasHealthCheckThisWeek ?? false,
        healthExamDate: liveStat?.healthExamDate ?? null,
        healthSourceLabel: liveStat?.healthSourceLabel || '',
        startDateStr: wkRange?.startDateStr || null,
        endDateStr: wkRange?.endDateStr || null,
        shortLabel: wkRange?.shortLabel || null,
        rangeText: wkRange?.rangeText || null,
        themeName: wkRange?.themeName || null,
        subThemeName: wkRange?.subThemeName || null,
      };
    });

    const rosesCount = assessment ? assessment.roses_count : (studentAssessment?.rosesCount ?? 0);
    // Quy tắc: Đạt ít nhất 4 hoa hồng trong tháng thì được 1 hoa sen (dù tháng có 4 hay 5 tuần)
    const lotusTarget = 4;
    const isLotus = studentAssessment?.isLotus ?? (rosesCount >= lotusTarget);

    const homeroomTeacher = homeroomClass?.teacher_classes?.[0]?.teacher?.full_name;
    const evaluatorName = assessment?.evaluator?.teacher?.full_name || homeroomTeacher || 'Quang Nhật Phi Yến';

    const criteriaRules = [
      {
        id: 'attendance',
        title: 'Chuyên cần học đường',
        requirement: 'Tỷ lệ đi học >= 80% (từ 4/5 ngày trong tuần)',
        minRate: 80,
        unit: '%',
        description: 'Bé đi học đều đặn, không nghỉ học không phép, tham gia trọn vẹn các ngày học trong tuần.',
      },
      {
        id: 'goals',
        title: 'Mục tiêu hoạt động giáo dục',
        requirement: 'Hoàn thành >= 70% mục tiêu bài học (từ 3/4 mục tiêu/tuần)',
        minRate: 70,
        unit: '%',
        description: 'Bé hào hứng tham gia các tiết học, vận động và tiếp thu tốt các kỹ năng lứa tuổi mầm non.',
      },
      {
        id: 'health',
        title: 'Thể trạng sức khỏe & Vệ sinh',
        requirement: 'Thể trạng Bình thường hoặc đang được theo dõi chăm sóc tốt',
        allowedStatuses: ['Bình thường', 'Theo dõi nhẹ cân'],
        description: 'Chỉ số chiều cao, cân nặng và thể chất đạt chuẩn tăng trưởng của Bộ Y tế và WHO.',
      },
    ];

    // Semester assessments (Đánh giá học kỳ)
    const semesterAssessments = await prisma.semesterAssessment.findMany({
      where: {
        student_id: student.student_id,
        ...(homeroomClass?.class_id ? { class_id: homeroomClass.class_id } : {}),
      },
      include: {
        evaluator: {
          include: { teacher: true },
        },
        class: {
          include: { school_year: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Fetch real daily assessments for semester domain calculation
    const studentDailyAssessments = await prisma.dailyAssessment.findMany({
      where: {
        student_id: student.student_id,
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

    // Fetch student's health assessment for semester overview
    const latestHealth = await prisma.healthAssessment.findFirst({
      where: {
        student_id: student.student_id,
        deleted_at: null,
      },
      orderBy: { assessment_date: 'desc' },
    });
    let studentHealthStatus = 'Bình thường';
    if (latestHealth) {
      const notes = (latestHealth.notes || '').toLowerCase();
      const bmi = Number(latestHealth.bmi) || 0;
      if (notes.includes('nhẹ cân') || notes.includes('suy dinh dưỡng') || (bmi > 0 && bmi < 13.5)) {
        studentHealthStatus = 'Theo dõi nhẹ cân';
      } else if (notes.includes('thừa cân') || notes.includes('béo phì') || (bmi > 0 && bmi > 18)) {
        studentHealthStatus = 'Theo dõi thừa cân/béo phì';
      } else {
        studentHealthStatus = 'Bình thường';
      }
    }

    const pad = (n) => String(n).padStart(2, '0');
    const formatVN = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const formatISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const activeSY = homeroomClass?.school_year;
    const baseS1Start = activeSY?.start_date ? new Date(activeSY.start_date) : new Date('2026-09-07');
    const baseS1End = activeSY?.semester_1_end_date ? new Date(activeSY.semester_1_end_date) : new Date('2027-01-15');
    const baseS2Start = new Date(baseS1End);
    baseS2Start.setDate(baseS2Start.getDate() + 1);
    const baseS2End = activeSY?.end_date ? new Date(activeSY.end_date) : new Date('2027-05-31');

    const mappedSemesterAssessments = semesterAssessments.map((sa) => {
      const sy = sa.class?.school_year || activeSY;
      const s1Start = sy?.start_date ? new Date(sy.start_date) : baseS1Start;
      const s1End = sy?.semester_1_end_date ? new Date(sy.semester_1_end_date) : baseS1End;
      const s2Start = new Date(s1End);
      s2Start.setDate(s2Start.getDate() + 1);
      const s2End = sy?.end_date ? new Date(sy.end_date) : baseS2End;

      const isSem2 = sa.semester === 'SEMESTER_2';
      const semStart = isSem2 ? s2Start : s1Start;
      const semEnd = isSem2 ? s2End : s1End;

      const evaluatedDAs = studentDailyAssessments.filter((da) => {
        const d = new Date(da.assessment_date);
        return (
          d >= semStart &&
          d <= semEnd &&
          (da.status === 'ACHIEVED' || da.status === 'NOT_ACHIEVED' || da.status === 'OUTSTANDING')
        );
      });

      let domains = [];
      if (evaluatedDAs.length > 0) {
        const domainCounts = {
          PHYSICAL: { passed: 0, total: 0, name: 'Phát triển Thể chất' },
          COGNITIVE: { passed: 0, total: 0, name: 'Phát triển Nhận thức' },
          LANGUAGE: { passed: 0, total: 0, name: 'Phát triển Ngôn ngữ' },
          SOCIO_EMOTIONAL: { passed: 0, total: 0, name: 'Tình cảm & Kỹ năng xã hội' },
          AESTHETIC: { passed: 0, total: 0, name: 'Phát triển Thẩm mỹ' },
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

        domains = Object.keys(domainCounts).map((key) => {
          const dc = domainCounts[key];
          const score = dc.total > 0 ? Math.round((dc.passed / dc.total) * 100) : 0;
          const rating =
            score >= 90
              ? 'Xuất sắc'
              : score >= 70
                ? 'Đạt chuẩn'
                : dc.total > 0
                  ? 'Cần rèn luyện'
                  : 'Chưa đánh giá';
          return {
            name: dc.name,
            rating,
            score,
          };
        });
      }

      const isPublished = Boolean(sa.is_published);
      const isEvaluated = Boolean(sa.teacher_notes && sa.teacher_notes.trim().length > 0);
      const isStarted = new Date() >= semStart;

      return {
        id: sa.public_id,
        semester: sa.semester,
        semesterLabel: isSem2 ? 'Học kỳ 2' : 'Học kỳ 1',
        startDate: formatISO(semStart),
        endDate: formatISO(semEnd),
        startDateVN: formatVN(semStart),
        endDateVN: formatVN(semEnd),
        dateRangeLabel: `${formatVN(semStart)} – ${formatVN(semEnd)}`,
        isStarted,
        teacherNotes: isPublished ? (sa.teacher_notes || '') : '',
        evaluatorName: sa.evaluator?.teacher?.full_name || 'Cô giáo chủ nhiệm',
        className: sa.class?.name,
        schoolYear: sa.class?.school_year?.name,
        domains: isPublished ? domains : [],
        healthStatus: isPublished ? studentHealthStatus : null,
        isEvaluated,
        isPublished,
        isDraft: !isPublished,
        statusLabel: isPublished ? 'Đã công bố' : (isStarted ? 'Kết quả học kỳ chưa được công bố' : 'Học kỳ chưa bắt đầu'),
        createdAt: new Date(sa.created_at).toLocaleDateString('vi-VN'),
      };
    });

    // Đảm bảo phụ huynh luôn thấy cả 2 học kỳ (HK1 & HK2) cùng dải thời gian tương ứng
    if (homeroomClass) {
      const hasSem1 = mappedSemesterAssessments.some((s) => s.semester === 'SEMESTER_1');
      const hasSem2 = mappedSemesterAssessments.some((s) => s.semester === 'SEMESTER_2');

      if (!hasSem1) {
        const isSem1Started = new Date() >= baseS1Start;
        mappedSemesterAssessments.push({
          id: `draft_hk1_${student.student_id}`,
          semester: 'SEMESTER_1',
          semesterLabel: 'Học kỳ 1',
          startDate: formatISO(baseS1Start),
          endDate: formatISO(baseS1End),
          startDateVN: formatVN(baseS1Start),
          endDateVN: formatVN(baseS1End),
          dateRangeLabel: `${formatVN(baseS1Start)} – ${formatVN(baseS1End)}`,
          isStarted: isSem1Started,
          teacherNotes: '',
          evaluatorName: homeroomClass?.teachers?.[0]?.teacher?.full_name || 'Cô giáo chủ nhiệm',
          className: homeroomClass?.name || 'Nhà Trẻ',
          schoolYear: activeSY?.name || 'Năm học 2026–2027',
          domains: [],
          healthStatus: null,
          isEvaluated: false,
          isPublished: false,
          isDraft: true,
          statusLabel: isSem1Started ? 'Kết quả học kỳ chưa được công bố' : 'Học kỳ chưa bắt đầu',
          createdAt: new Date().toLocaleDateString('vi-VN'),
        });
      }

      if (!hasSem2) {
        const isSem2Started = new Date() >= baseS2Start;
        mappedSemesterAssessments.push({
          id: `draft_hk2_${student.student_id}`,
          semester: 'SEMESTER_2',
          semesterLabel: 'Học kỳ 2',
          startDate: formatISO(baseS2Start),
          endDate: formatISO(baseS2End),
          startDateVN: formatVN(baseS2Start),
          endDateVN: formatVN(baseS2End),
          dateRangeLabel: `${formatVN(baseS2Start)} – ${formatVN(baseS2End)}`,
          isStarted: isSem2Started,
          teacherNotes: '',
          evaluatorName: homeroomClass?.teachers?.[0]?.teacher?.full_name || 'Cô giáo chủ nhiệm',
          className: homeroomClass?.name || 'Nhà Trẻ',
          schoolYear: activeSY?.name || 'Năm học 2026–2027',
          domains: [],
          healthStatus: null,
          isEvaluated: false,
          isPublished: false,
          isDraft: true,
          statusLabel: isSem2Started ? 'Kết quả học kỳ chưa được công bố' : 'Học kỳ chưa bắt đầu',
          createdAt: new Date().toLocaleDateString('vi-VN'),
        });
      }

      // Sắp xếp thứ tự hiển thị: Học kỳ 1 trước, Học kỳ 2 sau
      mappedSemesterAssessments.sort((a, b) => {
        if (a.semester === 'SEMESTER_1' && b.semester === 'SEMESTER_2') return -1;
        if (a.semester === 'SEMESTER_2' && b.semester === 'SEMESTER_1') return 1;
        return 0;
      });
    }

    const siblings = await this._getSiblingStudents(student);
    const isMonthlyPublished = Boolean(assessment && assessment.is_published);

    return {
      siblings,
      student: {
        id: student.public_id,
        fullName: student.full_name,
        studentCode: student.student_code,
      },
      classInfo: homeroomClass
        ? {
            id: homeroomClass.public_id,
            name: homeroomClass.name,
            ageGroup: homeroomClass.age_group,
            roomNumber: homeroomClass.room_number,
            schoolYear: homeroomClass.school_year?.name,
            isHistorical,
            status: selectedEnrollment?.status,
            semesterDates: {
              semester1: {
                semester: 'SEMESTER_1',
                label: 'Học kỳ 1',
                startDate: formatISO(baseS1Start),
                endDate: formatISO(baseS1End),
                startDateVN: formatVN(baseS1Start),
                endDateVN: formatVN(baseS1End),
                dateRangeLabel: `${formatVN(baseS1Start)} – ${formatVN(baseS1End)}`,
              },
              semester2: {
                semester: 'SEMESTER_2',
                label: 'Học kỳ 2',
                startDate: formatISO(baseS2Start),
                endDate: formatISO(baseS2End),
                startDateVN: formatVN(baseS2Start),
                endDateVN: formatVN(baseS2End),
                dateRangeLabel: `${formatVN(baseS2Start)} – ${formatVN(baseS2End)}`,
              },
            },
          }
        : null,
      enrollments,
      isHistorical,
      selectedClassId: homeroomClass?.public_id || null,
      period: {
        month: targetMonth,
        year: targetYear,
        label: `Tháng ${targetMonth}/${targetYear}`,
        isEnded,
        isPublished: isMonthlyPublished,
      },
      monthWeeks,
      weekRanges: monthlyOverview?.classInfo?.weekRanges || [],
      weeklyStats,
      criteriaRules,
      record: {
        id: assessment?.public_id || null,
        isPublished: isMonthlyPublished,
        isDraft: !isMonthlyPublished,
        statusLabel: isMonthlyPublished ? 'Đã công bố' : 'Sổ bé ngoan chưa được công bố',
        rosesCount: isMonthlyPublished ? rosesCount : 0,
        maxRoses: 4,
        isLotus: isMonthlyPublished ? isLotus : false,
        weeks: {
          week1: isMonthlyPublished ? (weeklyStats.week1?.rose ?? false) : false,
          week2: isMonthlyPublished ? (weeklyStats.week2?.rose ?? false) : false,
          week3: isMonthlyPublished ? (weeklyStats.week3?.rose ?? false) : false,
          week4: isMonthlyPublished ? (weeklyStats.week4?.rose ?? false) : false,
        },
        teacherNotes: isMonthlyPublished ? (assessment?.teacher_notes || '') : '',
        evaluatorName: isMonthlyPublished ? evaluatorName : 'Cô giáo chủ nhiệm',
        parentFeedback: assessment?.parent_feedback || '',
        feedbackAt: assessment?.feedback_at
          ? new Date(assessment.feedback_at).toLocaleDateString('vi-VN')
          : null,
      },
      historyMonths,
      semesterAssessments: mappedSemesterAssessments,
    };
  }

  /**
   * 6b. GET /parent/schedule
   * Comprehensive Timetable, Attendance, Health, Slot Assessments & Dismissals
   */
  async getSchedule(accountSub, { classId, date, weekId, startDate, endDate } = {}) {
    const { student } = await this._getStudentForAccount(accountSub);

    let effectiveStartDate = startDate || null;
    let effectiveEndDate = endDate || null;

    if ((!effectiveStartDate || !effectiveEndDate) && weekId) {
      const resolved = resolveAcademicWeekDates(weekId);
      if (resolved) {
        effectiveStartDate = resolved.startDate;
        effectiveEndDate = resolved.endDate;
      }
    }

    if ((!effectiveStartDate || !effectiveEndDate) && date) {
      try {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          const dayOfWeek = d.getDay();
          const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const mon = new Date(d);
          mon.setDate(d.getDate() + diffToMon);
          const sun = new Date(mon);
          sun.setDate(mon.getDate() + 6);
          const pad = (n) => String(n).padStart(2, '0');
          effectiveStartDate = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
          effectiveEndDate = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;
        }
      } catch (err) {
        // ignore fallback
      }
    }

    const enrollments = (student.student_enrollments || []).map((e) => ({
      classId: e.class?.public_id,
      className: e.class?.name,
      ageGroup: e.class?.age_group,
      schoolYear: e.class?.school_year?.name,
      status: e.status,
      isCurrent: !e.left_at,
      enrolledAt: e.enrolled_at,
      leftAt: e.left_at,
    }));

    let selectedEnrollment = null;
    if (classId) {
      selectedEnrollment = student.student_enrollments?.find(
        (e) => e.class?.public_id === classId,
      );
    }
    if (!selectedEnrollment) {
      selectedEnrollment =
        student.student_enrollments?.find((e) => !e.left_at) ||
        student.student_enrollments?.[0];
    }

    const homeroomClass = selectedEnrollment?.class;
    const isHistorical = Boolean(selectedEnrollment?.left_at || selectedEnrollment?.status === 'COMPLETED');
    const primaryTeacher =
      homeroomClass?.teacher_classes?.find((tc) => !tc.left_at)?.teacher ||
      homeroomClass?.teacher_classes?.[0]?.teacher;

    // School year calendar holidays & events (Ngày nghỉ & sự kiện)
    let holidays = [];
    try {
      let schoolYearId = homeroomClass?.school_year_id;
      if (!schoolYearId) {
        const activeSY = await prisma.schoolYear.findFirst({
          where: { is_active: true, deleted_at: null },
        });
        schoolYearId = activeSY?.school_year_id;
      }

      if (schoolYearId) {
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
          const sDateStr = h.start_date.toISOString().slice(0, 10);
          const eDateStr = h.end_date.toISOString().slice(0, 10);
          const makeupDateStr = h.makeup_date ? h.makeup_date.toISOString().slice(0, 10) : null;
          return {
            id: h.public_id || h.holiday_id.toString(),
            name: h.name,
            startDate: sDateStr,
            endDate: eDateStr,
            makeupDate: makeupDateStr,
            isTeachingAllowed: h.is_teaching_allowed,
            type: itemType,
            targetGrades: h.target_grades || [],
            description: h.description,
            affectsClass: !h.target_grades?.length || (homeroomClass?.age_group ? h.target_grades.includes(homeroomClass.age_group) : true),
          };
        });
      }
    } catch (err) {
      logger.warn({ error: err.message }, 'Failed to load holidays in parent getSchedule');
    }

    // 1. Timetable routine slots
    const routineSlots = [
      {
        id: 'slot-1',
        slot: 'ARRIVAL_PLAY',
        time: '07:15 – 08:00',
        title: 'Đón trẻ & Chơi tự do',
        description: 'Cô giáo đón bé tại cửa lớp, kiểm tra thân nhiệt và hướng dẫn bé cất ba lô, giày dép vào tủ cá nhân.',
        icon: 'Sun',
        category: 'Đón trẻ',
      },
      {
        id: 'slot-2',
        slot: 'MORNING_EXERCISE',
        time: '08:00 – 08:30',
        title: 'Thể dục sáng',
        description: 'Tập thể dục đồng diễn toàn trường ngoài sân với các bài tập phát triển cơ thể và khởi động ngày mới.',
        icon: 'Activity',
        category: 'Thể chất',
      },
      {
        id: 'slot-3',
        slot: 'DIRECTED_STUDY',
        time: '08:30 – 09:15',
        title: 'Hoạt động học có chủ đích',
        description: 'Khám phá khoa học, làm quen với toán học và rèn luyện kỹ năng ngôn ngữ theo chủ đề tuần.',
        icon: 'BookOpen',
        category: 'Học tập',
      },
      {
        id: 'slot-4',
        slot: 'CORNER_PLAY',
        time: '09:15 – 10:15',
        title: 'Hoạt động chơi góc',
        description: 'Bé thỏa sức sáng tạo tại góc đóng vai, góc xây dựng, góc nghệ thuật tạo hình và âm nhạc.',
        icon: 'Gamepad2',
        category: 'Vui chơi',
      },
      {
        id: 'slot-5',
        slot: 'OUTDOOR_PLAY',
        time: '10:15 – 11:00',
        title: 'Chơi ngoài trời & Khám phá thiên nhiên',
        description: 'Vận động thể chất, hít thở không khí trong lành và quan sát vườn cây của trường.',
        icon: 'Trees',
        category: 'Thể chất',
      },
      {
        id: 'slot-6',
        slot: 'HYGIENE_MEAL_SLEEP',
        time: '11:00 – 14:00',
        title: 'Vệ sinh, Ăn trưa & Giấc ngủ trưa',
        description: 'Bé rửa tay sạch sẽ trước khi ăn, thưởng thức bữa trưa dinh dưỡng và ngủ trưa đúng giờ.',
        icon: 'Moon',
        category: 'Dinh dưỡng',
      },
      {
        id: 'slot-7',
        slot: 'AFTERNOON_ACTIVITY',
        time: '14:00 – 15:30',
        title: 'Bữa phụ & Sinh hoạt chiều',
        description: 'Thưởng thức sữa hoặc bánh hoa quả nhẹ, cùng cô ôn tập bài hát, thơ và rèn kỹ năng tự phục vụ.',
        icon: 'Coffee',
        category: 'Kỹ năng',
      },
      {
        id: 'slot-8',
        slot: 'RETURN_CHILD',
        time: '15:30 – 17:00',
        title: 'Trả trẻ & Trao đổi cùng phụ huynh',
        description: 'Cô giáo nhận diện người đón được ủy thác, trao đổi tình hình trong ngày và tạm biệt bé.',
        icon: 'HeartHandshake',
        category: 'Trả trẻ',
      },
    ];

    // Weekly scheduled activities (Đồng bộ 100% với kế hoạch tuần của lớp)
    let weeklyActivities = [];
    let activeTheme = null;
    let activeSubTheme = null;
    if (homeroomClass) {
      try {
        const slotWhere = {
          class_id: homeroomClass.class_id,
        };

        if (effectiveStartDate && effectiveEndDate) {
          slotWhere.scheduled_date = {
            gte: new Date(`${effectiveStartDate}T00:00:00.000Z`),
            lte: new Date(`${effectiveEndDate}T23:59:59.999Z`),
          };
        }

        const scheduledActivities = await prisma.subThemeActivity.findMany({
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
          orderBy: [{ scheduled_date: 'asc' }, { order_index: 'asc' }],
        });

        weeklyActivities = scheduledActivities.map((sa) => {
          const sDate = sa.scheduled_date ? new Date(sa.scheduled_date) : null;
          const pad = (n) => String(n).padStart(2, '0');
          const isoDate = sDate
            ? `${sDate.getFullYear()}-${pad(sDate.getMonth() + 1)}-${pad(sDate.getDate())}`
            : null;
          return {
            id: sa.id.toString(),
            dayOfWeek: sa.day_of_week,
            routineSlot: sa.routine_slot,
            title: sa.activity?.title || 'Hoạt động giáo dục',
            objective: sa.activity?.objective || null,
            procedure: sa.activity?.procedure || null,
            preparation: sa.activity?.preparation || null,
            domain: sa.activity?.content?.goal?.domain || 'COGNITIVE',
            goalCode: sa.activity?.content?.goal?.goal_code || null,
            goalTitle: sa.activity?.content?.goal?.title || null,
            status: sa.status,
            date: sDate ? `${pad(sDate.getDate())}/${pad(sDate.getMonth() + 1)}` : null,
            isoDate,
            rawDate: sa.scheduled_date,
          };
        });

        // Mirror makeup day activities if a holiday in this week has a makeupDate within the week
        const weekMakeupHolidays = holidays.filter((h) => {
          if (!h.makeupDate) return false;
          if (effectiveStartDate && effectiveEndDate) {
            return h.makeupDate >= effectiveStartDate && h.makeupDate <= effectiveEndDate;
          }
          return false;
        });

        for (const makeupHoliday of weekMakeupHolidays) {
          const makeupDateStr = makeupHoliday.makeupDate;
          const hasActivitiesOnMakeup = weeklyActivities.some((a) => a.isoDate === makeupDateStr);
          if (!hasActivitiesOnMakeup) {
            const origHolidayIso = makeupHoliday.startDate;
            const origActs = weeklyActivities.filter((a) => a.isoDate === origHolidayIso);
            if (origActs.length > 0) {
              const [my, mm, md] = makeupDateStr.split('-');
              const origDateFormatted = origHolidayIso.slice(8, 10) + '/' + origHolidayIso.slice(5, 7);
              const mDateObj = new Date(`${makeupDateStr}T00:00:00.000Z`);
              const dow = mDateObj.getUTCDay() === 0 ? 'SUNDAY' : 'SATURDAY';
              const mirrored = origActs.map((act, idx) => ({
                ...act,
                id: `makeup-${act.id || idx}`,
                dayOfWeek: dow,
                date: `${md}/${mm}`,
                isoDate: makeupDateStr,
                rawDate: mDateObj,
                isMakeup: true,
                makeupHolidayName: makeupHoliday.name,
                makeupOriginalDate: origHolidayIso,
                notes: `[Học bù ngày ${origDateFormatted}]`,
              }));
              weeklyActivities.push(...mirrored);
            }
          }
        }

        // Resolve theme & subTheme matching the requested date range
        const themes = await prisma.curriculumTheme.findMany({
          where: {
            school_year_id: homeroomClass.school_year_id,
            age_group: homeroomClass.age_group,
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

          if (foundTheme) {
            activeTheme = {
              id: foundTheme.public_id,
              name: foundTheme.name,
            };
            if (foundSubTheme) {
              activeSubTheme = {
                id: foundSubTheme.public_id,
                name: foundSubTheme.name,
              };
            }
          }
        }
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to load schedule activities or themes');
      }
    }

    // 2. Attendance history for this class
    const attendances = await prisma.attendance.findMany({
      where: {
        student_id: student.student_id,
        ...(homeroomClass?.class_id ? { class_id: homeroomClass.class_id } : {}),
        deleted_at: null,
      },
      orderBy: { date: 'desc' },
      take: 60,
    });

    const totalDays = attendances.length;
    const presentDays = attendances.filter((a) => a.status === 'PRESENT').length;
    const excusedDays = attendances.filter((a) => a.status === 'EXCUSED_ABSENCE').length;
    const unexcusedDays = attendances.filter((a) => a.status === 'UNEXCUSED_ABSENCE').length;
    const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

    const formattedAttendances = attendances.map((a) => {
      const isAbsent = a.status === 'EXCUSED_ABSENCE' || a.status === 'UNEXCUSED_ABSENCE';
      const hasCheckOut = Boolean(a.check_out_time || a.pickup_person_name);

      const checkInTimeStr = a.check_in_time
        ? new Date(a.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : (a.status === 'PRESENT' ? '07:30' : null);
      const checkOutTimeStr = a.check_out_time
        ? new Date(a.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : null;

      let computedStatus = a.status;
      let statusLabel = 'Đã điểm danh';
      if (a.status === 'EXCUSED_ABSENCE') {
        computedStatus = 'EXCUSED_ABSENCE';
        statusLabel = 'Nghỉ có phép';
      } else if (a.status === 'UNEXCUSED_ABSENCE') {
        computedStatus = 'UNEXCUSED_ABSENCE';
        statusLabel = 'Nghỉ không phép';
      } else if (hasCheckOut) {
        computedStatus = 'PICKED_UP';
        statusLabel = 'Đã đón';
      } else {
        computedStatus = 'AT_SCHOOL';
        statusLabel = 'Đã điểm danh';
      }

      return {
        id: a.public_id,
        date: new Date(a.date).toLocaleDateString('vi-VN'),
        isoDate: a.date ? new Date(a.date).toISOString().slice(0, 10) : null,
        rawDate: a.date,
        dayOfWeek: new Date(a.date).toLocaleDateString('vi-VN', { weekday: 'long' }),
        status: computedStatus,
        rawStatus: a.status,
        statusLabel,
        checkInTime: checkInTimeStr,
        checkOutTime: checkOutTimeStr,
        pickupPersonName: a.pickup_person_name || null,
        pickupPersonPhone: a.pickup_person_phone || null,
        pickupRelationship: a.pickup_relationship || null,
        pickupCitizenId: a.pickup_citizen_id || null,
        pickupPhotoUrl: a.pickup_photo_url || null,
        pickupNote: a.pickup_note || null,
        notes: a.notes || null,
      };
    });

    // 3. Slot Assessments (Đánh giá theo từng slot hoạt động)
    const assessmentWhere = {
      student_id: student.student_id,
    };
    if (effectiveStartDate && effectiveEndDate) {
      assessmentWhere.assessment_date = {
        gte: new Date(`${effectiveStartDate}T00:00:00.000Z`),
        lte: new Date(`${effectiveEndDate}T23:59:59.999Z`),
      };
    }
    const dailyAssessments = await prisma.dailyAssessment.findMany({
      where: assessmentWhere,
      include: {
        activity: {
          include: {
            content: {
              include: { goal: true },
            },
          },
        },
        evaluator: {
          include: { teacher: true },
        },
      },
      orderBy: { assessment_date: 'desc' },
      take: 60,
    });

    const slotAssessments = dailyAssessments.map((da) => {
      const aDate = da.assessment_date ? new Date(da.assessment_date) : null;
      const pad = (n) => String(n).padStart(2, '0');
      const isoDate = aDate ? `${aDate.getFullYear()}-${pad(aDate.getMonth() + 1)}-${pad(aDate.getDate())}` : null;
      const dateFormatted = aDate ? `${pad(aDate.getDate())}/${pad(aDate.getMonth() + 1)}` : null;

      return {
        id: da.public_id,
        date: aDate ? aDate.toLocaleDateString('vi-VN') : null,
        dateFormatted,
        isoDate,
        rawDate: da.assessment_date,
        routineSlot: da.activity?.routine_slot || 'DIRECTED_STUDY',
        slotName:
          da.activity?.routine_slot === 'ARRIVAL_PLAY'
            ? 'Đón trẻ & Thể dục sáng'
            : da.activity?.routine_slot === 'DIRECTED_STUDY'
              ? 'Hoạt động học có chủ đích'
              : da.activity?.routine_slot === 'CORNER_PLAY'
                ? 'Hoạt động chơi góc'
                : da.activity?.routine_slot === 'OUTDOOR_PLAY'
                  ? 'Chơi ngoài trời'
                  : da.activity?.routine_slot === 'HYGIENE_MEAL_SLEEP'
                    ? 'Ăn trưa & Giấc ngủ'
                    : da.activity?.routine_slot === 'AFTERNOON_ACTIVITY'
                      ? 'Sinh hoạt chiều'
                      : 'Hoạt động trong ngày',
        activityTitle: da.activity?.title || 'Hoạt động giáo dục',
        goalTitle: da.activity?.content?.goal?.title || 'Phát triển kỹ năng theo lứa tuổi',
        domain: da.activity?.content?.goal?.domain || 'COGNITIVE',
        status: da.status,
        statusLabel:
          da.status === 'EXCELLENT'
            ? 'Xuất sắc'
            : da.status === 'ACHIEVED'
              ? 'Đạt'
              : da.status === 'NOT_ACHIEVED'
                ? 'Cần rèn thêm'
                : 'Chờ đánh giá',
        statusColor:
          da.status === 'EXCELLENT'
            ? 'emerald'
            : da.status === 'ACHIEVED'
              ? 'blue'
              : da.status === 'NOT_ACHIEVED'
                ? 'rose'
                : 'amber',
        notes: da.notes || 'Bé hợp tác tốt và hoàn thành yêu cầu hoạt động.',
        evaluatorName: da.evaluator?.teacher?.full_name || 'Cô giáo chủ nhiệm',
      };
    });

    // 4. Health Assessments history
    const healthAssessments = await prisma.healthAssessment.findMany({
      where: {
        student_id: student.student_id,
        deleted_at: null,
      },
      orderBy: { assessment_date: 'desc' },
      include: {
        recorder: {
          include: { teacher: true },
        },
      },
    });

    const healthRecords = healthAssessments.map((h) => {
      const bmiInfo = this._calculateBmiCategory(h.bmi, {
        heightZ: h.height_for_age_zscore,
        weightZ: h.weight_for_age_zscore,
        bmiZ: h.bmi_for_age_zscore,
      });
      return {
        id: h.public_id,
        date: new Date(h.assessment_date).toLocaleDateString('vi-VN'),
        rawDate: h.assessment_date,
        height: Number(h.height),
        weight: Number(h.weight),
        bmi: Number(h.bmi),
        bmiCategory: bmiInfo.label,
        bmiColor: bmiInfo.color,
        heightZscore: h.height_for_age_zscore ? Number(h.height_for_age_zscore) : null,
        weightZscore: h.weight_for_age_zscore ? Number(h.weight_for_age_zscore) : null,
        bmiZscore: h.bmi_for_age_zscore ? Number(h.bmi_for_age_zscore) : null,
        notes: h.notes || 'Sức khỏe bình thường, phát triển cân đối.',
        recordedBy: h.recorder?.teacher?.full_name || 'Giáo viên phụ trách',
      };
    });

    // 5. Dismissal History (Đón trẻ)
    const dismissals = attendances
      .filter((a) => a.check_out_time || a.pickup_person_name)
      .map((a) => ({
        id: a.public_id,
        date: new Date(a.date).toLocaleDateString('vi-VN'),
        rawDate: a.date,
        checkInTime: a.check_in_time
          ? new Date(a.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          : null,
        checkOutTime: a.check_out_time
          ? new Date(a.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          : '16:45',
        pickupPersonName: a.pickup_person_name || 'Phụ huynh',
        pickupRelationship: a.pickup_relationship || 'Gia đình',
        pickupCitizenId: a.pickup_citizen_id || null,
        pickupPhotoUrl: a.pickup_photo_url || null,
        pickupNote: a.pickup_note || 'Đón bé an toàn, đúng giờ.',
      }));

    // 6. Pickup Authorizations (Ủy quyền đón học sinh)
    const pickupAuthorizations = await prisma.pickupAuthorization.findMany({
      where: {
        student_id: student.student_id,
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
      include: {
        approver: {
          include: { teacher: true },
        },
      },
    });

    const formattedAuthorizations = pickupAuthorizations.map((r) => ({
      id: r.public_id,
      pickupPersonName: r.pickup_person_name,
      pickupPersonPhone: r.pickup_person_phone,
      pickupCitizenId: r.pickup_citizen_id || null,
      relationship: r.relationship,
      photoUrl: r.photo_url || null,
      note: r.note || null,
      startDate: new Date(r.start_date).toLocaleDateString('vi-VN'),
      endDate: new Date(r.end_date).toLocaleDateString('vi-VN'),
      status: r.status,
      statusLabel:
        r.status === 'APPROVED'
          ? 'Đã duyệt'
          : r.status === 'PENDING'
            ? 'Chờ duyệt'
            : r.status === 'REJECTED'
              ? 'Từ chối'
              : 'Đã hủy',
      statusColor:
        r.status === 'APPROVED'
          ? 'emerald'
          : r.status === 'PENDING'
            ? 'amber'
            : r.status === 'REJECTED'
              ? 'rose'
              : 'gray',
      approverName: r.approver?.teacher?.full_name || null,
      createdAt: new Date(r.created_at).toLocaleDateString('vi-VN'),
    }));

    const siblings = await this._getSiblingStudents(student);

    return {
      siblings,
      student: {
        id: student.public_id,
        fullName: student.full_name,
        studentCode: student.student_code,
      },
      classInfo: homeroomClass
        ? {
            id: homeroomClass.public_id,
            name: homeroomClass.name,
            ageGroup: homeroomClass.age_group,
            roomNumber: homeroomClass.room_number,
            schoolYear: homeroomClass.school_year?.name,
            isHistorical,
            status: selectedEnrollment?.status,
          }
        : null,
      primaryTeacher: primaryTeacher
        ? {
            fullName: primaryTeacher.full_name,
            phone: primaryTeacher.phone,
            email: primaryTeacher.email,
            avatarUrl: primaryTeacher.avatar_url,
          }
        : null,
      teachers: (homeroomClass?.teacher_classes || [])
        .filter((tc) => !tc.left_at)
        .map((tc) => ({
          id: tc.teacher?.public_id,
          fullName: tc.teacher?.full_name,
          phone: tc.teacher?.phone,
          email: tc.teacher?.email,
          avatarUrl: tc.teacher?.avatar_url,
          employeeCode: tc.teacher?.employee_code,
          position: tc.teacher?.position || 'Giáo viên phụ trách',
        })),
      enrollments,
      isHistorical,
      selectedClassId: homeroomClass?.public_id || null,
      holidays,
      timetable: {
        routineSlots,
        weeklyActivities,
        theme: activeTheme,
        subTheme: activeSubTheme,
        holidays,
      },
      attendances: formattedAttendances,
      attendance: {
        summary: {
          totalDays,
          presentDays,
          excusedDays,
          unexcusedDays,
          attendanceRate,
        },
        records: formattedAttendances,
      },
      slotAssessments,
      health: {
        latest: healthRecords[0] || null,
        history: healthRecords,
      },
      dismissals,
      pickupAuthorizations: formattedAuthorizations,
    };
  }

  /**
   * 7. POST /parent/good-behavior/feedback
   * Submit parent response & feedback to teacher's evaluation
   */
  async submitGoodBehaviorFeedback(accountSub, { month, year, feedback }) {
    const { account, student } = await this._getStudentForAccount(accountSub);

    if (!feedback?.trim()) {
      throw BadRequest('Vui lòng nhập nội dung phản hồi.');
    }

    const today = new Date();
    const targetMonth = month ? parseInt(month, 10) : today.getMonth() + 1;
    const targetYear = year ? parseInt(year, 10) : today.getFullYear();

    // Check if monthly assessment exists
    let assessment = await prisma.monthlyAssessment.findFirst({
      where: {
        student_id: student.student_id,
        month: targetMonth,
        year: targetYear,
      },
    });

    if (!assessment) {
      // Upsert / Create monthly assessment record so parent feedback is persisted cleanly
      const activeEnr =
        student.student_enrollments?.find((e) => !e.left_at) ||
        student.student_enrollments?.[0];
      const classId = activeEnr?.class_id;
      if (!classId) {
        throw NotFound('Không tìm thấy lớp học của học sinh.');
      }
      assessment = await prisma.monthlyAssessment.create({
        data: {
          student_id: student.student_id,
          class_id: classId,
          month: targetMonth,
          year: targetYear,
          evaluated_by: BigInt(40),
          teacher_notes: '',
          parent_feedback: feedback.trim(),
          feedback_at: new Date(),
          feedback_by: account.account_id,
        },
      });
      return {
        message: 'Gửi phản hồi thành công đến giáo viên chủ nhiệm!',
        parentFeedback: assessment.parent_feedback,
        feedbackAt: new Date(assessment.feedback_at).toLocaleDateString('vi-VN'),
        feedbackBy: account.account_id,
      };
    }

    const updated = await prisma.monthlyAssessment.update({
      where: { monthly_assessment_id: assessment.monthly_assessment_id },
      data: {
        parent_feedback: feedback.trim(),
        feedback_at: new Date(),
        feedback_by: account.account_id,
      },
    });

    // Notification 16: Add Parent Comment (PH gửi nhận xét trong sổ theo dõi tháng -> GV phụ trách trẻ)
    (async () => {
      try {
        const activeEnr =
          student.student_enrollments?.find((e) => !e.left_at) ||
          student.student_enrollments?.[0];
        const classId = assessment.class_id || activeEnr?.class_id;
        if (classId) {
          const teacherAccountIds = await notificationService.getClassTeacherAccountIds(classId);
          if (teacherAccountIds.length > 0) {
            await notificationService.emitSystemNotification({
              recipientAccountIds: teacherAccountIds,
              creatorAccountId: account.account_id,
              type: 'MONTHLY_ROSE_REPORT',
              title: `Ý kiến phụ huynh: bé ${student.full_name}`,
              body: `Phụ huynh bé ${student.full_name} đã gửi ý kiến nhận xét trong sổ theo dõi tháng ${targetMonth}/${targetYear}.`,
              data: {
                type: 'PARENT_COMMENT_ADDED',
                studentId: student.student_id.toString(),
                month: targetMonth,
                year: targetYear,
              },
            });
          }
        }
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to emit notification for parent monthly feedback');
      }
    })();

    return {
      message: 'Gửi phản hồi thành công đến giáo viên chủ nhiệm!',
      parentFeedback: updated.parent_feedback,
      feedbackAt: new Date(updated.feedback_at).toLocaleDateString('vi-VN'),
    };
  }

  /**
   * 8. GET /parent/notifications
   * Notification popover data
   */
  async getNotifications(accountSub) {
    const account = await prisma.account.findUnique({
      where: { public_id: accountSub },
    });

    if (!account) throw NotFound('Không tìm thấy tài khoản.');

    const now = new Date();
    const notifications = await prisma.notification.findMany({
      where: {
        account_id: account.account_id,
        deleted_at: null,
        OR: [{ scheduled_at: null }, { scheduled_at: { lte: now } }],
      },
      orderBy: { created_at: 'desc' },
      take: 30,
    });

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    return {
      unreadCount,
      notifications: notifications.map((n) => ({
        id: n.public_id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        isRead: n.is_read,
        createdAt: new Date(n.created_at).toLocaleDateString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      })),
    };
  }

  /**
   * 9. PATCH /parent/notifications/:id/read
   */
  async markNotificationRead(accountSub, notificationPublicId) {
    const account = await prisma.account.findUnique({
      where: { public_id: accountSub },
    });

    if (!account) throw NotFound('Không tìm thấy tài khoản.');

    if (notificationPublicId === 'all') {
      await prisma.notification.updateMany({
        where: { account_id: account.account_id, is_read: false },
        data: { is_read: true, read_at: new Date() },
      });
      return { message: 'Đã đánh dấu đọc tất cả thông báo.' };
    }

    await prisma.notification.updateMany({
      where: {
        public_id: notificationPublicId,
        account_id: account.account_id,
      },
      data: { is_read: true, read_at: new Date() },
    });

    return { message: 'Đã đánh dấu thông báo là đã đọc.' };
  }

  /**
   * 9. GET /parent/student-report
   * Comprehensive Individual Student Report for Parent (Health, Attendance, Assessments)
   */
  async getStudentReport(accountSub, { studentId, semester } = {}) {
    const { student } = await this._getStudentForAccount(accountSub, studentId);

    const siblings = await this._getSiblingStudents(student);

    const activeEnrollment =
      student.student_enrollments?.find((e) => !e.left_at) ||
      student.student_enrollments?.[0];

    if (!activeEnrollment || !activeEnrollment.class) {
      return {
        student: {
          id: student.student_id.toString(),
          publicId: student.public_id,
          studentCode: student.student_code,
          fullName: student.full_name,
          gender: student.gender === 'MALE' ? 'Nam' : 'Nữ',
          dateOfBirth: student.date_of_birth
            ? new Date(student.date_of_birth).toISOString().slice(0, 10)
            : '',
          avatarUrl: student.avatar_url,
        },
        classInfo: null,
        semesterInfo: null,
        health: { totalChecks: 0, latest: null, history: [] },
        attendance: {
          totalDays: 0,
          presentCount: 0,
          excusedCount: 0,
          unexcusedCount: 0,
          attendanceRate: null,
          history: [],
        },
        assessments: {
          totalAssessed: 0,
          achievedCount: 0,
          outstandingCount: 0,
          notAchievedCount: 0,
          history: [],
        },
        siblings,
      };
    }

    const classId = activeEnrollment.class.public_id || activeEnrollment.class.class_id.toString();
    const fullReport = await classService.getStudentReport(classId, student.public_id, semester);

    // Omit studentList (whole class) to preserve privacy
    const { studentList, ...parentSafeReport } = fullReport;

    return {
      ...parentSafeReport,
      siblings,
    };
  }

  /**
   * Link another child account to current parent and persist in DB
   */
  async linkChild(accountSub, { identifier, password }) {
    if (!identifier || !password) {
      throw new BadRequest('Vui lòng nhập đầy đủ mã học sinh và mật khẩu.');
    }

    const currentAccount = await prisma.account.findUnique({
      where: { public_id: accountSub },
      include: {
        student: {
          include: {
            parents: { where: { deleted_at: null } },
          },
        },
      },
    });

    if (!currentAccount || !currentAccount.student) {
      throw new Forbidden('Tài khoản hiện tại không phải tài khoản phụ huynh học sinh.');
    }

    const currentStudent = currentAccount.student;

    // Find target child account by username or student_code
    const targetAccount = await prisma.account.findFirst({
      where: {
        OR: [
          { username: identifier.trim() },
          { student: { student_code: identifier.trim(), deleted_at: null } },
        ],
        role: 'PARENT_PH',
        deleted_at: null,
      },
      include: {
        student: {
          include: {
            parents: { where: { deleted_at: null } },
            student_enrollments: {
              where: { left_at: null },
              include: { class: true },
            },
          },
        },
      },
    });

    if (!targetAccount || !targetAccount.student) {
      throw new BadRequest('Mã học sinh hoặc mật khẩu không chính xác.');
    }

    const isMatch = await bcrypt.compare(password, targetAccount.password_hash);
    if (!isMatch) {
      throw new BadRequest('Mã học sinh hoặc mật khẩu không chính xác.');
    }

    const targetStudent = targetAccount.student;

    if (targetStudent.student_id === currentStudent.student_id) {
      throw new BadRequest('Không thể liên kết với chính tài khoản đang đăng nhập.');
    }

    // Persist link in DB: Sync parent records so both students have matching parent info
    const curParents = currentStudent.parents || [];
    const targetParents = targetStudent.parents || [];

    let bestParent = curParents.find((p) => p.phone || p.citizen_id) || targetParents.find((p) => p.phone || p.citizen_id);
    if (!bestParent) {
      bestParent = {
        full_name: 'Phụ huynh ' + currentStudent.full_name,
        relationship: 'Phụ huynh',
        phone: '09' + String(currentStudent.student_id).padStart(8, '0'),
        citizen_id: '079' + String(currentStudent.student_id).padStart(9, '0'),
      };
    }

    // Ensure current student has bestParent info
    if (curParents.length === 0) {
      await prisma.parent.create({
        data: {
          student_id: currentStudent.student_id,
          full_name: bestParent.full_name,
          relationship: bestParent.relationship || 'Bố',
          phone: bestParent.phone || '0900000000',
          citizen_id: bestParent.citizen_id || null,
        },
      });
    }

    // Ensure target student has identical parent contact to establish sibling relation in DB
    const matchingInTarget = targetParents.find(
      (p) =>
        (bestParent.citizen_id && p.citizen_id === bestParent.citizen_id) ||
        (bestParent.phone && p.phone === bestParent.phone && p.full_name?.toLowerCase() === bestParent.full_name?.toLowerCase())
    );

    if (!matchingInTarget) {
      if (targetParents.length > 0) {
        await prisma.parent.update({
          where: { parent_id: targetParents[0].parent_id },
          data: {
            full_name: bestParent.full_name,
            phone: bestParent.phone || targetParents[0].phone,
            citizen_id: bestParent.citizen_id || targetParents[0].citizen_id,
          },
        });
      } else {
        await prisma.parent.create({
          data: {
            student_id: targetStudent.student_id,
            full_name: bestParent.full_name,
            relationship: bestParent.relationship || 'Bố',
            phone: bestParent.phone || '0900000000',
            citizen_id: bestParent.citizen_id || null,
          },
        });
      }
    }

    // Generate accessToken for target student
    const createdSession = await prisma.refreshToken.create({
      data: {
        account_id: targetAccount.account_id,
        token_hash: 'linked-child-session',
        device_info: 'Parent Portal Multi-Child',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const accessToken = jwt.sign(
      {
        sub: targetAccount.public_id,
        role: targetAccount.role,
        sid: String(createdSession.token_id),
      },
      env.jwt.accessSecret,
      { expiresIn: env.jwt.accessTtl },
    );

    // Refresh sibling list
    const updatedSiblings = await this._getSiblingStudents(currentStudent);

    const activeEnr = targetStudent.student_enrollments?.[0];
    const targetUser = {
      id: targetAccount.public_id,
      name: targetStudent.full_name,
      fullName: targetStudent.full_name,
      role: 'PARENT_PH',
      identifier: targetStudent.student_code,
      student: {
        id: targetStudent.public_id,
        studentCode: targetStudent.student_code,
        fullName: targetStudent.full_name,
        className: activeEnr?.class?.name || null,
        classId: activeEnr?.class?.public_id || null,
        avatarUrl: targetStudent.avatar_url,
      },
      avatarUrl: targetStudent.avatar_url,
    };

    return {
      user: targetUser,
      accessToken,
      siblings: updatedSiblings,
    };
  }

  /**
   * Seamlessly switch to a verified sibling student without password re-entry
   */
  async switchChild(accountSub, { studentId }) {
    if (!studentId) {
      throw new BadRequest('Vui lòng cung cấp mã hoặc định danh học sinh.');
    }

    const currentAccount = await prisma.account.findUnique({
      where: { public_id: accountSub },
      include: {
        student: {
          include: {
            parents: { where: { deleted_at: null } },
          },
        },
      },
    });

    if (!currentAccount || !currentAccount.student) {
      throw new Forbidden('Tài khoản hiện tại không phải tài khoản phụ huynh học sinh.');
    }

    const siblings = await this._getSiblingStudents(currentAccount.student);
    const matchedSibling = siblings.find(
      (s) =>
        s.id === studentId ||
        s.studentCode === studentId ||
        s.username === studentId ||
        String(s.studentId) === studentId
    );

    if (!matchedSibling) {
      throw new Forbidden('Hồ sơ học sinh này không nằm trong danh sách các con đã liên kết.');
    }

    const targetStudent = await prisma.student.findFirst({
      where: {
        OR: [
          { public_id: matchedSibling.id },
          { student_code: matchedSibling.studentCode },
        ],
        deleted_at: null,
      },
      include: {
        account: true,
        student_enrollments: {
          where: { left_at: null },
          include: { class: true },
        },
      },
    });

    if (!targetStudent) {
      throw new NotFound('Không tìm thấy hồ sơ học sinh này.');
    }

    let targetAccount = targetStudent.account;
    if (!targetAccount) {
      // Find or create account for the sibling student on the fly
      targetAccount = await prisma.account.findUnique({
        where: { username: targetStudent.student_code },
      });

      if (!targetAccount) {
        const defaultPassword = await bcrypt.hash('Sorak@2026', 10);
        targetAccount = await prisma.account.create({
          data: {
            username: targetStudent.student_code,
            password_hash: defaultPassword,
            role: 'PARENT_PH',
            is_active: true,
          },
        });
      }

      await prisma.student.update({
        where: { student_id: targetStudent.student_id },
        data: { account_id: targetAccount.account_id },
      });
    }

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const createdSession = await prisma.refreshToken.create({
      data: {
        account_id: targetAccount.account_id,
        token_hash: tokenHash,
        device_info: 'Parent Portal Switcher',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const accessToken = jwt.sign(
      {
        sub: targetAccount.public_id,
        role: targetAccount.role,
        sid: String(createdSession.token_id),
      },
      env.jwt.accessSecret,
      { expiresIn: env.jwt.accessTtl },
    );

    const activeEnr = targetStudent.student_enrollments?.[0];
    const targetUser = {
      id: targetAccount.public_id,
      name: targetStudent.full_name,
      fullName: targetStudent.full_name,
      role: 'PARENT_PH',
      identifier: targetStudent.student_code,
      student: {
        id: targetStudent.public_id,
        studentCode: targetStudent.student_code,
        fullName: targetStudent.full_name,
        className: activeEnr?.class?.name || null,
        classId: activeEnr?.class?.public_id || null,
        avatarUrl: targetStudent.avatar_url,
      },
      avatarUrl: targetStudent.avatar_url,
      siblings,
    };

    return {
      user: targetUser,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }
}

export const parentService = new ParentService();
export default parentService;
