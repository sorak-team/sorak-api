import statisticsService from '../services/statistics.service.js';
import statisticsExportService from '../services/statistics-export.service.js';

class StatisticsController {
  async getSchoolOverview(req, res, next) {
    try {
      const { schoolYearId, school_year_id } = req.query;
      const data = await statisticsService.getSchoolOverview({
        schoolYearId: schoolYearId || school_year_id,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getStudentStatistics(req, res, next) {
    try {
      const { schoolYearId, school_year_id } = req.query;
      const data = await statisticsService.getStudentStatistics({
        schoolYearId: schoolYearId || school_year_id,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getEducationPlanStatistics(req, res, next) {
    try {
      const { schoolYearId, school_year_id, classId, class_id } = req.query;
      const data = await statisticsService.getEducationPlanStatistics({
        schoolYearId: schoolYearId || school_year_id,
        classId: classId || class_id,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getChildrenNeedingSupport(req, res, next) {
    try {
      const { schoolYearId, school_year_id, classId, class_id } = req.query;
      const data = await statisticsService.getChildrenNeedingSupport({
        schoolYearId: schoolYearId || school_year_id,
        classId: classId || class_id,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getChildrenWithOutstandingResults(req, res, next) {
    try {
      const { schoolYearId, school_year_id, classId, class_id } = req.query;
      const data = await statisticsService.getChildrenWithOutstandingResults({
        schoolYearId: schoolYearId || school_year_id,
        classId: classId || class_id,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getChildAssessmentStatistics(req, res, next) {
    try {
      const { schoolYearId, school_year_id, classId, class_id } = req.query;
      const data = await statisticsService.getChildAssessmentStatistics({
        schoolYearId: schoolYearId || school_year_id,
        classId: classId || class_id,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getClassAttendanceOverview(req, res, next) {
    try {
      const { schoolYearId, school_year_id } = req.query;
      const data = await statisticsService.getClassAttendanceOverview({
        schoolYearId: schoolYearId || school_year_id,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async exportStatisticsExcel(req, res, next) {
    try {
      const { schoolYearId, school_year_id } = req.query;
      const buffer = await statisticsExportService.exportSchoolStatisticsExcel({
        schoolYearId: schoolYearId || school_year_id,
      });
      const filename = `Bao_Cao_Thong_Ke_Tong_Ket_Toan_Truong_${new Date().getFullYear()}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
}

export const statisticsController = new StatisticsController();
export default statisticsController;
