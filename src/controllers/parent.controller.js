import parentService from '../services/parent.service.js';

class ParentController {

  async getHome(req, res, next) {
      try {
        const data = await parentService.getHomeData(req.user.sub, req.query?.classId);
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async getSchedule(req, res, next) {
      try {
        const data = await parentService.getSchedule(req.user.sub, req.query);
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async getProfile(req, res, next) {
      try {
        const data = await parentService.getStudentProfile(req.user.sub, req.query?.classId);
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async getRequests(req, res, next) {
      try {
        const data = await parentService.getRequests(req.user.sub, req.query);
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async createPickupRequest(req, res, next) {
      try {
        const data = await parentService.createPickupRequest(req.user.sub, req.body);
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async cancelPickupRequest(req, res, next) {
      try {
        const { requestId } = req.params;
        const data = await parentService.cancelPickupRequest(req.user.sub, requestId);
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async getGoodBehavior(req, res, next) {
      try {
        const data = await parentService.getGoodBehavior(req.user.sub, req.query);
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

  async submitGoodBehaviorFeedback(req, res, next) {
      try {
        const data = await parentService.submitGoodBehaviorFeedback(req.user.sub, req.body);
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

}
export const parentController = new ParentController();
export default parentController;
