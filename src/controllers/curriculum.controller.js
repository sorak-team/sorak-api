import { curriculumService } from '../services/curriculum.service.js';


export const listThemeOverview = async (req, res) => {
  const result = await curriculumService.listThemeOverview(req.query);
  res.success(result);
};

