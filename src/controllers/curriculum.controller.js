import { curriculumService } from '../services/curriculum.service.js';

export const listThemeOverview = async (req, res) => {
  const result = await curriculumService.listThemeOverview(req.query);
  res.success(result);
};

export const getThemeSetDetail = async (req, res) => {
  const { year, ageGroup } = req.query;
  const result = await curriculumService.getThemeSetDetail({ year, ageGroup });
  res.success(result);
};

