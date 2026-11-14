import Joi from 'joi';

const validateCalendarDate = (fieldName, minYear = null) => (value, helpers) => {
  if (!value) return value;
  const str = String(value).split('T')[0];
  const parts = str.split('-');
  if (parts.length !== 3) {
    return helpers.message(`${fieldName} không đúng định dạng YYYY-MM-DD`);
  }
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12) {
    return helpers.message(`${fieldName} không đúng định dạng`);
  }
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) {
    return helpers.message(`${fieldName} không tồn tại. Vui lòng nhập ngày hợp lệ.`);
  }
  if (minYear !== null && y < minYear) {
    return helpers.message(`${fieldName} tối thiểu từ năm ${minYear} (từ ngày 01/01/${minYear} trở đi)`);
  }
  return value;
};

export const createTeacherSchema = Joi.object({
  employeeCode: Joi.string().trim().min(2).max(50).allow('', null).optional().messages({
    'string.min': 'Mã giáo viên phải có ít nhất 2 ký tự',
  }),
  fullName: Joi.string().trim().min(2).max(150).required().messages({
    'string.empty': 'Vui lòng nhập họ và tên.',
    'string.min': 'Họ và tên phải có ít nhất 2 ký tự',
    'any.required': 'Vui lòng nhập họ và tên.',
  }),
  dateOfBirth: Joi.string().trim().required().custom(validateCalendarDate('Ngày sinh')).messages({
    'string.empty': 'Ngày sinh là bắt buộc',
    'any.required': 'Ngày sinh là bắt buộc',
  }),
  gender: Joi.string().valid('MALE', 'FEMALE').required().messages({
    'any.only': 'Giới tính phải là MALE hoặc FEMALE',
    'any.required': 'Giới tính là bắt buộc',
  }),
  citizenId: Joi.string()
    .trim()
    .pattern(/^([0-9]{9}|[0-9]{12})$/)
    .required()
    .messages({
      'string.empty': 'Vui lòng nhập số CCCD/CMND.',
      'string.pattern.base': 'Số CCCD/CMND không đúng định dạng. Vui lòng kiểm tra lại.',
      'any.required': 'Số CCCD/CMND là bắt buộc',
    }),
  address: Joi.string().trim().max(255).allow('', null).optional(),
  position: Joi.string().trim().max(100).allow('', null).optional(),
  workStatus: Joi.string().valid('WORKING', 'LEAVE_OF_ABSENCE', 'RESIGNED').default('WORKING'),
  startDate: Joi.string().trim().required().custom(validateCalendarDate('Ngày vào làm', 2000)).messages({
    'string.empty': 'Vui lòng chọn ngày vào làm.',
    'any.required': 'Vui lòng chọn ngày vào làm.',
  }),
  endDate: Joi.date().iso().allow(null).optional(),

  // Account integration (Single Source of Truth)
  email: Joi.string().trim().email().required().messages({
    'string.empty': 'Vui lòng nhập email.',
    'string.email': 'Email không đúng định dạng',
    'any.required': 'Vui lòng nhập email.',
  }),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .allow('', null)
    .optional(),
  username: Joi.string().trim().min(3).max(100).optional(),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/])/)
    .default('Sorak@2026')
    .messages({
      'string.min': 'Mật khẩu phải tối thiểu 8 ký tự',
      'string.pattern.base': 'Mật khẩu phải tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt',
    }),
  avatarUrl: Joi.string().trim().max(500).allow('', null).optional(),

  // Optional initial class assignment
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null).optional(),
  isPrimary: Joi.boolean().optional(),
});

export const updateTeacherSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(150).optional().messages({
    'string.empty': 'Vui lòng nhập họ và tên.',
    'string.min': 'Họ và tên phải có ít nhất 2 ký tự',
  }),
  dateOfBirth: Joi.string().trim().custom(validateCalendarDate('Ngày sinh')).optional(),
  gender: Joi.string().valid('MALE', 'FEMALE').optional(),
  citizenId: Joi.string()
    .trim()
    .pattern(/^([0-9]{9}|[0-9]{12})$/)
    .optional()
    .messages({
      'string.pattern.base': 'Số CCCD/CMND không đúng định dạng. Vui lòng kiểm tra lại.',
    }),
  address: Joi.string().trim().max(255).allow('', null).optional(),
  position: Joi.string().trim().max(100).allow('', null).optional(),
  workStatus: Joi.string().valid('WORKING', 'LEAVE_OF_ABSENCE', 'RESIGNED').optional(),
  startDate: Joi.string().trim().custom(validateCalendarDate('Ngày vào làm', 2000)).optional(),
  endDate: Joi.date().iso().allow(null).optional(),

  // Account synced fields
  email: Joi.string().trim().email().allow('', null).optional().messages({
    'string.email': 'Email không đúng định dạng',
  }),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .allow('', null)
    .optional(),
  avatarUrl: Joi.string().trim().max(500).allow('', null).optional(),
  updatedAt: Joi.date().iso().allow(null, '').optional(),
  updated_at: Joi.date().iso().allow(null, '').optional(),
});

export const queryTeacherSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow('', null).optional(),
  workStatus: Joi.string().valid('ALL', 'WORKING', 'LEAVE_OF_ABSENCE', 'RESIGNED').default('ALL'),
  gender: Joi.string().valid('ALL', 'MALE', 'FEMALE').default('ALL'),
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow('', null).optional(),
  sortBy: Joi.string().valid('newest', 'oldest', 'name', 'code', 'startDate').default('newest'),
  includeDeleted: Joi.boolean().optional(),
});

export const assignTeacherClassSchema = Joi.object({
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
    'any.required': 'Mã lớp học (classId) là bắt buộc',
  }),
  isPrimary: Joi.boolean().optional(),
  assignedAt: Joi.date()
    .iso()
    .default(() => new Date()),
});

export const updateTeacherClassSchema = Joi.object({
  isPrimary: Joi.boolean().optional(),
  leftAt: Joi.date().iso().allow(null).optional(),
  leaveReason: Joi.string()
    .valid('COMPLETED_SCHOOL_YEAR', 'LEAVE_OF_ABSENCE', 'RESIGNED', 'REMOVED')
    .allow(null)
    .optional(),
});
