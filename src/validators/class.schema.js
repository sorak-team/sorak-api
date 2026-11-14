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

export const updateClassSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  ageGroup: Joi.string().valid('NHA_TRE', 'MAM', 'CHOI', 'LA').optional(),
  roomNumber: Joi.string().trim().max(50).allow('', null).optional(),
  description: Joi.string().trim().max(255).allow('', null).optional(),
  updatedAt: Joi.alternatives().try(Joi.date(), Joi.string()).optional(),
  updated_at: Joi.alternatives().try(Joi.date(), Joi.string()).optional(),
});

export const queryClassSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  search: Joi.string().trim().allow('', null).optional(),
  schoolYearId: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string())
    .allow('', null)
    .optional(),
  ageGroup: Joi.string().valid('ALL', 'NHA_TRE', 'MAM', 'CHOI', 'LA').default('ALL'),
  sortBy: Joi.string().valid('name', 'newest', 'oldest').default('name'),
});

export const allocateStudentsSchema = Joi.object({
  studentIds: Joi.array()
    .items(Joi.alternatives().try(Joi.number().integer(), Joi.string()))
    .min(1)
    .required()
    .messages({
      'array.min': 'Danh sách học sinh cần thêm không được rỗng',
      'any.required': 'Danh sách học sinh (studentIds) là bắt buộc',
    }),
});

export const removeStudentsSchema = Joi.object({
  studentIds: Joi.array()
    .items(Joi.alternatives().try(Joi.number().integer(), Joi.string()))
    .min(1)
    .required()
    .messages({
      'array.min': 'Danh sách học sinh cần gỡ không được rỗng',
      'any.required': 'Danh sách học sinh (studentIds) là bắt buộc',
    }),
});

export const queryStudentPoolSchema = Joi.object({
  search: Joi.string().trim().allow('', null).optional(),
  ageGroup: Joi.string().valid('ALL', 'NHA_TRE', 'MAM', 'CHOI', 'LA').default('ALL'),
  status: Joi.string().valid('ALL', 'UNASSIGNED', 'ASSIGNED').default('UNASSIGNED'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(100),
});

export const assignTeacherToClassSchema = Joi.object({
  teacherId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).optional(),
  teacherIds: Joi.array().items(Joi.alternatives().try(Joi.number().integer(), Joi.string())).optional(),
  isPrimary: Joi.boolean().optional(),
  assignedAt: Joi.date().iso().optional(),
  classId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).optional(),
}).or('teacherId', 'teacherIds');


