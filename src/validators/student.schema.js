import Joi from 'joi';

export const queryStudentSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow(''),
  status: Joi.string().valid('ENROLLED', 'TRANSFERRED', 'GRADUATED', 'SUSPENDED', 'DROPPED_OUT'),
  gender: Joi.string().valid('MALE', 'FEMALE'),
  classId: Joi.string().trim(),
  schoolYearId: Joi.string().trim(),
  sortBy: Joi.string().valid('newest', 'oldest', 'name_asc', 'name_desc').default('newest'),
});
