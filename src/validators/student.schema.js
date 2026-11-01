import Joi from 'joi';

const parentItemSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(150).required().messages({
    'string.empty': 'Họ và tên phụ huynh không được để trống',
    'any.required': 'Họ và tên phụ huynh là bắt buộc',
  }),
  relationship: Joi.string().trim().max(50).required().messages({
    'string.empty': 'Mối quan hệ không được để trống',
    'any.required': 'Mối quan hệ là bắt buộc',
  }),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Số điện thoại phụ huynh phải từ 9 đến 15 chữ số',
      'any.required': 'Số điện thoại phụ huynh là bắt buộc',
    }),
  citizenId: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,12}$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'Số CCCD phải có từ 9 đến 12 chữ số',
    }),
  citizen_id: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,12}$/)
    .allow('', null)
    .optional(),
  id: Joi.any().optional(),
  publicId: Joi.any().optional(),
  avatarUrl: Joi.any().optional(),
  isPrimary: Joi.any().optional(),
});

export const createStudentSchema = Joi.object({
  studentCode: Joi.string().trim().min(2).max(50).required().messages({
    'string.empty': 'Mã học sinh không được để trống',
    'string.min': 'Mã học sinh phải có ít nhất 2 ký tự',
    'any.required': 'Mã học sinh là bắt buộc',
  }),
  fullName: Joi.string().trim().min(2).max(150).required().messages({
    'string.empty': 'Họ và tên học sinh không được để trống',
    'string.min': 'Họ và tên phải có ít nhất 2 ký tự',
    'any.required': 'Họ và tên học sinh là bắt buộc',
  }),
  dateOfBirth: Joi.date().iso().min('2000-01-01').required().messages({
    'date.base': 'Ngày sinh không đúng định dạng YYYY-MM-DD',
    'date.min': 'Ngày sinh học sinh phải từ năm 2000 trở đi',
    'any.required': 'Ngày sinh là bắt buộc',
  }),
  gender: Joi.string().valid('MALE', 'FEMALE').required().messages({
    'any.only': 'Giới tính phải là MALE hoặc FEMALE',
    'any.required': 'Giới tính là bắt buộc',
  }),
  ethnic: Joi.string().trim().max(50).allow('', null).optional(),
  nationality: Joi.string().trim().max(50).default('Việt Nam'),
  placeOfBirth: Joi.string().trim().max(150).allow('', null).optional(),
  permanentResidence: Joi.string().trim().max(255).allow('', null).optional(),
  currentResidence: Joi.string().trim().max(255).allow('', null).optional(),
  status: Joi.string()
    .valid('STUDYING', 'RESERVED', 'TRANSFERRED', 'DROPPED_OUT', 'GRADUATED')
    .default('STUDYING'),
  enrollmentDate: Joi.date().iso().min('2000-01-01').required().messages({
    'date.base': 'Ngày nhập học không đúng định dạng',
    'date.min': 'Ngày nhập học tối thiểu từ năm 2000 (từ ngày 01/01/2000 trở đi)',
    'any.required': 'Ngày nhập học là bắt buộc',
  }),
  allergyNotes: Joi.string().allow('', null).optional(),
  medicalNotes: Joi.string().allow('', null).optional(),
  previousSchool: Joi.string().trim().max(255).allow('', null).optional(),
  notes: Joi.string().allow('', null).optional(),

  // Optional avatar / legacy fields
  username: Joi.string().trim().min(3).max(100).allow('', null).optional(),
  password: Joi.string().min(6).allow('', null).optional(),
  avatarUrl: Joi.string().trim().max(500).allow('', null).optional(),

  // Initial Class Enrollment
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null).optional(),
  enrolledAt: Joi.date().iso().optional(),

  // Parents / Guardians array
  parents: Joi.array().items(parentItemSchema).optional().default([]),
});

export const updateStudentSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(150).optional(),
  dateOfBirth: Joi.date().iso().min('2000-01-01').optional().messages({
    'date.base': 'Ngày sinh không đúng định dạng YYYY-MM-DD',
    'date.min': 'Ngày sinh học sinh phải từ năm 2000 trở đi',
  }),
  gender: Joi.string().valid('MALE', 'FEMALE').optional(),
  ethnic: Joi.string().trim().max(50).allow('', null).optional(),
  nationality: Joi.string().trim().max(50).optional(),
  placeOfBirth: Joi.string().trim().max(150).allow('', null).optional(),
  permanentResidence: Joi.string().trim().max(255).allow('', null).optional(),
  currentResidence: Joi.string().trim().max(255).allow('', null).optional(),
  status: Joi.string()
    .valid('STUDYING', 'RESERVED', 'TRANSFERRED', 'DROPPED_OUT', 'GRADUATED')
    .optional(),
  enrollmentDate: Joi.date().iso().min('2000-01-01').optional().messages({
    'date.base': 'Ngày nhập học không đúng định dạng',
    'date.min': 'Ngày nhập học tối thiểu từ năm 2000 (từ ngày 01/01/2000 trở đi)',
  }),
  allergyNotes: Joi.string().allow('', null).optional(),
  medicalNotes: Joi.string().allow('', null).optional(),
  previousSchool: Joi.string().trim().max(255).allow('', null).optional(),
  notes: Joi.string().allow('', null).optional(),

  // Account synced fields
  avatarUrl: Joi.string().trim().max(500).allow('', null).optional(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .allow('', null)
    .optional(),

  // Parents / Guardians array
  parents: Joi.array().items(parentItemSchema).optional(),
});

export const queryStudentSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(20),
  search: Joi.string().trim().allow('', null).optional(),
  status: Joi.string()
    .valid('ALL', 'STUDYING', 'RESERVED', 'TRANSFERRED', 'DROPPED_OUT', 'GRADUATED')
    .default('ALL'),
  gender: Joi.string().valid('ALL', 'MALE', 'FEMALE').default('ALL'),
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow('', null).optional(),
  sortBy: Joi.string()
    .valid('newest', 'oldest', 'name', 'code', 'dob', 'enrollmentDate')
    .default('newest'),
});

export const assignStudentClassSchema = Joi.object({
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
    'any.required': 'Mã lớp học (classId) là bắt buộc',
  }),
  enrolledAt: Joi.date()
    .iso()
    .default(() => new Date()),
});

export const transferStudentClassSchema = Joi.object({
  fromClassId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
    'any.required': 'Lớp học hiện tại (fromClassId) là bắt buộc',
  }),
  toClassId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
    'any.required': 'Lớp học chuyển đến (toClassId) là bắt buộc',
  }),
  transferDate: Joi.date()
    .iso()
    .default(() => new Date()),
  reason: Joi.string().trim().min(2).required().messages({
    'string.empty': 'Lý do chuyển lớp không được để trống',
    'any.required': 'Lý do chuyển lớp là bắt buộc',
  }),
  autoApprove: Joi.boolean().default(false),
});

export const parentSchema = parentItemSchema;
export const updateParentSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(150).optional(),
  relationship: Joi.string().trim().max(50).optional(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,15}$/)
    .optional(),
  citizenId: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,12}$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'Số CCCD phải có từ 9 đến 12 chữ số',
    }),
  citizen_id: Joi.string()
    .trim()
    .pattern(/^[0-9]{9,12}$/)
    .allow('', null)
    .optional(),
});
