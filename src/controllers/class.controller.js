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

