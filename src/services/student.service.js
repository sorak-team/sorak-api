import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';

export class StudentService {

  _parseId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (isUuid) {
        return { public_id: str };
      }
      // Reject pure numeric database sequence IDs
      if (/^\d+$/.test(str)) {
        return { public_id: '00000000-0000-0000-0000-000000000000' };
      }
      // Allow student code (e.g. HS24001)
      if (/^[A-Za-z0-9_-]+$/.test(str)) {
        return { student_code: str };
      }
      return { public_id: '00000000-0000-0000-0000-000000000000' };
    }

}
export const studentService = new StudentService();
export default studentService;
