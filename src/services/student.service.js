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

  _parseParentId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
    }

  _getDefaultAvatar(seed) {
      const safeSeed = (seed || 'student').toString().trim();
      return `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(safeSeed)}&backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676`;
    }

}
export const studentService = new StudentService();
export default studentService;
