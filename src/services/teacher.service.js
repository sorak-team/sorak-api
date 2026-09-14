import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class TeacherService {

  _parseId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (isUuid) return { public_id: str };
      if (/^[A-Za-z0-9_-]+$/.test(str) && !/^\d+$/.test(str)) return { employee_code: str };
      return { public_id: '00000000-0000-0000-0000-000000000000' };
    }

}
export const teacherService = new TeacherService();
export default teacherService;
