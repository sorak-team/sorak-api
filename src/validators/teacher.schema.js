import Joi from 'joi';

export const createTeacherSchema = Joi.object({
  employeeCode: Joi.string().trim().min(2).max(50).required().messages({
    'string.empty': 'Mã giáo viên không được để trống',
    'string.min': 'Mã giáo viên phải có ít nhất 2 ký tự',
    'any.required': 'Mã giáo viên là bắt buộc',
  }),
  fullName: Joi.string().trim().min(2).max(150).required().messages({
    'string.empty': 'Họ và tên không được để trống',
    'string.min': 'Họ và tên phải có ít nhất 2 ký tự',
    'any.required': 'Họ và tên giáo viên là bắt buộc',
  }),
  dateOfBirth: Joi.date().iso().required().messages({
    'date.base': 'Ngày sinh không đúng định dạng YYYY-MM-DD',
    'any.required': 'Ngày sinh là bắt buộc',
  }),
  gender: Joi.string().valid('MALE', 'FEMALE').required().messages({
    'any.only': 'Giới tính phải là MALE hoặc FEMALE',
    'any.required': 'Giới tính là bắt buộc',
  }),
  citizenId: Joi.string().trim().min(9).max(20).required().messages({
    'string.empty': 'Số CCCD/CMND không được để trống',
    'any.required': 'Số CCCD/CMND là bắt buộc',
  }),
  address: Joi.string().trim().max(255).allow('', null).optional(),
  position: Joi.string().trim().max(100).allow('', null).optional(),
  workStatus: Joi.string().valid('WORKING', 'LEAVE_OF_ABSENCE', 'RESIGNED').default('WORKING'),
  startDate: Joi.date().iso().min('2000-01-01').required().messages({
    'date.base': 'Ngày bắt đầu công tác không đúng định dạng',
    'date.min': 'Ngày bắt đầu công tác tối thiểu từ năm 2000 (từ ngày 01/01/2000 trở đi)',
    'any.required': 'Ngày bắt đầu công tác là bắt buộc',
  }),
  endDate: Joi.date().iso().allow(null).optional(),

  // Account integration (Single Source of Truth)
  email: Joi.string().trim().email().allow('', null).optional(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .allow('', null)
    .optional(),
  username: Joi.string().trim().min(3).max(100).optional(),
  password: Joi.string().min(6).default('123456'),
  avatarUrl: Joi.string().trim().max(500).allow('', null).optional(),

  // Optional initial class assignment
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null).optional(),
  isPrimary: Joi.boolean().default(false),
});

export const updateTeacherSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(150).optional(),
  dateOfBirth: Joi.date().iso().optional(),
  gender: Joi.string().valid('MALE', 'FEMALE').optional(),
  citizenId: Joi.string().trim().min(9).max(20).optional(),
  address: Joi.string().trim().max(255).allow('', null).optional(),
  position: Joi.string().trim().max(100).allow('', null).optional(),
  workStatus: Joi.string().valid('WORKING', 'LEAVE_OF_ABSENCE', 'RESIGNED').optional(),
  startDate: Joi.date().iso().min('2000-01-01').optional().messages({
    'date.base': 'Ngày bắt đầu công tác không đúng định dạng',
    'date.min': 'Ngày bắt đầu công tác tối thiểu từ năm 2000 (từ ngày 01/01/2000 trở đi)',
  }),
  endDate: Joi.date().iso().allow(null).optional(),

  // Account synced fields
  email: Joi.string().trim().email().allow('', null).optional(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .allow('', null)
    .optional(),
  avatarUrl: Joi.string().trim().max(500).allow('', null).optional(),
});

export const queryTeacherSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow('', null).optional(),
  workStatus: Joi.string().valid('ALL', 'WORKING', 'LEAVE_OF_ABSENCE', 'RESIGNED').default('ALL'),
  gender: Joi.string().valid('ALL', 'MALE', 'FEMALE').default('ALL'),
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow('', null).optional(),
  sortBy: Joi.string().valid('newest', 'oldest', 'name', 'code', 'startDate').default('newest'),
});

export const assignTeacherClassSchema = Joi.object({
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
    'any.required': 'Mã lớp học (classId) là bắt buộc',
  }),
  isPrimary: Joi.boolean().default(false),
  assignedAt: Joi.date()
    .iso()
    .default(() => new Date()),
});

export const updateTeacherClassSchema = Joi.object({
  isPrimary: Joi.boolean().optional(),
  leftAt: Joi.date().iso().allow(null).optional(),
});
