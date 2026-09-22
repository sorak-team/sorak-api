import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import { teacherService } from './teacher.service.js';

const GRADE_LABELS = {
  NHA_TRE: 'Khối Nhà trẻ',
  MAM: 'Khối Mầm',
  CHOI: 'Khối Chồi',
  LA: 'Khối Lá',
};

const GRADE_COLORS = {
  NHA_TRE: 'amber',
  MAM: 'blue',
  CHOI: 'coral',
  LA: 'emerald',
};

const GRADE_PLANET_KEYS = {
  NHA_TRE: 'nhatre',
  MAM: 'mam',
  CHOI: 'choi',
  LA: 'la',
};

const getClassPlanetUrl = (ageGroup, theme = 'light') => {
  const key = GRADE_PLANET_KEYS[ageGroup] || 'nhatre';
  const t = theme === 'dark' ? 'dark' : 'light';
  return `/planets/${key}-${t}.svg`;
};

export class ClassService {

  _parseId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
    }

  _parseTeacherId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      return { public_id: isUuid ? str : '00000000-0000-0000-0000-000000000000' };
    }

  _parseStudentId(id) {
      const str = String(id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (isUuid) return { public_id: str };
      if (/^[A-Za-z0-9_-]+$/.test(str) && !/^\d+$/.test(str)) return { student_code: str };
      return { public_id: '00000000-0000-0000-0000-000000000000' };
    }

}
export const classService = new ClassService();
export default classService;
