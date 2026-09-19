import { studentService } from '../services/student.service.js';


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
  const result = await studentService.transferStudent(id, req.body, creatorAccountId);
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

