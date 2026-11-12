import goodBehaviorService from '../services/good-behavior.service.js';
import goodBehaviorExportService from '../services/good-behavior-export.service.js';

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

  async exportGoodBehaviorExcel(req, res, next) {
    try {
      const classId = req.params.classId || req.query.classId;
      const { month, year } = req.query;
      const buffer = await goodBehaviorExportService.exportGoodBehaviorExcel({ classId, month, year });
      const filename = `So_Be_Ngoan_Thang_${month || 10}_${year || 2026}.xlsx`;
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

  async exportGoodBehaviorPrint(req, res, next) {
    try {
      const classId = req.params.classId || req.query.classId;
      const studentId = req.params.studentId || req.query.studentId;
      const { month, year } = req.query;
      const html = await goodBehaviorExportService.exportGoodBehaviorPrintHtml({
        classId,
        studentId,
        month,
        year,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      next(err);
    }
  }
}

export const goodBehaviorController = new GoodBehaviorController();
export default goodBehaviorController;
