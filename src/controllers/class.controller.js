import { classService } from '../services/class.service.js';

export const listClasses = async (req, res) => {
  const result = await classService.listClasses(req.query);
  res.success(result);
};

export const getClassById = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getClassById(id, req.user);
  res.success(result);
};

export const createClass = async (req, res) => {
  const result = await classService.createClass(req.body);
  res.status(201).success(result);
};

export const updateClass = async (req, res) => {
  const { id } = req.params;
  const result = await classService.updateClass(id, req.body);
  res.success(result);
};

export const deleteClass = async (req, res) => {
  const { id } = req.params;
  const result = await classService.deleteClass(id);
  res.success(result);
};

export const assignTeacher = async (req, res) => {
  const { id } = req.params;
  const result = await classService.assignTeacher(id, req.body);
  res.status(201).success(result);
};

export const removeTeacher = async (req, res) => {
  const { id, teacherId } = req.params;
  const result = await classService.removeTeacher(id, teacherId);
  res.success(result);
};

export const getClassStudents = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getClassStudents(id, req.query, req.user);
  res.success(result);
};

export const getStudentPool = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getStudentPool(id, req.query);
  res.success(result);
};

export const allocateStudents = async (req, res) => {
  const { id } = req.params;
  const result = await classService.allocateStudents(id, req.body);
  res.status(200).success(result);
};

export const unassignStudent = async (req, res) => {
  const { id, studentId } = req.params;
  const result = await classService.unassignStudent(id, studentId);
  res.success(result);
};

export const removeStudents = async (req, res) => {
  const { id } = req.params;
  const result = await classService.removeStudents(id, req.body);
  res.success(result);
};

export const unassignStudents = removeStudents;

export const getHistorySources = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getHistorySources(id);
  res.success(result);
};

export const getHistoryStudents = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getHistoryStudents(id, req.query);
  res.success(result);
};

export const importStudents = async (req, res) => {
  const { id } = req.params;
  const result = await classService.importStudents(id, req.body);
  res.status(200).success(result);
};

export const getClassTeachers = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getClassTeachers(id);
  res.success(result);
};

export const updateTeacherRole = async (req, res) => {
  const { id, teacherId } = req.params;
  const result = await classService.updateTeacherRole(id, teacherId, req.body);
  res.success(result);
};

export const getClassTransfers = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getClassTransfers(id, req.query, req.user);
  res.success(result);
};

export const createTransferRequest = async (req, res) => {
  const { id } = req.params;
  const result = await classService.createTransferRequest(id, req.body, req.user?.accountId, req.user);
  res.status(201).success(result);
};

export const updateTransferStatus = async (req, res) => {
  const { id, transferId } = req.params;
  const result = await classService.updateTransferStatus(
    id,
    transferId,
    req.body,
    req.user?.accountId,
    req.user,
  );
  res.success(result);
};

export const rejectTransferRequest = async (req, res) => {
  const { transferId, id } = req.params;
  const targetId = transferId || id;
  const result = await classService.rejectTransferRequest(
    targetId,
    req.body,
    req.user?.accountId,
    req.user,
  );
  res.success(result);
};

export const cancelTransferRequest = async (req, res) => {
  const { transferId, id } = req.params;
  const targetId = transferId || id;
  const result = await classService.cancelTransferRequest(targetId, req.user);
  res.success(result);
};

export const getAllTransfers = async (req, res) => {
  const result = await classService.getAllTransfers(req.query, req.user);
  res.success(result);
};

export const createGlobalTransferRequest = async (req, res) => {
  const result = await classService.createGlobalTransferRequest(req.body, req.user?.accountId, req.user);
  res.status(201).success(result);
};

export const getTransferById = async (req, res) => {
  const { transferId } = req.params;
  const result = await classService.getTransferById(transferId, req.user);
  res.success(result);
};

export const getClassExportData = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getClassExportData(id);
  res.success(result);
};

export const getDailyReport = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getDailyReport(id, req.query);
  res.success(result);
};

export const saveStudentDailyReport = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.accountId || req.user?.id || 1n;
  const result = await classService.saveStudentDailyReport(id, req.body, userId);
  res.success(result);
};

export const batchSaveDailyReport = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.accountId || req.user?.id || 1n;
  const result = await classService.batchSaveDailyReport(id, req.body, userId);
  res.success(result);
};

export const getStudentReport = async (req, res) => {
  const { id } = req.params;
  const { studentId, semester } = req.query;
  const result = await classService.getStudentReport(id, studentId, semester);
  res.success(result);
};

export const graduateStudentFromClass = async (req, res) => {
  const { id, studentId } = req.params;
  const result = await classService.graduateStudentFromClass(id, studentId);
  res.success(result);
};


