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

