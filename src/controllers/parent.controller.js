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

}
export const parentController = new ParentController();
export default parentController;
