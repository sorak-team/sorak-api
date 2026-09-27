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

