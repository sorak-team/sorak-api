import { Forbidden } from '../utils/http-error.js';

export const requireRoles =
  (...allowed) =>
  (req, res, next) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      return next(Forbidden('Access denied: insufficient permissions'));
    }
    next();
  };