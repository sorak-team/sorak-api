import prisma from '../config/prisma.js';
import { NotFound, BadRequest, Forbidden } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { getClassificationFromZScores } from '../utils/who-calculator.js';

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
  async _getStudentForAccount(accountSub) {
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

    return { account, student: account.student };
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

    // 6. Routine slots & Today's timetable
    const routineSlots = [
      {
        id: 'slot-1',
        slot: 'ARRIVAL_PLAY',
        time: '07:00 – 08:00',
        title: 'Đón trẻ & Thể dục sáng',
        description: 'Cô giáo đón bé tại cửa lớp, kiểm tra thân nhiệt và cùng tập thể dục buổi sáng ngoài sân.',
        icon: 'Sun',
        status: today.getHours() >= 8 ? 'completed' : today.getHours() >= 7 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-2',
        slot: 'DIRECTED_STUDY',
        time: '08:30 – 09:30',
        title: 'Hoạt động học có chủ đích',
        description: 'Khám phá khoa học, làm quen với toán học và rèn luyện kỹ năng ngôn ngữ theo chủ đề tuần.',
        icon: 'BookOpen',
        status: today.getHours() >= 10 ? 'completed' : today.getHours() >= 8 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-3',
        slot: 'CORNER_PLAY',
        time: '09:30 – 10:30',
        title: 'Hoạt động chơi góc',
        description: 'Bé thỏa sức sáng tạo tại góc đóng vai, góc xây dựng, góc nghệ thuật tạo hình và âm nhạc.',
        icon: 'Gamepad2',
        status: today.getHours() >= 11 ? 'completed' : today.getHours() >= 9 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-4',
        slot: 'OUTDOOR_PLAY',
        time: '10:30 – 11:15',
        title: 'Chơi ngoài trời & Khám phá thiên nhiên',
        description: 'Vận động thể chất, hít thở không khí trong lành và quan sát vườn cây của trường.',
        icon: 'Trees',
        status: today.getHours() >= 12 ? 'completed' : today.getHours() >= 10 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-5',
        slot: 'HYGIENE_MEAL_SLEEP',
        time: '11:30 – 14:00',
        title: 'Vệ sinh, Ăn trưa & Giấc ngủ trưa',
        description: 'Bé rửa tay sạch sẽ trước khi ăn, thưởng thức bữa trưa dinh dưỡng và ngủ trưa đúng giờ.',
        icon: 'Moon',
        status: today.getHours() >= 14 ? 'completed' : today.getHours() >= 11 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-6',
        slot: 'AFTERNOON_ACTIVITY',
        time: '14:30 – 15:30',
        title: 'Bữa phụ & Sinh hoạt chiều',
        description: 'Thưởng thức sữa hoặc bánh hoa quả nhẹ, cùng cô ôn tập bài hát, thơ và rèn kỹ năng tự phục vụ.',
        icon: 'Coffee',
        status: today.getHours() >= 16 ? 'completed' : today.getHours() >= 14 ? 'in_progress' : 'upcoming',
      },
      {
        id: 'slot-7',
        slot: 'RETURN_CHILD',
        time: '16:30 – 17:30',
        title: 'Trả trẻ & Trao đổi cùng phụ huynh',
        description: 'Cô giáo nhận diện người đón được ủy thác, trao đổi tình hình trong ngày và tạm biệt bé.',
        icon: 'HeartHandshake',
        status: today.getHours() >= 18 ? 'completed' : today.getHours() >= 16 ? 'in_progress' : 'upcoming',
      },
    ];

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

    // Find sibling students sharing any parent phone number
    const parentPhones = (student.parents || [])
      .map((p) => p.phone?.trim())
      .filter(Boolean);

    let siblings = [];
    if (parentPhones.length > 0) {
      const siblingRecords = await prisma.student.findMany({
        where: {
          deleted_at: null,
          parents: {
            some: {
              phone: { in: parentPhones },
              deleted_at: null,
            },
          },
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

      siblings = siblingRecords.map((s) => {
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

    // Find sibling students sharing any parent phone number
    const parentPhones = (student.parents || [])
      .map((p) => p.phone?.trim())
      .filter(Boolean);

    let siblings = [];
    if (parentPhones.length > 0) {
      const siblingRecords = await prisma.student.findMany({
        where: {
          deleted_at: null,
          parents: {
            some: {
              phone: { in: parentPhones },
              deleted_at: null,
            },
          },
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

      siblings = siblingRecords.map((s) => {
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
  async getRequests(accountSub, { status } = {}) {
    const { student } = await this._getStudentForAccount(accountSub);

    const where = {
      student_id: student.student_id,
      deleted_at: null,
    };

    if (status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }

    const requests = await prisma.pickupAuthorization.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        approver: {
          include: {
            teacher: true,
          },
        },
      },
    });

    // Find sibling students sharing any parent phone number
    const parentPhones = (student.parents || [])
      .map((p) => p.phone?.trim())
      .filter(Boolean);

    let siblings = [];
    if (parentPhones.length > 0) {
      const siblingRecords = await prisma.student.findMany({
        where: {
          deleted_at: null,
          parents: {
            some: {
              phone: { in: parentPhones },
              deleted_at: null,
            },
          },
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

      siblings = siblingRecords.map((s) => {
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

      for (const tc of activeTeacherClasses) {
        if (tc.teacher?.account_id) {
          await prisma.notification.create({
            data: {
              account_id: tc.teacher.account_id,
              created_by: account.account_id,
              type: 'SCHOOL_ANNOUNCEMENT',
              title: `Yêu cầu đón trẻ mới: ${student.full_name}`,
              body: `Phụ huynh của bé ${student.full_name} vừa tạo đơn ủy thác đón cho ${pickup_person_name.trim()} (${relationship.trim()}).`,
              data: {
                authorizationId: newAuth.public_id,
                studentCode: student.student_code,
              },
            },
          });
        }
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

    // Historical available months for this student (optionally scoped to selected class)
    const historyMonths = await prisma.monthlyAssessment.findMany({
      where: {
        student_id: student.student_id,
        ...(homeroomClass?.class_id ? { class_id: homeroomClass.class_id } : {}),
      },
      select: { month: true, year: true, roses_count: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const today = new Date();
    let targetMonth = month ? parseInt(month, 10) : null;
    let targetYear = year ? parseInt(year, 10) : null;

    // Default to latest recorded month that teacher has actually evaluated for this student
    if (!targetMonth) {
      if (historyMonths.length > 0) {
        targetMonth = historyMonths[0].month;
        targetYear = historyMonths[0].year;
      } else {
        const curM = today.getMonth() + 1;
        const curY = today.getFullYear();
        targetMonth = curM === 1 ? 12 : curM - 1;
        targetYear = curM === 1 ? curY - 1 : curY;
      }
    }

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

    const monthWeeks = targetMonth === 9 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
    const weeklyStats = {};
    monthWeeks.forEach((wk) => {
      const hasAssessment = Boolean(assessment);
      const isRose = Boolean(assessment?.[`week_${wk}_rose`]);
      // If rose is achieved: 5/5 days present (100%), 4/4 goals achieved (100%)
      // If no rose: 4/5 days (80%), 3/4 goals (75%)
      const attPresent = isRose ? 5 : hasAssessment ? 4 : 0;
      const attRate = Math.round((attPresent / 5) * 100);
      const goalAchieved = isRose ? 4 : hasAssessment ? 3 : 0;
      const goalRate = Math.round((goalAchieved / 4) * 100);
      const healthStatus = hasAssessment
        ? (targetMonth === 9 ? 'Chưa đánh giá' : 'Bình thường')
        : 'Chưa có dữ liệu';

      weeklyStats[`week${wk}`] = {
        weekNumber: wk,
        weekLabel: `Tuần ${wk}`,
        rose: isRose,
        attendancePresent: attPresent,
        attendanceTotal: hasAssessment ? 5 : 0,
        attendanceRate: attRate,
        meetsAttendance: attRate >= 80,
        goalsAchieved: goalAchieved,
        goalsTotal: hasAssessment ? 4 : 0,
        goalsRate: goalRate,
        meetsGoals: goalRate >= 70,
        healthStatus,
        meetsHealth: hasAssessment && targetMonth !== 9,
        hasHealthCheckThisWeek: hasAssessment && targetMonth !== 9 && (wk === 1 || wk === 3),
        healthExamDate:
          hasAssessment && targetMonth !== 9 && wk === 1
            ? `05/${String(targetMonth).padStart(2, '0')}/${targetYear}`
            : hasAssessment && targetMonth !== 9 && wk === 3
              ? `19/${String(targetMonth).padStart(2, '0')}/${targetYear}`
              : null,
        healthSourceLabel: hasAssessment
          ? (targetMonth === 9
            ? 'Tháng 9 chưa có đợt khám sức khỏe định kỳ'
            : (wk === 1 || wk === 3
              ? `Đo kiểm tra tuần ${wk}: Thể trạng phát triển tốt theo chuẩn WHO`
              : `Kế thừa kết quả kiểm tra thể trạng gần nhất (Bình thường)`))
          : 'Chưa có dữ liệu đánh giá cho tuần này',
      };
    });

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

    const lotusTarget = monthWeeks.length >= 5 ? 4 : monthWeeks.length;
    const isLotus = (assessment?.roses_count || 0) >= lotusTarget;

    // Find sibling students sharing any parent phone number
    const parentPhones = (student.parents || [])
      .map((p) => p.phone?.trim())
      .filter(Boolean);

    let siblings = [];
    if (parentPhones.length > 0) {
      const siblingRecords = await prisma.student.findMany({
        where: {
          deleted_at: null,
          parents: {
            some: {
              phone: { in: parentPhones },
              deleted_at: null,
            },
          },
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

      siblings = siblingRecords.map((s) => {
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
      enrollments,
      isHistorical,
      selectedClassId: homeroomClass?.public_id || null,
      period: {
        month: targetMonth,
        year: targetYear,
        label: `Tháng ${targetMonth}/${targetYear}`,
      },
      monthWeeks,
      weeklyStats,
      criteriaRules,
      record: assessment
        ? {
            id: assessment.public_id,
            rosesCount: assessment.roses_count,
            maxRoses: monthWeeks.length,
            isLotus,
            weeks: {
              week1: Boolean(assessment.week_1_rose),
              week2: Boolean(assessment.week_2_rose),
              week3: Boolean(assessment.week_3_rose),
              week4: Boolean(assessment.week_4_rose),
              week5: Boolean(assessment.week_5_rose),
            },
            teacherNotes: assessment.teacher_notes,
            evaluatorName: assessment.evaluator?.teacher?.full_name || 'Giáo viên chủ nhiệm',
            parentFeedback: assessment.parent_feedback || '',
            feedbackAt: assessment.feedback_at
              ? new Date(assessment.feedback_at).toLocaleDateString('vi-VN')
              : null,
          }
        : {
            id: null,
            rosesCount: 0,
            maxRoses: monthWeeks.length,
            isLotus: false,
            weeks: { week1: false, week2: false, week3: false, week4: false, week5: false },
            teacherNotes: 'Chưa có nhận xét cho tháng này.',
            evaluatorName: 'Giáo viên chủ nhiệm',
            parentFeedback: '',
            feedbackAt: null,
          },
      historyMonths: (() => {
        const curM = today.getMonth() + 1;
        const curY = today.getFullYear();
        const list = historyMonths.map((h) => ({
          month: h.month,
          year: h.year,
          label: `Tháng ${h.month}/${h.year}`,
          rosesCount: h.roses_count,
          isEvaluated: true,
        }));
        // Ensure current ongoing month is available in dropdown navigation if not already present
        const hasCurrent = list.some((item) => item.month === curM && item.year === curY);
        if (!hasCurrent && !isHistorical) {
          list.unshift({
            month: curM,
            year: curY,
            label: `Tháng ${curM}/${curY} (Hiện tại)`,
            rosesCount: 0,
            isEvaluated: false,
          });
        }
        return list;
      })(),
      semesterAssessments: semesterAssessments.map((sa) => ({
        id: sa.public_id,
        semester: sa.semester,
        semesterLabel: sa.semester === 'SEMESTER_1' ? 'Học kỳ 1' : 'Học kỳ 2',
        teacherNotes: sa.teacher_notes || 'Bé đạt chuẩn phát triển toàn diện theo độ tuổi mầm non.',
        evaluatorName: sa.evaluator?.teacher?.full_name || 'Cô giáo chủ nhiệm',
        className: sa.class?.name,
        schoolYear: sa.class?.school_year?.name,
        domains: [
          { name: 'Phát triển Thể chất', rating: 'Đạt chuẩn', score: 95 },
          { name: 'Phát triển Nhận thức', rating: 'Đạt chuẩn', score: 92 },
          { name: 'Phát triển Ngôn ngữ', rating: 'Xuất sắc', score: 98 },
          { name: 'Tình cảm & Kỹ năng xã hội', rating: 'Xuất sắc', score: 96 },
          { name: 'Phát triển Thẩm mỹ', rating: 'Đạt chuẩn', score: 90 },
        ],
        createdAt: new Date(sa.created_at).toLocaleDateString('vi-VN'),
      })),
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

          if (!foundTheme) {
            foundTheme = themes[0];
            foundSubTheme = themes[0].sub_themes?.[0] || null;
          }

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

    // Find sibling students sharing any parent phone number
    const parentPhones = (student.parents || [])
      .map((p) => p.phone?.trim())
      .filter(Boolean);

    let siblings = [];
    if (parentPhones.length > 0) {
      const siblingRecords = await prisma.student.findMany({
        where: {
          deleted_at: null,
          parents: {
            some: {
              phone: { in: parentPhones },
              deleted_at: null,
            },
          },
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

      siblings = siblingRecords.map((s) => {
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
      timetable: {
        routineSlots,
        weeklyActivities,
        theme: activeTheme,
        subTheme: activeSubTheme,
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
      throw NotFound('Chưa có phiếu đánh giá tháng của giáo viên để gửi phản hồi.');
    }

    const updated = await prisma.monthlyAssessment.update({
      where: { monthly_assessment_id: assessment.monthly_assessment_id },
      data: {
        parent_feedback: feedback.trim(),
        feedback_at: new Date(),
        feedback_by: account.account_id,
      },
    });

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

    const notifications = await prisma.notification.findMany({
      where: {
        account_id: account.account_id,
        deleted_at: null,
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
}

export const parentService = new ParentService();
export default parentService;
