import Joi from 'joi';

export const createClassSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    'string.empty': 'Tên lớp học không được để trống',
    'string.min': 'Tên lớp học phải có ít nhất 2 ký tự',
    'any.required': 'Tên lớp học là bắt buộc',
  }),
  schoolYearId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).optional(),
  ageGroup: Joi.string().valid('NHA_TRE', 'MAM', 'CHOI', 'LA').required().messages({
    'any.only': 'Khối tuổi phải là NHA_TRE, MAM, CHOI hoặc LA',
    'any.required': 'Khối tuổi (ageGroup) là bắt buộc',
  }),
  roomNumber: Joi.string().trim().max(50).allow('', null).optional(),
  description: Joi.string().trim().max(255).allow('', null).optional(),
});

