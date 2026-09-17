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

}
export const schoolYearService = new SchoolYearService();
export default schoolYearService;
