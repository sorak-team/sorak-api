import planningService from '../services/planning.service.js';

class PlanningController {

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
        const { classId } = req.params;
        const data = await planningService.saveEducationalActivity({
          classId,
          activity: req.body,
        });
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async deleteEducationalActivity(req, res, next) {
      try {
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

}
export const planningController = new PlanningController();
export default planningController;
