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

