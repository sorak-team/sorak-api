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

}
export const planningController = new PlanningController();
export default planningController;
