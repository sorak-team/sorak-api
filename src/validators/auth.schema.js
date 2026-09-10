import Joi from 'joi';

export const loginSchema = Joi.object({
  identifier: Joi.string().trim().min(3).max(100).required().messages({
    'string.empty': 'Vui lòng nhập tên đăng nhập',
    'string.min': 'Tên đăng nhập phải có ít nhất 3 ký tự',
    'any.required': 'Vui lòng nhập tên đăng nhập',
  }),
  password: Joi.string().min(6).max(100).required().messages({
    'string.empty': 'Vui lòng nhập mật khẩu',
    'string.min': 'Mật khẩu phải có ít nhất 6 ký tự',
    'any.required': 'Vui lòng nhập mật khẩu',
  }),
  role: Joi.string()
    .valid('PARENT_PH', 'TEACHER_GV', 'PRINCIPAL_BGH', 'ADMIN_BGH')
    .default('PARENT_PH')
    .messages({
      'any.only': 'Vai trò không hợp lệ',
    }),
  captchaToken: Joi.string().trim().allow('', null).optional(),
  rememberMe: Joi.boolean().default(true).optional(),
});

