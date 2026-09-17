import Joi from 'joi';

export const createSchoolYearSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).required().messages({
    'string.empty': 'Tên năm học không được để trống',
    'string.min': 'Tên năm học phải có ít nhất 3 ký tự',
    'string.max': 'Tên năm học không vượt quá 50 ký tự',
    'any.required': 'Tên năm học là bắt buộc',
  }),
  startDate: Joi.date().iso().required().messages({
    'date.base': 'Ngày bắt đầu không đúng định dạng ngày tháng (YYYY-MM-DD)',
    'any.required': 'Ngày bắt đầu năm học là bắt buộc',
  }),
  semester1EndDate: Joi.date().iso().greater(Joi.ref('startDate')).less(Joi.ref('endDate')).required().messages({
    'date.base': 'Ngày kết thúc học kỳ 1 không đúng định dạng ngày tháng (YYYY-MM-DD)',
    'date.greater': 'Ngày kết thúc học kỳ 1 phải diễn ra sau ngày bắt đầu năm học',
    'date.less': 'Ngày kết thúc học kỳ 1 phải diễn ra trước ngày kết thúc năm học',
    'any.required': 'Ngày kết thúc học kỳ 1 là bắt buộc',
  }),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')).required().messages({
    'date.base': 'Ngày kết thúc không đúng định dạng ngày tháng (YYYY-MM-DD)',
    'date.greater': 'Ngày kết thúc phải diễn ra sau ngày bắt đầu',
    'any.required': 'Ngày kết thúc năm học là bắt buộc',
  }),
  status: Joi.string().valid('UPCOMING', 'ACTIVE', 'COMPLETED').default('UPCOMING').messages({
    'any.only': 'Trạng thái năm học phải là UPCOMING, ACTIVE hoặc COMPLETED',
  }),
  colorTheme: Joi.string().optional(),
});

