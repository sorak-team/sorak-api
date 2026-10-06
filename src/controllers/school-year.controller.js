import { schoolYearService } from '../services/school-year.service.js';

export const listSchoolYears = async (req, res) => {
  const result = await schoolYearService.listSchoolYears(req.query);
  res.success(result);
};

