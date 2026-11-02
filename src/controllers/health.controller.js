import healthService from '../services/health.service.js';

class HealthController {

  async getHealthOverview(req, res, next) {
      try {
        const { classId } = req.params;
        const { week, date } = req.query;
        const data = await healthService.getHealthOverview({ classId, week, date });
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async saveHealthRecords(req, res, next) {
      try {
        const { classId } = req.params;
        const { date, records } = req.body || {};
        const data = await healthService.saveHealthRecords({
          classId,
          date,
          records,
          recordedBy: req.user?.sub || req.user?.accountId || req.user?.id,
        });
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async clearHealthRecords(req, res, next) {
      try {
        const { classId } = req.params;
        const { date } = req.query;
        const data = await healthService.clearHealthRecords({ classId, date });
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

}
export const healthController = new HealthController();
export default healthController;
