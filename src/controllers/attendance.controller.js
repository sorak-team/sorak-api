import attendanceService from '../services/attendance.service.js';

class AttendanceController {
  async getTimetableOverview(req, res, next) {
    try {
      const { classId } = req.params;
      const { week, date, startDate, endDate, weekId } = req.query;
      const data = await attendanceService.getTimetableOverview({
        classId,
        week,
        date,
        startDate,
        endDate,
        weekId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async updateAttendance(req, res, next) {
    try {
      const { classId } = req.params;
      const { date, records } = req.body;
      const data = await attendanceService.updateAttendance({ classId, date, records });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async clearAttendance(req, res, next) {
    try {
      const { classId } = req.params;
      const { date } = req.body || {};
      const data = await attendanceService.clearAttendance({
        classId,
        date: date || req.query.date,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getDismissalOverview(req, res, next) {
    try {
      const { classId } = req.params;
      const { date } = req.query;
      const data = await attendanceService.getDismissalOverview({ classId, date });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async recordDismissal(req, res, next) {
    try {
      const { classId } = req.params;
      const { date, records } = req.body;
      const accountId = req.user?.sub;
      const data = await attendanceService.recordDismissal({
        classId,
        date,
        accountId,
        records,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

}
export default new AttendanceController();
