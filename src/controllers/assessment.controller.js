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

  async getSlotAssessmentRecords(req, res, next) {
    try {
      const { classId } = req.params;
      const { slotId, activityId, date } = req.query;
      const data = await assessmentService.getSlotAssessmentRecords({ classId, slotId, activityId, date });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async saveAssessmentRecords(req, res, next) {
    try {
      const { classId } = req.params;
      const { slotId, activityId, date, records } = req.body;
      const evaluatedBy = req.user?.sub || req.user?.accountId || req.user?.id;
      const data = await assessmentService.saveAssessmentRecords({ classId, slotId, activityId, date, records, evaluatedBy });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async clearAssessmentRecords(req, res, next) {
    try {
      const { classId } = req.params;
      const { slotId, activityId, date } = req.body || {};
      const data = await assessmentService.clearAssessmentRecords({
        classId,
        slotId: slotId || req.query.slotId,
        activityId: activityId || req.query.activityId,
        date: date || req.query.date,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getMonthlyAssessments(req, res, next) {
    try {
      const { classId } = req.params;
      const { month, year } = req.query;
      const data = await assessmentService.getMonthlyAssessments({ classId, month, year });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async saveMonthlyAssessments(req, res, next) {
    try {
      const { classId } = req.params;
      const { month, year, records } = req.body;
      const evaluatedBy = req.user?.sub || req.user?.accountId || req.user?.id;
      const data = await assessmentService.saveMonthlyAssessments({
        classId,
        month,
        year,
        records,
        evaluatedBy,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getSemesterAssessments(req, res, next) {
    try {
      const { classId } = req.params;
      const { semester, year } = req.query;
      const data = await assessmentService.getSemesterAssessments({ classId, semester, year });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async saveSemesterAssessments(req, res, next) {
    try {
      const { classId } = req.params;
      const { semester, year, records } = req.body;
      const evaluatedBy = req.user?.sub || req.user?.accountId || req.user?.id;
      const data = await assessmentService.saveSemesterAssessments({
        classId,
        semester,
        year,
        records,
        evaluatedBy,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async publishMonthlyAssessments(req, res, next) {
    try {
      const { classId } = req.params;
      const { month, year, isPublished } = req.body;
      const publishedBy = req.user?.sub || req.user?.accountId || req.user?.id;
      const data = await assessmentService.publishMonthlyAssessments({
        classId,
        month,
        year,
        isPublished: isPublished !== false,
        publishedBy,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async publishSemesterAssessments(req, res, next) {
    try {
      const { classId } = req.params;
      const { semester, isPublished } = req.body;
      const publishedBy = req.user?.sub || req.user?.accountId || req.user?.id;
      const data = await assessmentService.publishSemesterAssessments({
        classId,
        semester,
        isPublished: isPublished !== false,
        publishedBy,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }
}

export const assessmentController = new AssessmentController();
export default assessmentController;
