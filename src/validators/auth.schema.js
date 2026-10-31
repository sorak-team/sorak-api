import Joi from 'joi';

export const loginSchema = Joi.object({
  username: Joi.string().trim().min(3).max(100).optional().messages({
    'string.empty': 'Vui lòng nhập tên đăng nhập',
    'string.min': 'Tên đăng nhập phải có ít nhất 3 ký tự',
  }),
  identifier: Joi.string().trim().min(3).max(100).optional().messages({
    'string.empty': 'Vui lòng nhập tên đăng nhập',
    'string.min': 'Tên đăng nhập phải có ít nhất 3 ký tự',
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
})
  .or('username', 'identifier')
  .messages({
    'object.missing': 'Vui lòng nhập tên đăng nhập',
  });

export const forgotPasswordSchema = Joi.object({
  identifier: Joi.string().trim().min(2).max(150).optional().messages({
    'string.min': 'Tên đăng nhập hoặc mã học sinh phải có ít nhất 2 ký tự',
  }),
  email: Joi.string().trim().max(150).optional(),
})
  .or('identifier', 'email')
  .messages({
    'object.missing': 'Vui lòng nhập mã học sinh, tên đăng nhập hoặc địa chỉ email',
  });

export const verifyOtpSchema = Joi.object({
  email: Joi.string().trim().min(2).max(150).required().messages({
    'string.empty': 'Vui lòng cung cấp email hoặc tên đăng nhập',
    'any.required': 'Vui lòng cung cấp email hoặc tên đăng nhập',
  }),
  otp: Joi.string()
    .trim()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.empty': 'Vui lòng nhập mã OTP',
      'string.length': 'Mã OTP phải bao gồm chính xác 6 chữ số',
      'string.pattern.base': 'Mã OTP chỉ được chứa chữ số',
      'any.required': 'Vui lòng nhập mã OTP',
    }),
});

export const resetPasswordSchema = Joi.object({
  email: Joi.string().trim().min(2).max(150).required().messages({
    'string.empty': 'Vui lòng cung cấp email hoặc tên đăng nhập',
    'any.required': 'Vui lòng cung cấp email hoặc tên đăng nhập',
  }),
  resetToken: Joi.string().required().messages({
    'string.empty': 'Mã xác thực đặt lại mật khẩu không hợp lệ',
    'any.required': 'Mã xác thực đặt lại mật khẩu không hợp lệ',
  }),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/])/)
    .required()
    .messages({
      'string.empty': 'Vui lòng nhập mật khẩu mới',
      'string.min': 'Mật khẩu mới phải tối thiểu 8 ký tự',
      'string.pattern.base': 'Mật khẩu phải tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt',
      'any.required': 'Vui lòng nhập mật khẩu mới',
    }),
});

export const verify2FASchema = Joi.object({
  tempToken: Joi.string().required().messages({
    'string.empty': 'Mã phiên xác thực 2 bước không hợp lệ',
    'any.required': 'Mã phiên xác thực 2 bước là bắt buộc',
  }),
  otp: Joi.string()
    .trim()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.empty': 'Vui lòng nhập mã OTP',
      'string.length': 'Mã OTP phải bao gồm chính xác 6 chữ số',
      'string.pattern.base': 'Mã OTP chỉ được chứa chữ số',
      'any.required': 'Vui lòng nhập mã OTP',
    }),
});

export const confirmEnable2FASchema = Joi.object({
  otp: Joi.string()
    .trim()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.empty': 'Vui lòng nhập mã OTP',
      'string.length': 'Mã OTP phải bao gồm chính xác 6 chữ số',
      'string.pattern.base': 'Mã OTP chỉ được chứa chữ số',
      'any.required': 'Vui lòng nhập mã OTP',
    }),
});

export const disable2FASchema = Joi.object({
  password: Joi.string().min(1).required().messages({
    'string.empty': 'Vui lòng nhập mật khẩu xác nhận',
    'any.required': 'Vui lòng nhập mật khẩu xác nhận',
  }),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'string.empty': 'Vui lòng nhập mật khẩu hiện tại',
    'any.required': 'Vui lòng nhập mật khẩu hiện tại',
  }),
  newPassword: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/])/)
    .required()
    .messages({
      'string.empty': 'Vui lòng nhập mật khẩu mới',
      'string.min': 'Mật khẩu mới phải tối thiểu 8 ký tự',
      'string.pattern.base': 'Mật khẩu phải tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt',
      'any.required': 'Vui lòng nhập mật khẩu mới',
    }),
});
