import goodBehaviorService from '../services/good-behavior.service.js';

class GoodBehaviorController {

  async getOverview(req, res, next) {
      try {
        const { classId } = req.params;
        const { week } = req.query;
        const data = await goodBehaviorService.getGoodBehaviorOverview({ classId, week });
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async saveRecords(req, res, next) {
      try {
        const { classId } = req.params;
        const { records } = req.body;
        const data = await goodBehaviorService.saveGoodBehaviorRecords({ classId, records });
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

}
export const goodBehaviorController = new GoodBehaviorController();
export default goodBehaviorController;
