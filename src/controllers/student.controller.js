import { studentService } from '../services/student.service.js';

export const listStudents = async (req, res) => {
  const result = await studentService.listStudents(req.query);
  res.success(result);
};

