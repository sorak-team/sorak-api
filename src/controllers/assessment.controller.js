import assessmentService from '../services/assessment.service.js';

class AssessmentController {

  async getAssessmentOverview(req, res, next) {
      try {
        const { classId } = req.params;
        const { week } = req.query;
        const data = await assessmentService.getAssessmentOverview({ classId, week });
        res.success(data);
      } catch (err) {
        next(err);
      }
    }

}
export const assessmentController = new AssessmentController();
export default assessmentController;
