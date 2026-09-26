import { classService } from '../services/class.service.js';


export const listClasses = async (req, res) => {
  const result = await classService.listClasses(req.query);
  res.success(result);
};

export const getClassById = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getClassById(id);
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
  const result = await classService.getClassStudents(id, req.query);
  res.success(result);
};

export const allocateStudents = async (req, res) => {
  const { id } = req.params;
  const result = await classService.allocateStudents(id, req.body);
  res.status(200).success(result);
};

export const removeStudents = async (req, res) => {
  const { id } = req.params;
  const result = await classService.removeStudents(id, req.body);
  res.success(result);
};

export const importStudents = async (req, res) => {
  const { id } = req.params;
  const result = await classService.importStudents(id, req.body);
  res.status(200).success(result);
};

export const updateTeacherRole = async (req, res) => {
  const { id, teacherId } = req.params;
  const result = await classService.updateTeacherRole(id, teacherId, req.body);
  res.success(result);
};

export const getClassTransfers = async (req, res) => {
  const { id } = req.params;
  const result = await classService.getClassTransfers(id, req.query);
  res.success(result);
};

