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

}
export const attendanceController = new AttendanceController();
export default attendanceController;
