import Joi from 'joi';

export const createAccountSchema = Joi.object({
  username: Joi.string().trim().min(3).max(100).required().messages({
    'string.empty': 'Tên đăng nhập không được để trống',
    'string.min': 'Tên đăng nhập phải có ít nhất 3 ký tự',
    'string.max': 'Tên đăng nhập không vượt quá 100 ký tự',
    'any.required': 'Tên đăng nhập là bắt buộc',
  }),
  email: Joi.string().trim().email().allow('', null).optional().messages({
    'string.email': 'Email không đúng định dạng',
  }),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'Số điện thoại phải từ 9 đến 15 chữ số',
    }),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/])/)
    .default('Sorak@2026')
    .messages({
      'string.min': 'Mật khẩu phải tối thiểu 8 ký tự',
      'string.pattern.base': 'Mật khẩu phải tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt',
    }),
  role: Joi.string()
    .valid('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV', 'PARENT_PH')
    .required()
    .messages({
      'any.only': 'Vai trò phải là PRINCIPAL_BGH, ADMIN_BGH, TEACHER_GV hoặc PARENT_PH',
      'any.required': 'Vai trò tài khoản là bắt buộc',
    }),
  isActive: Joi.boolean().default(true),
  avatarUrl: Joi.string().trim().uri().allow('', null).optional(),
  teacherId: Joi.alternatives().try(Joi.string(), Joi.number()).allow('', null).optional(),
  studentId: Joi.alternatives().try(Joi.string(), Joi.number()).allow('', null).optional(),
});

export const updateAccountSchema = Joi.object({
  email: Joi.string().trim().email().allow('', null).optional().messages({
    'string.email': 'Email không đúng định dạng',
  }),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'Số điện thoại phải từ 9 đến 15 chữ số',
    }),
  role: Joi.string()
    .valid('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV', 'PARENT_PH')
    .optional()
    .messages({
      'any.only': 'Vai trò phải là PRINCIPAL_BGH, ADMIN_BGH, TEACHER_GV hoặc PARENT_PH',
    }),
  isActive: Joi.boolean().optional(),
  avatarUrl: Joi.string().trim().uri().allow('', null).optional(),
});

export const queryAccountSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow('', null).optional(),
  role: Joi.string()
    .valid('ALL', 'PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV', 'PARENT_PH')
    .default('ALL'),
  status: Joi.string().valid('ALL', 'active', 'locked', 'inactive').default('ALL'),
  sortBy: Joi.string().valid('newest', 'oldest', 'username', 'lastLogin').default('newest'),
});

export const resetPasswordSchema = Joi.object({
  newPassword: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/])/)
    .default('Sorak@2026')
    .optional()
    .messages({
      'string.min': 'Mật khẩu phải tối thiểu 8 ký tự',
      'string.pattern.base': 'Mật khẩu phải tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt',
    }),
});

