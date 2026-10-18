import healthService from '../services/health.service.js';

class HealthController {
  async getHealthOverview(req, res, next) {
    try {
      const { classId } = req.params;
      const { week } = req.query;
      const data = await healthService.getHealthOverview({ classId, week });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

}
export const healthController = new HealthController();
export default healthController;
