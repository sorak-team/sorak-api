import { teacherService } from '../services/teacher.service.js';


export const listTeachers = async (req, res) => {
  const result = await teacherService.listTeachers(req.query);
  res.success(result);
};

export const getTeacherById = async (req, res) => {
  const { id } = req.params;
  const result = await teacherService.getTeacherById(id);
  res.success(result);
};

