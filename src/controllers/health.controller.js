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
          userRole: req.user?.role,
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

  async exportStudentHealthExcel(req, res, next) {
    try {
      const { studentId } = req.params;
      const { classId, schoolYearId } = req.query;
      const { buffer, filename } = await healthService.exportStudentHealthExcel({
        studentId,
        classId,
        schoolYearId,
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`,
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  async exportHealthExcel(req, res, next) {
    try {
      const classId = req.params.classId || req.query.classId || req.query.class_id;
      const { schoolYearId, date } = req.query;
      const buffer = await healthService.exportHealthExcel({ classId, schoolYearId, date });
      const filename = `So_Theo_Doi_Suc_Khoe_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

}
export const healthController = new HealthController();
export default healthController;
