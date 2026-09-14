import { teacherService } from '../services/teacher.service.js';


export const listTeachers = async (req, res) => {
  const result = await teacherService.listTeachers(req.query);
  res.success(result);
};

