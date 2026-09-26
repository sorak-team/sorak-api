export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function createHttpError(status, code, defaultMsg) {
  function HttpErrorInstance(msg = defaultMsg, details) {
    if (!(this instanceof HttpErrorInstance)) {
      return new HttpErrorInstance(msg, details);
    }
    const err = new HttpError(status, code, msg, details);
    Object.setPrototypeOf(err, HttpErrorInstance.prototype);
    return err;
  }
  Object.setPrototypeOf(HttpErrorInstance.prototype, HttpError.prototype);
  HttpErrorInstance.prototype.name = code;
  return HttpErrorInstance;
}

export const BadRequest = createHttpError(400, 'VALIDATION_ERROR', 'Yêu cầu không hợp lệ');
export const Unauthorized = createHttpError(401, 'UNAUTHORIZED', 'Chưa xác thực');
export const Forbidden = createHttpError(403, 'FORBIDDEN', 'Không có quyền truy cập');
export const NotFound = createHttpError(404, 'NOT_FOUND', 'Không tìm thấy tài nguyên');
export const Conflict = createHttpError(409, 'CONFLICT', 'Dữ liệu đã tồn tại hoặc xung đột');
export const Locked = createHttpError(423, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa');

