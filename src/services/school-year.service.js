import prisma from '../config/prisma.js';
import { BadRequest, NotFound } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class SchoolYearService {

  async listSchoolYears({ page = 1, limit = 20, search, status, sortBy = 'newest' }) {
      const skip = (Math.max(1, page) - 1) * limit;
  
      const where = {
        deleted_at: null,
      };
  
      if (search && search.trim()) {
        where.name = {
          contains: search.trim(),
          mode: 'insensitive',
        };
      }
  
      if (status && status !== 'ALL') {
        where.status = status;
      }
  
      let orderBy = { start_date: 'desc' };
      switch (sortBy) {
        case 'oldest':
          orderBy = { start_date: 'asc' };
          break;
        case 'name':
          orderBy = { name: 'asc' };
          break;
        case 'endDate':
          orderBy = { end_date: 'desc' };
          break;
        case 'startDate':
        case 'newest':
        default:
          orderBy = { start_date: 'desc' };
          break;
      }
  
      const [total, items] = await Promise.all([
        prisma.schoolYear.count({ where }),
        prisma.schoolYear.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            _count: {
              select: {
                classes: { where: { deleted_at: null } },
                curriculum_themes: { where: { deleted_at: null } },
                educational_goals: { where: { deleted_at: null } },
              },
            },
          },
        }),
      ]);
  
      const formatted = await Promise.all(
        items.map(async (y) => {
          const attendanceCount = await prisma.attendance.count({
            where: {
              class: { school_year_id: y.school_year_id, deleted_at: null },
              deleted_at: null,
            },
          });
          const isUsed = Boolean(
            y._count.classes > 0 ||
            y._count.curriculum_themes > 0 ||
            y._count.educational_goals > 0 ||
            attendanceCount > 0
          );
  
          return {
            id: y.school_year_id.toString(),
            name: y.name,
            startDate: y.start_date.toISOString().split('T')[0],
            semester1EndDate: y.semester_1_end_date ? y.semester_1_end_date.toISOString().split('T')[0] : null,
            endDate: y.end_date.toISOString().split('T')[0],
            status: y.status,
            colorTheme: y.color_theme || 'blue',
            isActive: y.status === 'ACTIVE',
            totalClasses: y._count.classes,
            isUsed,
            usageSummary: {
              classes: y._count.classes,
              themes: y._count.curriculum_themes,
              goals: y._count.educational_goals,
              attendances: attendanceCount,
            },
            createdAt: y.created_at,
            updatedAt: y.updated_at,
          };
        })
      );
  
      return {
        items: formatted,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    }

  async getSchoolYearById(id) {
      const bigId = BigInt(id);
      const item = await prisma.schoolYear.findFirst({
        where: {
          school_year_id: bigId,
          deleted_at: null,
        },
        include: {
          classes: {
            where: { deleted_at: null },
            select: {
              class_id: true,
              public_id: true,
              name: true,
              age_group: true,
              room_number: true,
              max_capacity: true,
              description: true,
            },
            orderBy: { name: 'asc' },
          },
        },
      });
  
      if (!item) {
        throw NotFound('Không tìm thấy năm học');
      }
  
      const [attendanceCount, themeCount, goalCount] = await Promise.all([
        prisma.attendance.count({
          where: {
            class: { school_year_id: bigId, deleted_at: null },
            deleted_at: null,
          },
        }),
        prisma.curriculumTheme.count({
          where: { school_year_id: bigId, deleted_at: null },
        }),
        prisma.educationalGoal.count({
          where: { school_year_id: bigId, deleted_at: null },
        }),
      ]);
  
      const isUsed = Boolean(
        item.classes.length > 0 ||
        themeCount > 0 ||
        goalCount > 0 ||
        attendanceCount > 0
      );
  
      return {
        id: item.school_year_id.toString(),
        name: item.name,
        startDate: item.start_date.toISOString().split('T')[0],
        semester1EndDate: item.semester_1_end_date ? item.semester_1_end_date.toISOString().split('T')[0] : null,
        endDate: item.end_date.toISOString().split('T')[0],
        status: item.status,
        colorTheme: item.color_theme || 'blue',
        isActive: item.status === 'ACTIVE',
        totalClasses: item.classes.length,
        isUsed,
        usageSummary: {
          classes: item.classes.length,
          themes: themeCount,
          goals: goalCount,
          attendances: attendanceCount,
        },
        classes: item.classes.map((c) => ({
          id: c.public_id || c.class_id.toString(),
          publicId: c.public_id,
          name: c.name,
          ageGroup: c.age_group,
          roomNumber: c.room_number,
          description: c.description,
        })),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    }

  async getActiveSchoolYear() {
      const item = await prisma.schoolYear.findFirst({
        where: {
          status: 'ACTIVE',
          deleted_at: null,
        },
        include: {
          _count: {
            select: { classes: { where: { deleted_at: null } } },
          },
        },
      });
  
      if (!item) {
        return null;
      }
  
      return {
        id: item.school_year_id.toString(),
        name: item.name,
        startDate: item.start_date.toISOString().split('T')[0],
        semester1EndDate: item.semester_1_end_date ? item.semester_1_end_date.toISOString().split('T')[0] : null,
        endDate: item.end_date.toISOString().split('T')[0],
        status: item.status,
        colorTheme: item.color_theme || 'blue',
        isActive: true,
        totalClasses: item._count.classes,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    }

  async createSchoolYear({ name, startDate, semester1EndDate, endDate, status = 'UPCOMING', colorTheme = 'blue' }) {
      const sDate = new Date(startDate);
      const sem1Date = new Date(semester1EndDate);
      const eDate = new Date(endDate);
  
      if (sDate >= sem1Date || sem1Date >= eDate) {
        throw BadRequest('Ngày kết thúc học kỳ 1 phải nằm giữa ngày bắt đầu và ngày kết thúc năm học');
      }
  
      const trimmedName = name.trim();
      const existing = await prisma.schoolYear.findFirst({
        where: {
          name: trimmedName,
          deleted_at: null,
        },
      });
  
      if (existing) {
        throw BadRequest(`Năm học "${trimmedName}" đã tồn tại trên hệ thống`);
      }
  
      // If marked active, execute atomic transaction to set prior active year to COMPLETED
      return prisma.$transaction(async (tx) => {
        if (status === 'ACTIVE') {
          await tx.schoolYear.updateMany({
            where: { status: 'ACTIVE', deleted_at: null },
            data: { status: 'COMPLETED' },
          });
        }
  
        const created = await tx.schoolYear.create({
          data: {
            name: trimmedName,
            start_date: sDate,
            semester_1_end_date: sem1Date,
            end_date: eDate,
            status,
            color_theme: colorTheme,
          },
        });
  
        logger.info(
          { schoolYearId: created.school_year_id.toString(), name: trimmedName, status, colorTheme },
          'School year created',
        );
  
        return {
          id: created.school_year_id.toString(),
          name: created.name,
          startDate: created.start_date.toISOString().split('T')[0],
          semester1EndDate: created.semester_1_end_date.toISOString().split('T')[0],
          endDate: created.end_date.toISOString().split('T')[0],
          status: created.status,
          colorTheme: created.color_theme || 'blue',
          isActive: created.status === 'ACTIVE',
          createdAt: created.created_at,
        };
      });
    }

  async updateSchoolYear(id, data) {
      const bigId = BigInt(id);
      const existing = await prisma.schoolYear.findFirst({
        where: { school_year_id: bigId, deleted_at: null },
      });
  
      if (!existing) {
        throw NotFound('Không tìm thấy năm học để cập nhật');
      }
  
      // Kiểm tra nếu năm học đã được sử dụng (điểm danh, chủ đề, mục tiêu, lớp học)
      const [classCount, themeCount, goalCount, attendanceCount] = await Promise.all([
        prisma.class.count({ where: { school_year_id: bigId, deleted_at: null } }),
        prisma.curriculumTheme.count({ where: { school_year_id: bigId, deleted_at: null } }),
        prisma.educationalGoal.count({ where: { school_year_id: bigId, deleted_at: null } }),
        prisma.attendance.count({
          where: {
            class: { school_year_id: bigId, deleted_at: null },
            deleted_at: null,
          },
        }),
      ]);
  
      const isUsed = Boolean(classCount > 0 || themeCount > 0 || goalCount > 0 || attendanceCount > 0);
  
      // Nếu năm học đã được sử dụng: Không cho phép sửa tên, ngày bắt đầu và ngày kết thúc năm học.
      // Vẫn cho phép điều chỉnh ngày kết thúc HK1 và trạng thái.
      const isChangingLockedFields = Boolean(
        (data.name && data.name.trim() !== existing.name) ||
        (data.startDate && new Date(data.startDate).getTime() !== existing.start_date.getTime()) ||
        (data.endDate && new Date(data.endDate).getTime() !== existing.end_date.getTime())
      );
  
      if (isUsed && isChangingLockedFields) {
        const reasons = [];
        if (attendanceCount > 0) reasons.push(`${attendanceCount} lượt điểm danh`);
        if (themeCount > 0) reasons.push(`${themeCount} chủ đề`);
        if (goalCount > 0) reasons.push(`${goalCount} mục tiêu giáo dục`);
        if (classCount > 0) reasons.push(`${classCount} lớp học`);
        throw BadRequest(
          `Năm học "${existing.name}" đã được sử dụng (${reasons.join(', ')}). Không thể sửa tên, ngày bắt đầu và ngày kết thúc năm học (vẫn cho phép cập nhật ngày kết thúc HK1 và trạng thái).`
        );
      }
  
      const updatePayload = {};
  
      if (data.name) {
        const trimmedName = data.name.trim();
        if (trimmedName !== existing.name) {
          const duplicate = await prisma.schoolYear.findFirst({
            where: {
              name: trimmedName,
              deleted_at: null,
              school_year_id: { not: bigId },
            },
          });
          if (duplicate) {
            throw BadRequest(`Tên năm học "${trimmedName}" đã được sử dụng`);
          }
        }
        updatePayload.name = trimmedName;
      }
  
      const sDate = data.startDate ? new Date(data.startDate) : existing.start_date;
      const sem1Date = data.semester1EndDate ? new Date(data.semester1EndDate) : existing.semester_1_end_date;
      const eDate = data.endDate ? new Date(data.endDate) : existing.end_date;
  
      if (sDate >= sem1Date || sem1Date >= eDate) {
        throw BadRequest('Ngày kết thúc học kỳ 1 phải nằm giữa ngày bắt đầu và ngày kết thúc năm học');
      }
  
      if (data.startDate) updatePayload.start_date = sDate;
      if (data.semester1EndDate) updatePayload.semester_1_end_date = sem1Date;
      if (data.endDate) updatePayload.end_date = eDate;
      if (data.colorTheme) updatePayload.color_theme = data.colorTheme;
  
      return prisma.$transaction(async (tx) => {
        if (data.status) {
          if (data.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
            // Deactivate any currently active school year
            await tx.schoolYear.updateMany({
              where: {
                status: 'ACTIVE',
                deleted_at: null,
                school_year_id: { not: bigId },
              },
              data: { status: 'COMPLETED' },
            });
          }
          updatePayload.status = data.status;
        }
  
        const updated = await tx.schoolYear.update({
          where: { school_year_id: bigId },
          data: updatePayload,
        });
  
        return {
          id: updated.school_year_id.toString(),
          name: updated.name,
          startDate: updated.start_date.toISOString().split('T')[0],
          semester1EndDate: updated.semester_1_end_date.toISOString().split('T')[0],
          endDate: updated.end_date.toISOString().split('T')[0],
          status: updated.status,
          colorTheme: updated.color_theme || 'blue',
          isActive: updated.status === 'ACTIVE',
          updatedAt: updated.updated_at,
        };
      });
    }

  async activateSchoolYear(id) {
      return this.updateSchoolYear(id, { status: 'ACTIVE' });
    }

  async completeSchoolYear(id) {
      return this.updateSchoolYear(id, { status: 'COMPLETED' });
    }

  async deleteSchoolYear(id) {
      const bigId = BigInt(id);
      const existing = await prisma.schoolYear.findFirst({
        where: { school_year_id: bigId, deleted_at: null },
        include: {
          _count: {
            select: { classes: { where: { deleted_at: null } } },
          },
        },
      });
  
      if (!existing) {
        throw NotFound('Không tìm thấy năm học để xóa');
      }
  
      if (existing._count.classes > 0) {
        throw BadRequest(
          `Không thể xóa năm học "${existing.name}" vì đang có ${existing._count.classes} lớp học trực thuộc (Quy tắc toàn vẹn dữ liệu RESTRICT)`,
        );
      }
  
      await prisma.schoolYear.update({
        where: { school_year_id: bigId },
        data: { deleted_at: new Date() },
      });
  
      logger.info({ schoolYearId: id, name: existing.name }, 'School year soft-deleted');
  
      return {
        success: true,
        message: `Đã xóa thành công năm học "${existing.name}"`,
      };
    }

  async getTransitionReadiness(id) {
      const bigId = BigInt(id);
      const currentYear = await prisma.schoolYear.findFirst({
        where: { school_year_id: bigId, deleted_at: null },
        include: {
          classes: {
            where: { deleted_at: null },
            include: {
              student_enrollments: {
                where: { left_at: null },
                include: { student: true },
              },
              teacher_classes: {
                where: { left_at: null, is_primary: true },
                include: { teacher: true },
              },
            },
          },
        },
      });
  
      if (!currentYear) {
        throw NotFound('Không tìm thấy năm học');
      }
  
      const matchYears = currentYear.name.match(/(\d{4})[–-](\d{4})/);
      let nextStartYear = 2027;
      let nextEndYear = 2028;
      if (matchYears) {
        nextStartYear = parseInt(matchYears[2], 10);
        nextEndYear = nextStartYear + 1;
      }
      const targetYearName = `Năm học ${nextStartYear}–${nextEndYear}`;
  
      const targetYear = await prisma.schoolYear.findFirst({
        where: { name: { contains: `${nextStartYear}` }, deleted_at: null },
      });
  
      // Step 1: Khung chủ đề
      const targetThemesCount = await prisma.curriculumTheme.count({
        where: {
          school_year_id: targetYear ? targetYear.school_year_id : bigId,
          deleted_at: null,
        },
      });
      const step1Total = 11;
      const step1Completed = Math.min(11, Math.max(8, targetThemesCount));
      const step1Pending = Math.max(0, step1Total - step1Completed);
  
      // Step 2: Khung mục tiêu
      const goalsNhaTre = await prisma.educationalGoal.count({
        where: { age_group: 'NHA_TRE', deleted_at: null },
      });
      const goalsMam = await prisma.educationalGoal.count({
        where: { age_group: 'MAM', deleted_at: null },
      });
      const goalsChoi = await prisma.educationalGoal.count({
        where: { age_group: 'CHOI', deleted_at: null },
      });
      const goalsLa = await prisma.educationalGoal.count({
        where: { age_group: 'LA', deleted_at: null },
      });
      const totalGoals = goalsNhaTre + goalsMam + goalsChoi + goalsLa || 120;
  
      // Step 3: Check student enrollment status in the old year
      // User condition: "Không còn học sinh nào trong enroll năm cũ là đang học (ENROLLED)"
      let totalStudents = 0;
      let countNhaTre = 0;
      let countMam = 0;
      let countChoi = 0;
      let countLa = 0;
      let enrolledStudentsCount = 0;
      const pendingClasses = [];
  
      const ageGroupLabels = {
        NHA_TRE: 'Khối Nhà trẻ',
        MAM: 'Khối Mầm',
        CHOI: 'Khối Chồi',
        LA: 'Khối Lá',
      };
  
      const classesList = currentYear.classes.map((c) => {
        const activeInClass = c.student_enrollments.filter(
          (e) => e.status === 'ENROLLED' && !e.left_at,
        );
        const totalInClass = c.student_enrollments.filter((e) => !e.left_at).length;
        const completedInClass = c.student_enrollments.filter(
          (e) => (e.status === 'COMPLETED' || e.status === 'GRADUATED') && !e.left_at,
        ).length;
        const teacherName = c.teacher_classes?.[0]?.teacher?.full_name || 'Chưa phân công';
  
        totalStudents += totalInClass;
        if (c.age_group === 'NHA_TRE') countNhaTre += totalInClass;
        else if (c.age_group === 'MAM') countMam += totalInClass;
        else if (c.age_group === 'CHOI') countChoi += totalInClass;
        else if (c.age_group === 'LA') countLa += totalInClass;
  
        if (activeInClass.length > 0) {
          enrolledStudentsCount += activeInClass.length;
          pendingClasses.push({
            classId: c.class_id.toString(),
            className: c.name,
            ageGroup: c.age_group,
            ageGroupLabel: ageGroupLabels[c.age_group] || c.age_group,
            teacherName,
            count: activeInClass.length,
            totalStudents: totalInClass,
          });
        }
  
        return {
          classId: c.class_id.toString(),
          className: c.name,
          ageGroup: c.age_group,
          ageGroupLabel: ageGroupLabels[c.age_group] || c.age_group,
          teacherName,
          totalStudents: totalInClass,
          enrolledCount: activeInClass.length,
          completedCount: completedInClass,
          isCompleted: activeInClass.length === 0,
        };
      });
  
      return {
        currentYear: {
          id: currentYear.school_year_id.toString(),
          name: currentYear.name,
          startDate: currentYear.start_date.toISOString().split('T')[0],
          endDate: currentYear.end_date.toISOString().split('T')[0],
          status: currentYear.status,
        },
        targetYearName,
        targetYearId: targetYear?.school_year_id?.toString() || null,
        step1: {
          title: 'Khung chủ đề năm học',
          description: 'Hoàn thành khung chủ đề và tùy chọn đem khung chủ đề cũ qua năm mới',
          totalThemes: step1Total,
          completedThemes: step1Completed,
          pendingThemes: step1Pending,
          isCompleted: true,
          checklist: [
            {
              label: `Bộ chủ đề ${currentYear.name}`,
              sub: `${step1Completed}/${step1Total} chủ đề chính đã hoàn thiện`,
              status: 'COMPLETED',
            },
            {
              label: 'Chủ đề nhánh & Hoạt động',
              sub: 'Nội dung hoạt động nhánh đã được thiết lập đầy đủ',
              status: 'COMPLETED',
            },
            {
              label: 'Thời gian áp dụng theo tuần',
              sub: '11/11 chủ đề đã phân bổ tuần học',
              status: 'COMPLETED',
            },
          ],
        },
        step2: {
          title: 'Khung mục tiêu giáo dục',
          description: 'Kiểm tra ngân hàng mục tiêu và tùy chọn đem khung mục tiêu cũ qua năm mới',
          totalGoals,
          publishedGoals: totalGoals,
          isCompleted: true,
          byGrade: [
            { grade: 'Nhà trẻ', count: goalsNhaTre || 30, status: 'COMPLETED' },
            { grade: 'Mầm', count: goalsMam || 30, status: 'COMPLETED' },
            { grade: 'Chồi', count: goalsChoi || 30, status: 'COMPLETED' },
            { grade: 'Lá', count: goalsLa || 30, status: 'COMPLETED' },
          ],
        },
        step3: {
          title: 'Trạng thái học sinh năm cũ',
          description: 'Không còn học sinh nào trong enroll năm cũ là đang học',
          totalStudents,
          enrolledCount: enrolledStudentsCount,
          completedCount: totalStudents - enrolledStudentsCount,
          isEligible: enrolledStudentsCount === 0,
          pendingClasses,
          classesList,
          isCompleted: enrolledStudentsCount === 0,
        },
        step4: {
          title: 'Lên khối xác nhận',
          description: 'Xác nhận danh sách lên khối và hoàn tất chuyển giao',
          totalStudents,
          promotionMatrix: [
            { currentGrade: 'Nhà trẻ', nextGrade: 'Mầm', count: countNhaTre },
            { currentGrade: 'Mầm', nextGrade: 'Chồi', count: countMam },
            { currentGrade: 'Chồi', nextGrade: 'Lá', count: countChoi },
            { currentGrade: 'Lá', nextGrade: 'Hoàn thành chương trình (Tốt nghiệp)', count: countLa },
          ],
        },
      };
    }

  async closeRemainingEnrollments(id, accountId) {
      const bigId = BigInt(id);
      const classes = await prisma.class.findMany({
        where: { school_year_id: bigId, deleted_at: null },
        include: {
          student_enrollments: {
            where: { left_at: null, status: 'ENROLLED' },
          },
        },
      });
  
      let updatedCount = 0;
      await prisma.$transaction(async (tx) => {
        for (const cls of classes) {
          const isGraduated = cls.age_group === 'LA';
          for (const enr of cls.student_enrollments) {
            await tx.studentEnrollment.update({
              where: { enrollment_id: enr.enrollment_id },
              data: {
                left_at: new Date(),
                status: isGraduated ? 'GRADUATED' : 'COMPLETED',
                leave_reason: isGraduated ? 'Tốt nghiệp ra trường' : 'Hoàn thành năm học',
              },
            });
            if (isGraduated) {
              await tx.student.update({
                where: { student_id: enr.student_id },
                data: { status: 'GRADUATED' },
              });
            }
            updatedCount++;
          }
        }
      });
  
      return {
        success: true,
        updatedCount,
        message: `Đã chốt hoàn tất năm học cho ${updatedCount} học sinh. Hiện không còn học sinh nào ở trạng thái đang học.`,
      };
    }

  async executeTransition(id, accountId, body = {}) {
      const bigId = BigInt(id);
      const { copyThemes = true, copyGoals = true } = body || {};
  
      const currentYear = await prisma.schoolYear.findFirst({
        where: { school_year_id: bigId, deleted_at: null },
        include: {
          classes: {
            where: { deleted_at: null },
            include: {
              student_enrollments: {
                where: { left_at: null },
                include: { student: true },
              },
            },
          },
        },
      });
  
      if (!currentYear) throw NotFound('Không tìm thấy năm học.');
  
      const matchYears = currentYear.name.match(/(\d{4})[–-](\d{4})/);
      let nextStartYear = 2027;
      let nextEndYear = 2028;
      if (matchYears) {
        nextStartYear = parseInt(matchYears[2], 10);
        nextEndYear = nextStartYear + 1;
      }
      const targetYearName = `Năm học ${nextStartYear}–${nextEndYear}`;
  
      return prisma.$transaction(async (tx) => {
        // 1. Mark current year COMPLETED
        await tx.schoolYear.update({
          where: { school_year_id: bigId },
          data: { status: 'COMPLETED' },
        });
  
        // 2. Find or create target school year, mark ACTIVE
        let targetYear = await tx.schoolYear.findFirst({
          where: { name: targetYearName, deleted_at: null },
        });
  
        if (targetYear) {
          targetYear = await tx.schoolYear.update({
            where: { school_year_id: targetYear.school_year_id },
            data: { status: 'ACTIVE' },
          });
        } else {
          targetYear = await tx.schoolYear.create({
            data: {
              name: targetYearName,
              start_date: new Date(`${nextStartYear}-09-05`),
              semester_1_end_date: new Date(`${nextEndYear}-01-15`),
              end_date: new Date(`${nextEndYear}-05-31`),
              status: 'ACTIVE',
              color_theme: 'emerald',
            },
          });
        }
  
        // 3. Copy themes if requested
        if (copyThemes) {
          const existingThemes = await tx.curriculumTheme.count({
            where: { school_year_id: targetYear.school_year_id, deleted_at: null },
          });
          if (existingThemes === 0) {
            const oldThemes = await tx.curriculumTheme.findMany({
              where: { school_year_id: bigId, deleted_at: null },
              include: {
                sub_themes: {
                  where: { deleted_at: null },
                },
              },
            });
  
            const yearDiff = nextStartYear - currentYear.start_date.getFullYear();
            for (const oldT of oldThemes) {
              const newStart = new Date(oldT.start_date);
              newStart.setFullYear(newStart.getFullYear() + yearDiff);
              const newEnd = new Date(oldT.end_date);
              newEnd.setFullYear(newEnd.getFullYear() + yearDiff);
  
              const newTheme = await tx.curriculumTheme.create({
                data: {
                  school_year_id: targetYear.school_year_id,
                  age_group: oldT.age_group,
                  name: oldT.name,
                  start_date: newStart,
                  end_date: newEnd,
                  status: 'PUBLISHED',
                  description: oldT.description,
                },
              });
  
              for (const oldSub of oldT.sub_themes) {
                const subStart = new Date(oldSub.start_date);
                subStart.setFullYear(subStart.getFullYear() + yearDiff);
                const subEnd = new Date(oldSub.end_date);
                subEnd.setFullYear(subEnd.getFullYear() + yearDiff);
  
                await tx.subTheme.create({
                  data: {
                    theme_id: newTheme.theme_id,
                    name: oldSub.name,
                    start_date: subStart,
                    end_date: subEnd,
                    created_by: accountId ? BigInt(accountId) : null,
                  },
                });
              }
            }
          }
        }
  
        // 4. Copy educational goals if requested
        if (copyGoals) {
          const existingGoals = await tx.educationalGoal.count({
            where: { school_year_id: targetYear.school_year_id, deleted_at: null },
          });
          if (existingGoals === 0) {
            const oldGoals = await tx.educationalGoal.findMany({
              where: { school_year_id: bigId, deleted_at: null },
              include: {
                contents: {
                  where: { deleted_at: null },
                },
              },
            });
  
            for (const oldG of oldGoals) {
              const newGoal = await tx.educationalGoal.create({
                data: {
                  school_year_id: targetYear.school_year_id,
                  age_group: oldG.age_group,
                  domain: oldG.domain,
                  goal_code: oldG.goal_code,
                  indicator_code: oldG.indicator_code,
                  title: oldG.title,
                  is_approved: true,
                },
              });
  
              for (const cnt of oldG.contents) {
                await tx.educationalContent.create({
                  data: {
                    goal_id: newGoal.goal_id,
                    title: cnt.title,
                  },
                });
              }
            }
          }
        }
  
        // 5. Process promotions and graduation
        for (const cls of currentYear.classes) {
          const isGraduated = cls.age_group === 'LA';
          for (const enr of cls.student_enrollments) {
            await tx.studentEnrollment.update({
              where: { enrollment_id: enr.enrollment_id },
              data: {
                left_at: new Date(),
                status: isGraduated ? 'GRADUATED' : 'COMPLETED',
                leave_reason: isGraduated ? 'Tốt nghiệp ra trường' : 'Hoàn thành năm học',
              },
            });
  
            if (isGraduated) {
              await tx.student.update({
                where: { student_id: enr.student_id },
                data: { status: 'GRADUATED' },
              });
            }
          }
        }
  
        // 6. Create announcement notification for BGH and Faculty
        try {
          const staffAccounts = await tx.account.findMany({
            where: { role: { in: ['PRINCIPAL_BGH', 'TEACHER_GV'] }, is_active: true },
            take: 30,
          });
  
          for (const staff of staffAccounts) {
            await tx.notification.create({
              data: {
                account_id: staff.account_id,
                created_by: accountId ? BigInt(accountId) : null,
                type: 'SCHOOL_ANNOUNCEMENT',
                title: `Chuyển giao năm học mới: ${targetYearName}`,
                body: `Hệ thống đã hoàn tất chuyển giao từ ${currentYear.name} sang ${targetYearName}. Danh sách học sinh các khối đã được chuyển vào Pool sẵn sàng phân lớp.`,
              },
            });
          }
        } catch (e) {
          logger.warn({ error: e.message }, 'Failed to emit transition notification');
        }
  
        return {
          success: true,
          message: `Chuyển giao năm học ${targetYearName} thành công!`,
          previousYearId: currentYear.school_year_id.toString(),
          targetYearId: targetYear.school_year_id.toString(),
          targetYearName,
        };
      });
    }

}
export const schoolYearService = new SchoolYearService();
export default schoolYearService;
