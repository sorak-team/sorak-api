import planningService from '../services/planning.service.js';
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
      const data = await planningService.getTargetAllocation({ classId });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async saveTargetAllocation(req, res, next) {
    try {
      const { classId } = req.params;
      const { themeId, themeCode, branchId, goalIds } = req.body;
      const data = await planningService.saveTargetAllocation({
        classId,
        themeId,
        themeCode,
        branchId,
        goalIds,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async publishAllocation(req, res, next) {
    try {
      const { classId } = req.params;
      const data = await planningService.publishAllocation({ classId });
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
}

export const planningController = new PlanningController();
export default planningController;
