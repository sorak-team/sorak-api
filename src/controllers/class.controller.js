import { classService } from '../services/class.service.js';


export const listClasses = async (req, res) => {
  const result = await classService.listClasses(req.query);
  res.success(result);
};

