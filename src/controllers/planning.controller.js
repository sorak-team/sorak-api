import planningService from '../services/planning.service.js';
import planningExportService from '../services/planning-export.service.js';
import { Forbidden } from '../utils/http-error.js';

class PlanningController {
  // Tab 1: Educational Activities by Theme
  async getThemeActivities(req, res, next) {
    try {
      const { classId } = req.params;
      const { themeCode } = req.query;
      const data = await planningService.getThemeActivities({
        classId,
        themeCode,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async saveEducationalActivity(req, res, next) {
    try {
      const userRole = String(req.user?.role || '').toUpperCase();
      if (userRole.includes('BGH') || userRole === 'ADMIN') {
        throw new Forbidden('Chỉ giáo viên phụ trách lớp mới được tạo hoặc chỉnh sửa hoạt động giáo dục.');
      }
      const { classId } = req.params;
      const data = await planningService.saveEducationalActivity({
        classId,
        activity: req.body,
        accountId: req.user?.sub || req.user?.accountId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async deleteEducationalActivity(req, res, next) {
    try {
      const userRole = String(req.user?.role || '').toUpperCase();
      if (userRole.includes('BGH') || userRole === 'ADMIN') {
        throw new Forbidden('Chỉ giáo viên phụ trách lớp mới được xóa hoạt động giáo dục.');
      }
      const { classId, activityId } = req.params;
      const data = await planningService.deleteEducationalActivity({
        classId,
        activityId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  // Tab 2: Weekly Timetable & Activity Assignment
  async getWeeklyTimetable(req, res, next) {
    try {
      const { classId } = req.params;
      const { themeCode, subThemeId, startDate, endDate, weekId } = req.query;
      const data = await planningService.getWeeklyTimetable({
        classId,
        themeCode,
        subThemeId,
        startDate,
        endDate,
        weekId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async assignActivityToSlot(req, res, next) {
    try {
      const { classId } = req.params;
      const { activityId, day, routineSlot, date, slotId, isAdd, weekId, subThemeId, orderIndex, order_index } = req.body;
      const data = await planningService.assignActivityToSlot({
        classId,
        activityId,
        day,
        routineSlot,
        date,
        slotId,
        isAdd,
        weekId,
        subThemeId,
        orderIndex: orderIndex !== undefined ? orderIndex : order_index,
        accountId: req.user?.sub || req.user?.accountId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async saveWeeklySlot(req, res, next) {
    try {
      const { classId } = req.params;
      const data = await planningService.saveWeeklySlot({
        classId,
        slot: req.body,
        accountId: req.user?.sub || req.user?.accountId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async swapWeeklySlots(req, res, next) {
    try {
      const { classId } = req.params;
      const { sourceSlotId, targetSlotId } = req.body;
      const data = await planningService.swapWeeklySlots({
        classId,
        sourceSlotId,
        targetSlotId,
        accountId: req.user?.sub || req.user?.accountId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async reorderWeeklySlots(req, res, next) {
    try {
      const { classId } = req.params;
      const { slots } = req.body;
      const data = await planningService.reorderWeeklySlots({
        classId,
        slots,
        accountId: req.user?.sub || req.user?.accountId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async deleteWeeklySlot(req, res, next) {
    try {
      const { classId, slotId } = req.params;
      const data = await planningService.deleteWeeklySlot({
        classId,
        slotId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getTargetAllocation(req, res, next) {
    try {
      const { classId } = req.params;
      const data = await planningService.getTargetAllocation({ classId, user: req.user });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async saveTargetAllocation(req, res, next) {
    try {
      const { classId } = req.params;
      const { themeId, themeCode, branchId, goalIds, contentIds, goalContentMap } = req.body;
      const data = await planningService.saveTargetAllocation({
        classId,
        themeId,
        themeCode,
        branchId,
        goalIds,
        contentIds,
        goalContentMap,
        user: req.user,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async publishAllocation(req, res, next) {
    try {
      const { classId } = req.params;
      const data = await planningService.publishAllocation({
        classId,
        user: req.user,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getClassThemePlansSummary(req, res, next) {
    try {
      const { classId } = req.params;
      const data = await planningService.getClassThemePlansSummary(classId);
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getThemePlanStatus(req, res, next) {
    try {
      const { classId } = req.params;
      const { themeId } = req.query;
      const data = await planningService.getThemePlanStatus({ classId, themeId });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getThemePlanAppraisalPreview(req, res, next) {
    try {
      const { classId } = req.params;
      const { themeId } = req.query;
      const data = await planningService.getThemePlanAppraisalPreview({ classId, themeId });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async submitThemePlan(req, res, next) {
    try {
      const { classId } = req.params;
      const { themeId, themeName, note } = req.body;
      const data = await planningService.submitThemePlan({
        classId,
        themeId,
        themeName,
        note,
        user: req.user,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async approveThemePlan(req, res, next) {
    try {
      const userRole = String(req.user?.role || '').toUpperCase();
      if (!userRole.includes('BGH') && userRole !== 'ADMIN') {
        throw new Forbidden('Chỉ Ban Giám Hiệu mới có quyền phê duyệt kế hoạch chủ đề.');
      }
      const { classId } = req.params;
      const { themeId, themeName, note } = req.body;
      const data = await planningService.approveThemePlan({
        classId,
        themeId,
        themeName,
        note,
        user: req.user,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async requestThemePlanRevision(req, res, next) {
    try {
      const userRole = String(req.user?.role || '').toUpperCase();
      if (!userRole.includes('BGH') && userRole !== 'ADMIN') {
        throw new Forbidden('Chỉ Ban Giám Hiệu mới có quyền yêu cầu chỉnh sửa kế hoạch.');
      }
      const { classId } = req.params;
      const { themeId, themeName, reason } = req.body;
      const data = await planningService.requestThemePlanRevision({
        classId,
        themeId,
        themeName,
        reason,
        user: req.user,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getThemePlanMatrix(req, res, next) {
    try {
      const userRole = String(req.user?.role || '').toUpperCase();
      if (!userRole.includes('BGH') && userRole !== 'ADMIN') {
        throw new Forbidden('Chỉ Ban Giám Hiệu mới có quyền xem danh sách thẩm định kế hoạch.');
      }
      const data = await planningService.getThemePlanMatrix(req.query);
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getThemePlanSubmissions(req, res, next) {
    try {
      const userRole = String(req.user?.role || '').toUpperCase();
      if (!userRole.includes('BGH') && userRole !== 'ADMIN') {
        throw new Forbidden('Chỉ Ban Giám Hiệu mới có quyền xem danh sách thẩm định kế hoạch.');
      }
      const data = await planningService.getThemePlanSubmissions(req.query);
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async queryAiAllocation(req, res, next) {
    try {
      const { prompt, themeName } = req.body;
      const data = await planningService.queryAiAllocation({ prompt, themeName });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async generateActivityAi(req, res, next) {
    try {
      const { title, domain, goalCode, contentTitle } = req.body;
      const data = await planningService.generateActivityAi({
        title,
        domain,
        goalCode,
        contentTitle,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // ITERATION 3: EXPORT THEME PLAN, THEME TEACHING PLAN & WEEKLY PLAN
  // ==========================================================================

  async exportThemePlanExcel(req, res, next) {
    try {
      const { schoolYearId, school_year_id, ageGroup, age_group, year } = req.query;
      const targetAgeGroup = ageGroup || age_group;
      const buffer = await planningExportService.exportThemePlanExcel({
        schoolYearId: schoolYearId || school_year_id || year,
        ageGroup: targetAgeGroup,
      });
      const filename = targetAgeGroup
        ? `Ke_Hoach_Chu_De_35_Tuan_${targetAgeGroup}.xlsx`
        : `Ke_Hoach_Phan_Phoi_Bo_Chu_De_${new Date().getFullYear()}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  async exportThemePlanPrint(req, res, next) {
    try {
      const { schoolYearId, school_year_id, ageGroup, age_group } = req.query;
      const html = await planningExportService.exportThemePlanPrintHtml({
        schoolYearId: schoolYearId || school_year_id,
        ageGroup: ageGroup || age_group,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      next(err);
    }
  }

  async exportThemeTeachingPlanPrint(req, res, next) {
    try {
      const { classId, themeId } = req.params;
      const html = await planningExportService.exportThemeTeachingPlanPrintHtml({
        classId,
        themeId: themeId || req.query.themeId || req.query.theme_id,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      next(err);
    }
  }

  async exportThemeTeachingPlanExcel(req, res, next) {
    try {
      const { classId, themeId } = req.params;
      const buffer = await planningExportService.exportThemeTeachingPlanExcel({
        classId,
        themeId: themeId || req.query.themeId || req.query.theme_id,
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Ke_hoach_chu_de_${classId}_${themeId || 'all'}.xlsx"`
      );
      return res.send(Buffer.from(buffer));
    } catch (err) {
      next(err);
    }
  }

  async exportWeeklyTeachingPlanPrint(req, res, next) {
    try {
      const { classId } = req.params;
      const weekNumber = req.params.weekNumber || req.query.weekNumber || req.query.week || 1;
      const html = await planningExportService.exportWeeklyTeachingPlanPrintHtml({
        classId,
        weekNumber,
        date: req.query.date,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      next(err);
    }
  }

  async exportWeeklyTeachingPlanExcel(req, res, next) {
    try {
      const { classId } = req.params;
      const weekNumber = req.params.weekNumber || req.query.weekNumber || req.query.week || 1;
      const buffer = await planningExportService.exportWeeklyTeachingPlanExcel({
        classId,
        weekNumber,
      });
      const filename = `Ke_Hoach_Tuan_${weekNumber}_Lop_${classId}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
}

export const planningController = new PlanningController();
export default planningController;
