import { schoolYearService } from '../services/school-year.service.js';

export const listSchoolYears = async (req, res) => {
  const result = await schoolYearService.listSchoolYears(req.query);
  res.success(result);
};

export const getSchoolYearById = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.getSchoolYearById(id);
  res.success(result);
};

export const getActiveSchoolYear = async (req, res) => {
  const result = await schoolYearService.getActiveSchoolYear();
  res.success(result);
};

