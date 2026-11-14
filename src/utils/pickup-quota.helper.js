import { BadRequest } from './http-error.js';

/**
 * Convert Date or string to YYYY-MM-DD
 */
export function toIsoDateKey(date) {
  if (!date) return '';
  if (typeof date === 'string') {
    const clean = date.trim();
    if (clean.includes('T')) return clean.split('T')[0];
    if (clean.includes('-')) return clean;
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return clean;
  }
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  return String(date);
}

/**
 * Format YYYY-MM-DD to DD/MM/YYYY
 */
export function formatVnDate(dateStr) {
  if (!dateStr) return '';
  const iso = toIsoDateKey(dateStr);
  const parts = iso.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return dateStr;
}

/**
 * Generate array of YYYY-MM-DD strings between start and end (inclusive)
 */
export function getDatesInRange(startDate, endDate) {
  const startKey = toIsoDateKey(startDate);
  const endKey = toIsoDateKey(endDate);
  if (!startKey || !endKey) return [];
  if (startKey > endKey) return [];

  const dates = [];
  const current = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Retrieve pickup quota info for a student:
 * - parentCount (min 1, max 2)
 * - maxAllowedPerDay = 4 - parentCount
 * - blockedDates (dates that have reached or exceeded maxAllowedPerDay)
 * - dateUsage (map of date -> usage info)
 */
export async function getStudentPickupQuotaInfo(prisma, studentId, { startDate, endDate, excludeAuthId } = {}) {
  const sId = typeof studentId === 'bigint' ? studentId : BigInt(studentId);

  // 1. Count active parents
  const parentCount = await prisma.parent.count({
    where: { student_id: sId, deleted_at: null },
  });
  const safeParentCount = Math.max(1, Math.min(2, parentCount));
  const maxAllowedPerDay = 4 - safeParentCount;

  // 2. Query authorizations (PENDING + APPROVED)
  const where = {
    student_id: sId,
    status: { in: ['PENDING', 'APPROVED'] },
    deleted_at: null,
  };

  if (excludeAuthId) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(excludeAuthId));
      if (isUuid) {
        where.public_id = { not: String(excludeAuthId) };
      } else {
        where.authorization_id = { not: BigInt(excludeAuthId) };
      }
    } catch (e) {
      // ignore
    }
  }

  const startIso = startDate ? toIsoDateKey(startDate) : null;
  const endIso = endDate ? toIsoDateKey(endDate) : null;

  if (startIso && endIso) {
    where.start_date = { lte: new Date(`${endIso}T23:59:59.999Z`) };
    where.end_date = { gte: new Date(`${startIso}T00:00:00.000Z`) };
  }

  const authorizations = await prisma.pickupAuthorization.findMany({
    where,
    select: {
      authorization_id: true,
      public_id: true,
      pickup_person_name: true,
      pickup_person_phone: true,
      relationship: true,
      start_date: true,
      end_date: true,
      status: true,
    },
    orderBy: { start_date: 'asc' },
  });

  const dateUsageMap = {};

  for (const auth of authorizations) {
    const aStart = auth.start_date.toISOString().split('T')[0];
    const aEnd = auth.end_date.toISOString().split('T')[0];

    // If a window is passed, clamp iteration to avoid unnecessary iterations
    const loopStart = startIso && startIso > aStart ? startIso : aStart;
    const loopEnd = endIso && endIso < aEnd ? endIso : aEnd;

    const dates = getDatesInRange(loopStart, loopEnd);
    for (const d of dates) {
      if (!dateUsageMap[d]) {
        dateUsageMap[d] = [];
      }
      dateUsageMap[d].push({
        id: auth.authorization_id.toString(),
        publicId: auth.public_id,
        name: auth.pickup_person_name,
        phone: auth.pickup_person_phone,
        relationship: auth.relationship,
        status: auth.status,
      });
    }
  }

  const blockedDates = [];
  const dateUsage = {};

  for (const [d, delegates] of Object.entries(dateUsageMap)) {
    const currentCount = delegates.length;
    const isFull = currentCount >= maxAllowedPerDay;
    if (isFull) {
      blockedDates.push(d);
    }
    dateUsage[d] = {
      date: d,
      displayDate: formatVnDate(d),
      currentCount,
      maxAllowed: maxAllowedPerDay,
      parentCount: safeParentCount,
      isFull,
      delegates,
    };
  }

  // 3. Check today's dismissal status (tester rule: cannot pick past dates, or today if already dismissed)
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];
  let isTodayDismissed = false;

  const todayAtt = await prisma.attendance.findFirst({
    where: {
      student_id: sId,
      date: {
        gte: new Date(`${todayIso}T00:00:00.000Z`),
        lte: new Date(`${todayIso}T23:59:59.999Z`),
      },
      deleted_at: null,
    },
    select: {
      check_out_time: true,
      status: true,
    },
  });

  if (todayAtt && todayAtt.check_out_time !== null) {
    isTodayDismissed = true;
    if (!blockedDates.includes(todayIso)) {
      blockedDates.push(todayIso);
    }
    dateUsage[todayIso] = {
      date: todayIso,
      displayDate: formatVnDate(todayIso),
      currentCount: maxAllowedPerDay,
      maxAllowed: maxAllowedPerDay,
      parentCount: safeParentCount,
      isFull: true,
      isTodayDismissed: true,
      reason: 'Học sinh đã được đón trong ngày hôm nay',
      delegates: dateUsage[todayIso]?.delegates || [],
    };
  }

  blockedDates.sort();

  return {
    studentId: sId.toString(),
    parentCount: safeParentCount,
    maxAllowedPerDay,
    totalCapacityPerDay: 4,
    todayIso,
    isTodayDismissed,
    blockedDates,
    dateUsage,
  };
}

/**
 * Validate that for the given date range [startDate, endDate], no single day exceeds quota.
 * Throws BadRequest with specific error details if quota is exceeded.
 */
export async function validatePickupQuota(prisma, studentId, { startDate, endDate, excludeAuthId } = {}) {
  const startIso = toIsoDateKey(startDate);
  const endIso = toIsoDateKey(endDate);

  if (!startIso || !endIso) {
    throw BadRequest('Thời gian bắt đầu và kết thúc ủy quyền không hợp lệ.');
  }

  if (startIso > endIso) {
    throw BadRequest('Ngày bắt đầu không được sau ngày kết thúc.');
  }

  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  if (startIso < todayIso) {
    throw BadRequest('Không thể tạo đơn ủy quyền cho ngày trong quá khứ.');
  }

  const quotaInfo = await getStudentPickupQuotaInfo(prisma, studentId, {
    startDate: startIso,
    endDate: endIso,
    excludeAuthId,
  });

  if (quotaInfo.isTodayDismissed && startIso <= todayIso && endIso >= todayIso) {
    throw BadRequest('Học sinh đã được hoàn tất đón trong ngày hôm nay, không thể tạo đơn ủy quyền đón cho hôm nay.');
  }

  const requestedDates = getDatesInRange(startIso, endIso);
  const offendingDates = [];

  for (const d of requestedDates) {
    const usage = quotaInfo.dateUsage[d];
    if (usage && usage.currentCount >= quotaInfo.maxAllowedPerDay) {
      offendingDates.push(usage);
    }
  }

  if (offendingDates.length > 0) {
    const parentNote = `trẻ hiện có ${quotaInfo.parentCount} phụ huynh, tối đa ${quotaInfo.maxAllowedPerDay} người ủy quyền/ngày`;
    if (offendingDates.length === 1) {
      const off = offendingDates[0];
      throw BadRequest(
        `Ngày ${off.displayDate} đã đạt tối đa số người ủy quyền đón (${off.currentCount}/${off.maxAllowed} người do ${parentNote}). Vui lòng chọn ngày khác.`
      );
    } else {
      const datesListStr = offendingDates.map((o) => o.displayDate).join(', ');
      throw BadRequest(
        `Các ngày [${datesListStr}] trong khoảng thời gian đã chọn đã đạt tối đa số người ủy quyền đón (${quotaInfo.maxAllowedPerDay}/${quotaInfo.maxAllowedPerDay} người do ${parentNote}). Vui lòng chọn khoảng thời gian khác.`
      );
    }
  }

  return quotaInfo;
}

