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

export const updateThemeSetStatus = async (req, res) => {
  const { year, ageGroup, status } = req.body;
  const result = await curriculumService.updateThemeSetStatus({ year, ageGroup, status });
  res.success(result);
};

export const updateThemeSetDetail = async (req, res) => {
  const { year, ageGroup, themes, theme, note } = req.body;
  const result = await curriculumService.updateThemeSetDetail({ year, ageGroup, themes, theme, note });
  res.success(result);
};

export const listGoalBanksOverview = async (req, res) => {
  const result = await curriculumService.listGoalBanksOverview(req.query);
  res.success(result);
};

export const getGoalBankDetail = async (req, res) => {
  const { year, ageGroup } = req.query;
  const result = await curriculumService.getGoalBankDetail({ year, ageGroup });
  res.success(result);
};

export const updateGoalBankStatus = async (req, res) => {
  const { year, ageGroup, status } = req.body;
  const result = await curriculumService.updateGoalBankStatus({ year, ageGroup, status });
  res.success(result);
};

export const getSingleGoalDetail = async (req, res) => {
  const { year, ageGroup, goalId } = req.query;
  const result = await curriculumService.getSingleGoalDetail({ year, ageGroup, goalId });
  res.success(result);
};

