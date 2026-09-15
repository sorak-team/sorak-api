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

export const createTeacher = async (req, res) => {
  const result = await teacherService.createTeacher(req.body);
  res.status(201).success(result);
};

export const updateTeacher = async (req, res) => {
  const { id } = req.params;
  const result = await teacherService.updateTeacher(id, req.body);
  res.success(result);
};

export const deleteTeacher = async (req, res) => {
  const { id } = req.params;
  const result = await teacherService.deleteTeacher(id);
  res.success(result);
};

