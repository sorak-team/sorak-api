import { schoolYearService } from '../services/school-year.service.js';
import { calendarImportService } from '../services/calendar-import.service.js';

export const listSchoolYears = async (req, res) => {
  const result = await schoolYearService.listSchoolYears(req.query);
  res.success(result);
};

export const getSchoolYearById = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.getSchoolYearById(id);
  res.success(result);
};

export const getActiveSchoolYear = async (req, res) => {
  const result = await schoolYearService.getActiveSchoolYear();
  res.success(result);
};

export const createSchoolYear = async (req, res) => {
  const result = await schoolYearService.createSchoolYear(req.body);
  res.status(201).success(result);
};

export const updateSchoolYear = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.updateSchoolYear(id, req.body);
  res.success(result);
};

export const activateSchoolYear = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.activateSchoolYear(id);
  res.success(result);
};

export const completeSchoolYear = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.completeSchoolYear(id);
  res.success(result);
};

export const deleteSchoolYear = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.deleteSchoolYear(id);
  res.success(result);
};

export const getTransitionReadiness = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.getTransitionReadiness(id);
  res.success(result);
};

export const closeRemainingEnrollments = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.closeRemainingEnrollments(id, req.user?.sub);
  res.success(result);
};

export const executeTransition = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.executeTransition(id, req.user?.sub, req.body);
  res.success(result);
};

export const listHolidays = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.listHolidays(id, req.query);
  res.success(result);
};

export const createHoliday = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.createHoliday(id, req.user?.sub, req.body);
  res.status(201).success(result);
};

export const importHolidays = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.importHolidays(id, req.user?.sub, req.body.items || req.body);
  res.success(result);
};

export const updateHoliday = async (req, res) => {
  const { id, holidayId } = req.params;
  const result = await schoolYearService.updateHoliday(id, holidayId, req.user?.sub, req.body);
  res.success(result);
};

export const deleteHoliday = async (req, res) => {
  const { id, holidayId } = req.params;
  const result = await schoolYearService.deleteHoliday(id, holidayId);
  res.success(result);
};

/**
 * Tải file Excel mẫu Lịch năm học & Ngày nghỉ
 */
export const getCalendarTemplate = async (req, res) => {
  const buffer = await calendarImportService.getImportTemplate();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Mau_Lich_Nam_Hoc_Sorak.xlsx"',
  );
  res.send(buffer);
};

/**
 * Xem trước dữ liệu và kiểm tra lỗi từ file Excel lịch năm học
 */
export const previewCalendarImport = async (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel để tải lên.' });
  }
  const result = await calendarImportService.previewImport(req.file.buffer, id);
  res.success(result, 'Kiểm tra tệp lịch năm học thành công');
};

/**
 * Thực thi nhập lịch năm học từ Excel
 */
export const importCalendarExcel = async (req, res) => {
  const { id } = req.params;
  const { holidays } = req.body;
  const actorId = req.user?.accountId || req.user?.sub;
  const result = await calendarImportService.importCalendar(holidays, id, actorId);
  res.success(result, `Nhập thành công ${result.successCount}/${result.total} ngày lễ/sự kiện.`);
};

/**
 * Xuất lịch hoạt động & ngày nghỉ năm học ra file Excel
 */
export const exportCalendarExcel = async (req, res) => {
  const { id } = req.params;
  const buffer = await calendarImportService.exportCalendarExcel(id);
  const filename = `Lich_Nam_Hoc_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`,
  );
  res.send(buffer);
};
