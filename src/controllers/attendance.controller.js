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

  async cancelDismissal(req, res, next) {
    try {
      const { classId, studentId } = req.params;
      const { date } = req.query;
      const data = await attendanceService.cancelDismissal({
        classId,
        date,
        studentId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async clearAllDismissals(req, res, next) {
    try {
      const { classId } = req.params;
      const { date } = req.query;
      const data = await attendanceService.clearAllDismissals({
        classId,
        date,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async getPickupAuthorizations(req, res, next) {
    try {
      const { classId } = req.params;
      const { status, date } = req.query;
      const data = await attendanceService.getPickupAuthorizations({
        classId,
        status,
        date,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async createPickupAuthorization(req, res, next) {
    try {
      const { classId } = req.params;
      const accountId = req.user?.sub;
      const data = await attendanceService.createPickupAuthorization({
        classId,
        accountId,
        ...req.body,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async approvePickupAuthorization(req, res, next) {
    try {
      const { classId, authId } = req.params;
      const accountId = req.user?.sub;
      const data = await attendanceService.approvePickupAuthorization({
        classId,
        authId,
        accountId,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }

  async rejectPickupAuthorization(req, res, next) {
    try {
      const { classId, authId } = req.params;
      const { reason } = req.body || {};
      const accountId = req.user?.sub;
      const data = await attendanceService.rejectPickupAuthorization({
        classId,
        authId,
        accountId,
        reason,
      });
      res.success(data);
    } catch (err) {
      next(err);
    }
  }
}

export default new AttendanceController();