import Joi from 'joi';

export const queryTeacherSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow(''),
  status: Joi.string().valid('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED'),
  department: Joi.string().trim(),
  sortBy: Joi.string().valid('newest', 'oldest', 'name_asc', 'name_desc').default('newest'),
});
