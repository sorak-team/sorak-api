import Joi from 'joi';

export const createBroadcastSchema = Joi.object({
  title: Joi.string().trim().min(3).max(150).required().messages({
    'string.empty': 'Tiêu đề thông báo không được để trống',
    'string.min': 'Tiêu đề thông báo phải có ít nhất 3 ký tự',
    'string.max': 'Tiêu đề thông báo không được vượt quá 150 ký tự',
    'any.required': 'Tiêu đề thông báo là bắt buộc',
  }),
  body: Joi.string().trim().min(5).required().messages({
    'string.empty': 'Nội dung thông báo không được để trống',
    'string.min': 'Nội dung thông báo phải có ít nhất 5 ký tự',
    'any.required': 'Nội dung thông báo là bắt buộc',
  }),
  targetScope: Joi.string()
    .valid('ALL', 'ALL_TEACHERS', 'ALL_PARENTS', 'GRADE', 'CLASS', 'INDIVIDUAL')
    .required()
    .messages({
      'any.only': 'Phạm vi gửi không hợp lệ',
      'any.required': 'Phạm vi gửi là bắt buộc',
    }),
  targetGrade: Joi.string().allow('', null).optional(),
  targetClassIds: Joi.array().items(Joi.alternatives().try(Joi.string(), Joi.number())).default([]).optional(),
  targetAccountIds: Joi.array().items(Joi.alternatives().try(Joi.string(), Joi.number())).default([]).optional(),
  scheduledAt: Joi.date().iso().allow(null).optional().messages({
    'date.format': 'Thời gian lên lịch phải đúng định dạng ISO',
  }),
  attachments: Joi.array().items(Joi.string()).default([]).optional(),
});

export const queryBroadcastSchema = Joi.object({
  search: Joi.string().trim().allow('', null).optional(),
  targetScope: Joi.string().allow('', null).optional(),
  status: Joi.string().valid('ALL', 'SENT', 'SCHEDULED').default('ALL').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

export const updateBroadcastSchema = Joi.object({
  title: Joi.string().trim().min(3).max(150).optional().messages({
    'string.empty': 'Tiêu đề thông báo không được để trống',
    'string.min': 'Tiêu đề thông báo phải có ít nhất 3 ký tự',
    'string.max': 'Tiêu đề thông báo không được vượt quá 150 ký tự',
  }),
  body: Joi.string().trim().min(5).optional().messages({
    'string.empty': 'Nội dung thông báo không được để trống',
    'string.min': 'Nội dung thông báo phải có ít nhất 5 ký tự',
  }),
  scheduledAt: Joi.date().iso().allow(null).optional(),
  attachments: Joi.array().items(Joi.string()).optional(),
});

