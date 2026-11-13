import prisma from '../config/prisma.js';

export class StatisticsService {
  /**
   * Helper: Tìm năm học mục tiêu theo ID hoặc publicId hoặc lấy năm học Active
   */
  async resolveSchoolYear(schoolYearId) {
    let schoolYear = null;
    if (schoolYearId) {
      const isNum = /^\d+$/.test(String(schoolYearId));
      schoolYear = await prisma.schoolYear.findFirst({
        where: {
          OR: [
            isNum ? { school_year_id: BigInt(schoolYearId) } : undefined,
            { name: String(schoolYearId) },
            { name: { contains: String(schoolYearId) } },
          ].filter(Boolean),
          deleted_at: null,
        },
      });
    }

    if (!schoolYear) {
      schoolYear =
        (await prisma.schoolYear.findFirst({
          where: { status: 'ACTIVE', deleted_at: null },
        })) ||
        (await prisma.schoolYear.findFirst({
          where: { deleted_at: null },
          orderBy: { start_date: 'desc' },
        }));
    }

    return schoolYear;
  }

  /**
   * Lấy dữ liệu Tổng quan Toàn trường (School-wide Dashboard Overview)
   */
  async getSchoolOverview({ schoolYearId }) {
    const schoolYear = await this.resolveSchoolYear(schoolYearId);
    if (!schoolYear) {
      return {
        summary: {},
        monthlyStudentMatrix: { months: [], classes: [], footer: {} },
        planStatistics: {},
        assessmentStatistics: {},
        childrenNeedingSupport: [],
        childrenOutstanding: [],
      };
    }

    const yearId = schoolYear.school_year_id;
    const yearStart = new Date(schoolYear.start_date);
    const yearEnd = new Date(schoolYear.end_date);
    const startYearNum = yearStart.getFullYear();
    const endYearNum = yearEnd.getFullYear();

    // 1. Danh sách lớp học trong năm học
    const classes = await prisma.class.findMany({
      where: { school_year_id: yearId, deleted_at: null },
      include: {
        teacher_classes: {
          where: { left_at: null },
          include: { teacher: true },
        },
        student_enrollments: {
          where: { student: { deleted_at: null } },
          include: { student: true },
        },
      },
      orderBy: [{ age_group: 'asc' }, { name: 'asc' }],
    });

    const AGE_GROUP_ORDER = { NHA_TRE: 1, MAM: 2, CHOI: 3, LA: 4 };
    classes.sort((a, b) => {
      const orderA = AGE_GROUP_ORDER[a.age_group] || 99;
      const orderB = AGE_GROUP_ORDER[b.age_group] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true });
    });

    // 2. Thống kê Đội ngũ giáo viên trong trường
    const totalTeachersCount = await prisma.teacher.count({
      where: { deleted_at: null },
    });

    const classesWithTeacher = classes.filter((c) => (c.teacher_classes || []).length > 0).length;

    // 3. Tính ma trận sĩ số 9 tháng (Tháng 9 -> Tháng 5)
    // Tháng 9, 10, 11, 12 thuộc startYearNum; Tháng 1, 2, 3, 4, 5 thuộc endYearNum
    const monthConfigs = [
      { month: 9, year: startYearNum, label: 'Tháng 9' },
      { month: 10, year: startYearNum, label: 'Tháng 10' },
      { month: 11, year: startYearNum, label: 'Tháng 11' },
      { month: 12, year: startYearNum, label: 'Tháng 12' },
      { month: 1, year: endYearNum, label: 'Tháng 01' },
      { month: 2, year: endYearNum, label: 'Tháng 02' },
      { month: 3, year: endYearNum, label: 'Tháng 03' },
      { month: 4, year: endYearNum, label: 'Tháng 04' },
      { month: 5, year: endYearNum, label: 'Tháng 05' },
    ];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Helper kiểm tra xem tháng có phải tương lai không
    const isFutureMonth = (mNum, yNum) => {
      if (yNum > currentYear) return true;
      if (yNum === currentYear && mNum > currentMonth) return true;
      return false;
    };

    const matrixClasses = [];
    const monthlyTotalCounts = monthConfigs.map(() => ({ total: 0, female: 0, male: 0, isFuture: false }));
    const monthlyIncreaseCounts = monthConfigs.map(() => 0);
    const monthlyDecreaseCounts = monthConfigs.map(() => 0);

    let totalStudentsAllSchool = 0;
    let totalFemaleAllSchool = 0;
    let totalMaleAllSchool = 0;

    for (const cls of classes) {
      const enrollments = cls.student_enrollments || [];
      const classMonthsData = [];

      monthConfigs.forEach((mCfg, mIdx) => {
        const isFuture = isFutureMonth(mCfg.month, mCfg.year);

        if (isFuture) {
          classMonthsData.push({
            month: mCfg.month,
            label: '-',
            female: 0,
            total: 0,
            isFuture: true,
          });
          monthlyTotalCounts[mIdx].isFuture = true;
          return;
        }

        // Tính ngày đầu và cuối của tháng khảo sát
        const mStart = new Date(mCfg.year, mCfg.month - 1, 1);
        const mEnd = new Date(mCfg.year, mCfg.month, 0, 23, 59, 59);

        // Học sinh đang học trong tháng này
        const activeInMonth = enrollments.filter((en) => {
          const enDate = en.enrolled_at ? new Date(en.enrolled_at) : new Date(en.created_at);
          if (enDate > mEnd) return false;
          if (en.left_at && new Date(en.left_at) < mStart) return false;
          return true;
        });

        const femaleCount = activeInMonth.filter((en) => {
          const g = en.student?.gender;
          return g === 'FEMALE' || g === 'Nữ' || g?.toLowerCase() === 'female' || g?.toLowerCase() === 'nữ';
        }).length;

        const totalCount = activeInMonth.length;
        const maleCount = totalCount - femaleCount;

        classMonthsData.push({
          month: mCfg.month,
          label: `${femaleCount}/${totalCount}`,
          female: femaleCount,
          total: totalCount,
          isFuture: false,
        });

        monthlyTotalCounts[mIdx].total += totalCount;
        monthlyTotalCounts[mIdx].female += femaleCount;
        monthlyTotalCounts[mIdx].male += maleCount;

        // Tính TĂNG: Học sinh nhập học trong tháng này
        const increasedThisMonth = enrollments.filter((en) => {
          const enDate = en.enrolled_at ? new Date(en.enrolled_at) : new Date(en.created_at);
          return enDate >= mStart && enDate <= mEnd;
        }).length;
        monthlyIncreaseCounts[mIdx] += increasedThisMonth;

        // Tính GIẢM: Học sinh chuyển đi / rời lớp trong tháng này
        const decreasedThisMonth = enrollments.filter((en) => {
          if (!en.left_at) return false;
          const leftDate = new Date(en.left_at);
          return leftDate >= mStart && leftDate <= mEnd;
        }).length;
        monthlyDecreaseCounts[mIdx] += decreasedThisMonth;
      });

      // Lấy sĩ số thực tế hiện tại của lớp
      const currentEnrolled = enrollments.filter((en) => en.status === 'ENROLLED' || !en.left_at);
      totalStudentsAllSchool += currentEnrolled.length;
      totalFemaleAllSchool += currentEnrolled.filter((en) => {
        const g = en.student?.gender;
        return g === 'FEMALE' || g === 'Nữ' || g?.toLowerCase() === 'female' || g?.toLowerCase() === 'nữ';
      }).length;

      const teacherNames = (cls.teacher_classes || [])
        .map((tc) => tc.teacher?.full_name)
        .filter(Boolean);
      const teacherName = teacherNames.length > 0 ? teacherNames.join(', ') : 'Chưa phân công giáo viên';

      matrixClasses.push({
        classId: cls.class_id.toString(),
        publicId: cls.public_id,
        name: cls.name,
        ageGroup: cls.age_group,
        roomNumber: cls.room_number,
        teacherName,
        teacherNames,
        monthsData: classMonthsData,
      });
    }

    totalMaleAllSchool = totalStudentsAllSchool - totalFemaleAllSchool;

    // Chuẩn hóa dòng TỔNG SỐ, TĂNG, GIẢM
    const totalRow = monthConfigs.map((mCfg, idx) => {
      if (monthlyTotalCounts[idx].isFuture) return { month: mCfg.month, label: '-', isFuture: true };
      return {
        month: mCfg.month,
        label: `${monthlyTotalCounts[idx].female}/${monthlyTotalCounts[idx].total}`,
        female: monthlyTotalCounts[idx].female,
        total: monthlyTotalCounts[idx].total,
        isFuture: false,
      };
    });

    const increaseRow = monthConfigs.map((mCfg, idx) => {
      if (monthlyTotalCounts[idx].isFuture) return { month: mCfg.month, label: '-', isFuture: true };
      // Tháng 9 nếu là tháng đầu năm học, số tăng có thể hiển thị số nhập học hoặc dấu gạch
      return {
        month: mCfg.month,
        label: String(monthlyIncreaseCounts[idx]),
        count: monthlyIncreaseCounts[idx],
        isFuture: false,
      };
    });

    const decreaseRow = monthConfigs.map((mCfg, idx) => {
      if (monthlyTotalCounts[idx].isFuture) return { month: mCfg.month, label: '-', isFuture: true };
      return {
        month: mCfg.month,
        label: String(monthlyDecreaseCounts[idx]),
        count: monthlyDecreaseCounts[idx],
        isFuture: false,
      };
    });

    // 4. Thống kê Kế hoạch giáo dục (ClassThemePlan)
    const classIds = classes.map((c) => c.class_id);
    const plans = await prisma.classThemePlan.findMany({
      where: { class_id: { in: classIds } },
      include: {
        class: { select: { class_id: true, public_id: true, name: true, age_group: true } },
      },
    });

    const totalPlans = plans.length;
    const approvedPlans = plans.filter((p) => p.status === 'USED').length;
    const pendingPlans = plans.filter((p) => p.status === 'PENDING_APPROVAL').length;
    const rejectedPlans = plans.filter((p) => p.status === 'REJECTED').length;
    const draftPlans = plans.filter((p) => p.status === 'DRAFT').length;
    const planApprovalRate = totalPlans > 0 ? Math.round((approvedPlans / totalPlans) * 100) : 0;

    // Nhóm kế hoạch theo lớp
    const plansByClass = classes.map((cls) => {
      const clsPlans = plans.filter((p) => String(p.class_id) === String(cls.class_id));
      const approved = clsPlans.filter((p) => p.status === 'USED').length;
      const pending = clsPlans.filter((p) => p.status === 'PENDING_APPROVAL').length;
      const rejected = clsPlans.filter((p) => p.status === 'REJECTED').length;
      const draft = clsPlans.filter((p) => p.status === 'DRAFT').length;
      const teacherNames = (cls.teacher_classes || [])
        .map((tc) => tc.teacher?.full_name)
        .filter(Boolean);
      const teacherName = teacherNames.length > 0 ? teacherNames.join(', ') : 'Chưa phân công giáo viên';

      return {
        classId: cls.class_id.toString(),
        className: cls.name,
        ageGroup: cls.age_group,
        teacherName,
        totalPlans: clsPlans.length,
        approved,
        pending,
        rejected,
        draft,
        statusText:
          pending > 0
            ? 'Chờ phê duyệt'
            : rejected > 0
            ? 'Cần chỉnh sửa'
            : approved > 0
            ? 'Đã phê duyệt'
            : 'Chưa nộp',
      };
    });

    // 5. Thống kê Đánh giá phát triển trẻ (DailyAssessment) & Lọc Trẻ Vượt Trội / Cần Hỗ Trợ
    const studentsWithAssessments = await prisma.student.findMany({
      where: {
        student_enrollments: {
          some: { class_id: { in: classIds } },
        },
        deleted_at: null,
      },
      include: {
        student_enrollments: {
          where: { class_id: { in: classIds } },
          include: { class: true },
        },
        daily_assessments: {
          include: { goal: true, activity: true },
          orderBy: { assessment_date: 'asc' },
        },
      },
    });

    let totalDailyAssessments = 0;
    let totalAchievedAssessments = 0;
    let totalOutstandingAssessments = 0;
    let totalNotAchievedAssessments = 0;

    const domainStats = {
      PHYSICAL: { name: 'Thể chất', total: 0, achieved: 0, outstanding: 0, notAchieved: 0 },
      COGNITIVE: { name: 'Nhận thức', total: 0, achieved: 0, outstanding: 0, notAchieved: 0 },
      LANGUAGE: { name: 'Ngôn ngữ', total: 0, achieved: 0, outstanding: 0, notAchieved: 0 },
      SOCIO_EMOTIONAL: { name: 'Tình cảm - Xã hội', total: 0, achieved: 0, outstanding: 0, notAchieved: 0 },
      AESTHETIC: { name: 'Thẩm mỹ', total: 0, achieved: 0, outstanding: 0, notAchieved: 0 },
      GENERAL: { name: 'Phát triển chung', total: 0, achieved: 0, outstanding: 0, notAchieved: 0 },
    };

    const childrenNeedingSupport = [];
    const childrenOutstanding = [];

    for (const st of studentsWithAssessments) {
      const assessments = st.daily_assessments || [];
      if (assessments.length === 0) continue;

      totalDailyAssessments += assessments.length;

      // Gom hoạt động theo từng mục tiêu (EducationalGoal)
      const goalsMap = new Map();
      for (const a of assessments) {
        if (a.status === 'ACHIEVED') totalAchievedAssessments++;
        else if (a.status === 'OUTSTANDING') totalOutstandingAssessments++;
        else if (a.status === 'NOT_ACHIEVED') totalNotAchievedAssessments++;

        const domainKey = a.goal?.domain;
        if (domainKey && domainStats[domainKey]) {
          domainStats[domainKey].total++;
          if (a.status === 'ACHIEVED') domainStats[domainKey].achieved++;
          else if (a.status === 'OUTSTANDING') domainStats[domainKey].outstanding++;
          else if (a.status === 'NOT_ACHIEVED') domainStats[domainKey].notAchieved++;
        }

        const gId = a.goal_id ? String(a.goal_id) : `activity_${a.activity_id}`;
        if (!goalsMap.has(gId)) {
          goalsMap.set(gId, {
            goalId: a.goal_id ? a.goal_id.toString() : null,
            goalCode: a.goal?.goal_code || 'MT',
            title: a.goal?.title || a.activity?.title || 'Mục tiêu',
            domain: a.goal?.domain || 'GENERAL',
            activities: [],
          });
        }
        goalsMap.get(gId).activities.push(a);
      }

      // Đánh giá từng mục tiêu theo quy tắc BA:
      // "Đối với 1 mục tiêu được tính là vượt trội: 40% hoạt động giáo dục trên 1 mục tiêu tính sẽ là vượt trội"
      const goalResults = [];
      for (const [gId, gData] of goalsMap.entries()) {
        const acts = gData.activities;
        const totalActs = acts.length;
        const outstandingActs = acts.filter((x) => x.status === 'OUTSTANDING').length;
        const notAchievedActs = acts.filter((x) => x.status === 'NOT_ACHIEVED').length;

        const isGoalOutstanding = totalActs > 0 && outstandingActs / totalActs >= 0.4;
        const isGoalNotAchieved = notAchievedActs > 0 && notAchievedActs / totalActs > 0.4; // Có dấu hiệu chưa đạt rõ rệt

        const finalStatus = isGoalNotAchieved
          ? 'NOT_ACHIEVED'
          : isGoalOutstanding
          ? 'OUTSTANDING'
          : 'ACHIEVED';

        goalResults.push({
          goalId: gId,
          domain: gData.domain,
          status: finalStatus,
          isGoalOutstanding,
          isGoalNotAchieved,
        });
      }

      const totalGoals = goalResults.length;
      if (totalGoals === 0) continue;

      const notAchievedGoals = goalResults.filter((g) => g.status === 'NOT_ACHIEVED');
      const notAchievedPct = notAchievedGoals.length / totalGoals;

      // 1. Kiểm tra chuỗi mục tiêu chưa đạt liên tiếp (BA: "liên tục từ 3 trở lên")
      let maxConsecutiveNotAchieved = 0;
      let currConsecutive = 0;
      for (const g of goalResults) {
        if (g.status === 'NOT_ACHIEVED') {
          currConsecutive++;
          if (currConsecutive > maxConsecutiveNotAchieved) maxConsecutiveNotAchieved = currConsecutive;
        } else {
          currConsecutive = 0;
        }
      }

      // 2. Thống kê theo lĩnh vực của từng học sinh
      const studentDomains = {};
      for (const g of goalResults) {
        const d = g.domain;
        if (!studentDomains[d]) studentDomains[d] = { total: 0, outstanding: 0, notAchieved: 0 };
        studentDomains[d].total++;
        if (g.status === 'OUTSTANDING') studentDomains[d].outstanding++;
        if (g.status === 'NOT_ACHIEVED') studentDomains[d].notAchieved++;
      }

      const domainsWithNotAchieved = Object.entries(studentDomains).filter(([d, v]) => v.notAchieved > 0);
      const domainsWithHighNotAchieved = Object.entries(studentDomains).filter(
        ([d, v]) => v.total > 0 && v.notAchieved / v.total >= 0.2,
      );
      const domainsWithHighOutstanding = Object.entries(studentDomains).filter(
        ([d, v]) => v.total > 0 && v.outstanding / v.total >= 0.3,
      );

      // ====================================================================
      // TIÊU CHÍ NHÓM CẦN HỖ TRỢ:
      // - 20% tổng số mục tiêu là Chưa Đạt
      // - Hoặc có ít nhất 20% mục tiêu chưa đạt trên 1 lĩnh vực
      // - Hoặc xuất hiện chưa đạt trong ít nhất 2 lĩnh vực
      // - Hoặc liên tục từ 3 mục tiêu chưa đạt trở lên
      // ====================================================================
      const supportReasons = [];
      if (maxConsecutiveNotAchieved >= 3) {
        supportReasons.push(`Chưa đạt liên tục ${maxConsecutiveNotAchieved} mục tiêu đánh giá`);
      }
      if (domainsWithHighNotAchieved.length > 0) {
        const domainNames = domainsWithHighNotAchieved
          .map(([d]) => domainStats[d]?.name || d)
          .join(', ');
        supportReasons.push(`Cần hỗ trợ tăng cường lĩnh vực: ${domainNames}`);
      } else if (domainsWithNotAchieved.length >= 2) {
        supportReasons.push(`Cần theo dõi thêm ở ${domainsWithNotAchieved.length} lĩnh vực phát triển`);
      } else if (notAchievedPct >= 0.2) {
        supportReasons.push(`Tỷ lệ chưa đạt chiếm ${Math.round(notAchievedPct * 100)}% tổng số mục tiêu`);
      }

      const className = st.student_enrollments[0]?.class?.name || 'Chưa xếp lớp';

      if (supportReasons.length > 0) {
        childrenNeedingSupport.push({
          studentId: st.student_id.toString(),
          publicId: st.public_id,
          studentCode: st.student_code,
          fullName: st.full_name,
          gender: st.gender,
          className,
          avatarUrl: st.avatar_url,
          totalGoals,
          notAchievedCount: notAchievedGoals.length,
          notAchievedPct: Math.round(notAchievedPct * 100),
          consecutiveNotAchieved: maxConsecutiveNotAchieved,
          reasons: supportReasons,
        });
      }

      // ====================================================================
      // TIÊU CHÍ NHÓM VƯỢT TRỘI:
      // - 100% mục tiêu đã đánh giá là Đạt trở lên (0 mục tiêu Chưa Đạt)
      // - Vượt trội 1 lĩnh vực: Có >= 30% mục tiêu đạt vượt trội trên 1 lĩnh vực
      // - Vượt trội toàn phần (Xuất sắc): Xuất hiện vượt trội ở >= 2 lĩnh vực
      // ====================================================================
      if (notAchievedGoals.length === 0 && totalGoals > 0) {
        const outReasons = [];
        let outstandingType = '';

        if (domainsWithHighOutstanding.length >= 2) {
          outstandingType = 'Xuất sắc toàn diện';
          const domainNames = domainsWithHighOutstanding
            .map(([d]) => domainStats[d]?.name || d)
            .filter((n) => n && n !== 'GENERAL')
            .join(', ');
          outReasons.push(`Vượt trội ở ${domainsWithHighOutstanding.length} lĩnh vực: ${domainNames || 'Phát triển chung'}`);
        } else if (domainsWithHighOutstanding.length === 1) {
          const rawD = domainsWithHighOutstanding[0][0];
          const domainName = domainStats[rawD]?.name || (rawD === 'GENERAL' ? 'Phát triển chung' : rawD);
          outstandingType = rawD === 'GENERAL' ? 'Xuất sắc toàn diện' : `Vượt trội lĩnh vực ${domainName}`;
          outReasons.push(`Kết quả xuất sắc trong lĩnh vực ${domainName}`);
        }

        if (outReasons.length > 0) {
          const outstandingGoalCount = goalResults.filter((g) => g.status === 'OUTSTANDING').length;
          childrenOutstanding.push({
            studentId: st.student_id.toString(),
            publicId: st.public_id,
            studentCode: st.student_code,
            fullName: st.full_name,
            gender: st.gender,
            className,
            avatarUrl: st.avatar_url,
            totalGoals,
            outstandingCount: outstandingGoalCount,
            outstandingType,
            reasons: outReasons,
          });
        }
      }
    }

    return {
      schoolYear: {
        id: schoolYear.school_year_id.toString(),
        name: schoolYear.name,
        startDate: schoolYear.start_date,
        endDate: schoolYear.end_date,
        status: schoolYear.status,
      },
      summary: {
        totalClasses: classes.length,
        totalStudents: totalStudentsAllSchool,
        totalFemaleStudents: totalFemaleAllSchool,
        totalMaleStudents: totalMaleAllSchool,
        femaleRate:
          totalStudentsAllSchool > 0
            ? Math.round((totalFemaleAllSchool / totalStudentsAllSchool) * 100)
            : 0,
        totalTeachers: totalTeachersCount,
        classesWithTeacher,
        planApprovalRate,
        approvedPlans,
        totalPlans,
        needSupportCount: childrenNeedingSupport.length,
        outstandingCount: childrenOutstanding.length,
      },
      monthlyStudentMatrix: {
        months: monthConfigs.map((m) => ({ month: m.month, label: m.label, year: m.year })),
        classes: matrixClasses,
        footer: {
          totalRow,
          increaseRow,
          decreaseRow,
        },
      },
      planStatistics: {
        totalPlans,
        approvedPlans,
        pendingPlans,
        rejectedPlans,
        draftPlans,
        approvalRate: planApprovalRate,
        byClass: plansByClass,
      },
      assessmentStatistics: {
        totalDailyAssessments,
        achievedCount: totalAchievedAssessments,
        outstandingCount: totalOutstandingAssessments,
        notAchievedCount: totalNotAchievedAssessments,
        byDomain: domainStats,
      },
      childrenNeedingSupport,
      childrenOutstanding,
    };
  }
}

export const statisticsService = new StatisticsService();
export default statisticsService;
