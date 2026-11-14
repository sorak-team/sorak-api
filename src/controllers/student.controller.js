import { studentService } from '../services/student.service.js';
import { studentImportExportService } from '../services/student-import-export.service.js';

export const listStudents = async (req, res) => {
  const result = await studentService.listStudents(req.query);
  res.success(result);
};

export const getStudentById = async (req, res) => {
  const { id } = req.params;
  const result = await studentService.getStudentById(id);
  res.success(result);
};

export const createStudent = async (req, res) => {
  const result = await studentService.createStudent(req.body);
  res.status(201).success(result);
};

export const updateStudent = async (req, res) => {
  const { id } = req.params;
  const result = await studentService.updateStudent(id, req.body);
  res.success(result);
};

export const deleteStudent = async (req, res) => {
  const { id } = req.params;
  const result = await studentService.deleteStudent(id);
  res.success(result);
};

export const enrollStudent = async (req, res) => {
  const { id } = req.params;
  const result = await studentService.enrollStudent(id, req.body);
  res.status(201).success(result);
};

export const transferStudent = async (req, res) => {
  const { id } = req.params;
  const creatorAccountId = req.user.accountId;
  const result = await studentService.transferStudent(id, req.body, creatorAccountId, req.user);
  res.status(201).success(result);
};

export const addParent = async (req, res) => {
  const { id } = req.params;
  const result = await studentService.addParent(id, req.body);
  res.status(201).success(result);
};

export const updateParent = async (req, res) => {
  const { id, parentId } = req.params;
  const result = await studentService.updateParent(id, parentId, req.body);
  res.success(result);
};

export const deleteParent = async (req, res) => {
  const { id, parentId } = req.params;
  const result = await studentService.deleteParent(id, parentId);
  res.success(result);
};

/**
 * Tải file Excel mẫu nhập học sinh
 */
export const getImportTemplate = async (req, res) => {
  const buffer = await studentImportExportService.getImportTemplate();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Mau_Nhap_Hoc_Sinh_Sorak.xlsx"',
  );
  res.send(buffer);
};

/**
 * Xem trước dữ liệu và kiểm tra lỗi từ file Excel tải lên
 */
export const previewImport = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel để tải lên.' });
  }
  const result = await studentImportExportService.previewImport(req.file.buffer);
  res.success(result, 'Kiểm tra tệp dữ liệu thành công');
};

/**
 * Xác nhận thực thi nhập học sinh
 */
export const importStudents = async (req, res) => {
  const { students } = req.body;
  const actorId = req.user?.accountId;
  const result = await studentImportExportService.importStudents(students, actorId);
  res.success(result, `Nhập thành công ${result.successCount}/${result.total} học sinh.`);
};

/**
 * Xuất danh sách học sinh ra file Excel
 */
export const exportStudentsExcel = async (req, res) => {
  const buffer = await studentImportExportService.exportStudentsExcel(req.query);
  const filename = `Danh_Sach_Hoc_Sinh_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
