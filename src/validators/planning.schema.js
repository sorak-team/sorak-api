import Joi from 'joi';

export const createActivitySchema = Joi.object({
  contentId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
    'any.required': 'Nội dung giáo dục (contentId) là bắt buộc',
  }),
  subThemeId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null).optional(),
  title: Joi.string().trim().min(2).max(255).required().messages({
    'string.empty': 'Tiêu đề hoạt động không được để trống',
    'string.min': 'Tiêu đề hoạt động phải có ít nhất 2 ký tự',
    'any.required': 'Tiêu đề hoạt động là bắt buộc',
  }),
  purpose: Joi.string().trim().allow('', null).optional(),
  preparation: Joi.string().trim().allow('', null).optional(),
  steps: Joi.string().trim().allow('', null).optional(),
  assessmentCriteria: Joi.string().trim().allow('', null).optional(),
});

export const updateActivitySchema = Joi.object({
  contentId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).optional(),
  subThemeId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null).optional(),
  title: Joi.string().trim().min(2).max(255).optional().messages({
    'string.min': 'Tiêu đề hoạt động phải có ít nhất 2 ký tự',
  }),
  purpose: Joi.string().trim().allow('', null).optional(),
  preparation: Joi.string().trim().allow('', null).optional(),
  steps: Joi.string().trim().allow('', null).optional(),
  assessmentCriteria: Joi.string().trim().allow('', null).optional(),
});
