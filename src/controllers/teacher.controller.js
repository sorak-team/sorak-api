import { teacherService } from '../services/teacher.service.js';
import { teacherImportExportService } from '../services/teacher-import-export.service.js';

export const listTeachers = async (req, res) => {
  const result = await teacherService.listTeachers(req.query);
  res.success(result);
};

export const getTeacherById = async (req, res) => {
  const { id } = req.params;
  const result = await teacherService.getTeacherById(id);
  res.success(result);
};

export const createTeacher = async (req, res) => {
  const result = await teacherService.createTeacher(req.body);
  res.status(201).success(result);
};

export const updateTeacher = async (req, res) => {
  const { id } = req.params;
  const result = await teacherService.updateTeacher(id, req.body, req.user);
  res.success(result);
};

export const deleteTeacher = async (req, res) => {
  const { id } = req.params;
  const result = await teacherService.deleteTeacher(id, req.user);
  res.success(result);
};

export const assignTeacherToClass = async (req, res) => {
  const { id } = req.params;
  const result = await teacherService.assignTeacherToClass(id, req.body);
  res.status(201).success(result);
};

export const removeTeacherFromClass = async (req, res) => {
  const { id, classId } = req.params;
  const result = await teacherService.removeTeacherFromClass(id, classId);
  res.success(result);
};

/**
 * Tải file Excel mẫu nhập cán bộ giáo viên
 */
export const getImportTemplate = async (req, res) => {
  const buffer = await teacherImportExportService.getImportTemplate();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Mau_Nhap_Giao_Vien_Sorak.xlsx"',
  );
  res.send(buffer);
};

/**
 * Xem trước dữ liệu và kiểm tra lỗi từ file Excel giáo viên
 */
export const previewImport = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel để tải lên.' });
  }
  const result = await teacherImportExportService.previewImport(req.file.buffer);
  res.success(result, 'Kiểm tra tệp dữ liệu giáo viên thành công');
};

/**
 * Thực thi nhập giáo viên
 */
export const importTeachers = async (req, res) => {
  const { teachers } = req.body;
  const actorId = req.user?.accountId;
  const result = await teacherImportExportService.importTeachers(teachers, actorId);
  res.success(result, `Nhập thành công ${result.successCount}/${result.total} giáo viên/cán bộ.`);
};

/**
 * Xuất danh sách cán bộ giáo viên ra file Excel
 */
export const exportTeachersExcel = async (req, res) => {
  const buffer = await teacherImportExportService.exportTeachersExcel(req.query);
  const filename = `Danh_Sach_Giao_Vien_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
