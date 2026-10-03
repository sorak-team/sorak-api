import Joi from 'joi';

export const queryClassSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow(''),
  schoolYearId: Joi.string().trim(),
  gradeLevel: Joi.string().trim(),
});
