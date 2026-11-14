import prismaPkg from '@prisma/client';
const { Prisma } = prismaPkg;
import { HttpError } from '../utils/http-error.js';
import logger from '../utils/logger.js';

const statusToCode = (status) => {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 423:
      return 'ACCOUNT_LOCKED';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'INTERNAL_ERROR';
  }
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details;

  if (err instanceof HttpError) {
    status = err.status;
    code = err.code || statusToCode(status);
    message = err.message;
    details = err.details;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Dữ liệu không hợp lệ hoặc không đúng định dạng.';
    details = err.message;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      code = 'DUPLICATE_KEY';
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : String(err.meta?.target || '');
      if (target.includes('employee_code')) {
        message = 'Mã giáo viên đã tồn tại trên hệ thống';
      } else if (target.includes('citizen_id')) {
        message = 'Số CCCD/CMND đã tồn tại trên hệ thống';
      } else if (target.includes('student_code')) {
        message = 'Mã học sinh đã tồn tại trên hệ thống';
      } else if (target.includes('phone')) {
        message = 'Số điện thoại đã tồn tại trên hệ thống';
      } else if (target.includes('email')) {
        message = 'Email đã tồn tại trên hệ thống';
      } else {
        message = 'Dữ liệu đã tồn tại trên hệ thống';
      }
      details = err.meta;
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    } else {
      status = 400;
      code = 'DB_ERROR';
      message = 'Lỗi xử lý dữ liệu. Vui lòng kiểm tra lại thông tin hoặc thử lại sau.';
    }
  } else if (err instanceof Error) {
    if (err.name?.includes('Prisma') || err.message?.includes('prisma.') || err.message?.includes('Invalid `prisma.')) {
      status = 500;
      code = 'INTERNAL_ERROR';
      message = 'Đã có lỗi xảy ra trong quá trình xử lý. Vui lòng thử lại sau.';
    } else {
      message = err.message;
    }
  }

  if (status >= 500) {
    logger.error(
      { err, traceId: req.traceId, method: req.method, url: req.url },
      'Unhandled error',
    );
  }

  const stripBr = (msg) => {
    if (typeof msg !== 'string') return msg;
    return msg
      .replace(/\s*\([A-Z]*\s*BR[-_ ]?\d+[^)]*\)/gi, '')
      .replace(/\s*\[[A-Z]*\s*BR[-_ ]?\d+[^\]]*\]/gi, '')
      .replace(/Theo quy định BR[-_ ]?\d+,\s*/gi, 'Theo quy định, ')
      .replace(/quy định BR[-_ ]?\d+/gi, 'quy định')
      .replace(/\bBR[-_]\d+\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  message = stripBr(message);
  if (Array.isArray(details)) {
    details = details.map((d) =>
      d && typeof d === 'object' && d.message ? { ...d, message: stripBr(d.message) } : d,
    );
  }

  res.status(status).json({
    success: false,
    code,
    message,
    details,
    traceId: req.traceId,
    timestamp: new Date().toISOString(),
    path: req.url,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.url} not found`,
    traceId: req.traceId,
    timestamp: new Date().toISOString(),
    path: req.url,
  });
}
