import { randomUUID } from 'crypto';
import prisma from '../config/prisma.js';
import { BadRequest, NotFound, Unauthorized, Forbidden } from '../utils/http-error.js';
import logger from '../utils/logger.js';

class NotificationService {
  /**
   * Helper to resolve the database account record from req.user
   * (supports user.account_id, user.sub UUID, user.id)
   */
  async resolveAccount(user) {
    if (!user) {
      throw Unauthorized('Chưa xác thực người dùng');
    }
    if (user.account_id && typeof user.account_id !== 'undefined') {
      return user;
    }

    const sub = user.sub || user.id || user.public_id;
    if (!sub) {
      throw Unauthorized('Không tìm thấy định danh tài khoản người dùng');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sub));
    const account = await prisma.account.findFirst({
      where: isUuid ? { public_id: String(sub) } : { account_id: BigInt(sub) },
    });

    if (!account) {
      throw Unauthorized('Tài khoản người dùng không tồn tại');
    }

    return account;
  }

  /**
   * Helper to resolve recipient account IDs based on targetScope and options
   */
  async resolveRecipientAccountIds(targetScope, options = {}) {
    const { targetGrade, targetClassIds = [], targetAccountIds = [] } = options;
    const accountIdSet = new Set();

    switch (targetScope) {
      case 'ALL': {
        const accounts = await prisma.account.findMany({
          where: {
            role: { in: ['PRINCIPAL_BGH', 'TEACHER_GV', 'PARENT_PH'] },
            is_active: true,
            deleted_at: null,
          },
          select: { account_id: true },
        });
        accounts.forEach((a) => {
          if (a.account_id) accountIdSet.add(a.account_id.toString());
        });
        break;
      }

      case 'ALL_TEACHERS': {
        const teachers = await prisma.account.findMany({
          where: {
            role: 'TEACHER_GV',
            is_active: true,
            deleted_at: null,
          },
          select: { account_id: true },
        });
        teachers.forEach((a) => {
          if (a.account_id) accountIdSet.add(a.account_id.toString());
        });
        break;
      }

      case 'ALL_PARENTS': {
        const parents = await prisma.account.findMany({
          where: {
            role: 'PARENT_PH',
            is_active: true,
            deleted_at: null,
          },
          select: { account_id: true },
        });
        parents.forEach((a) => {
          if (a.account_id) accountIdSet.add(a.account_id.toString());
        });
        break;
      }

      case 'GRADE': {
        if (!targetGrade) {
          throw BadRequest('Vui lòng chọn khối tuổi (targetGrade)');
        }

        // Find classes matching age_group
        const classes = await prisma.class.findMany({
          where: {
            age_group: targetGrade,
            deleted_at: null,
          },
          select: { class_id: true },
        });

        const classIds = classes.map((c) => c.class_id);
        await this.addClassRecipientAccountIds(classIds, accountIdSet);
        break;
      }

      case 'CLASS': {
        if (!targetClassIds || targetClassIds.length === 0) {
          throw BadRequest('Vui lòng chọn ít nhất một lớp học');
        }

        const parsedClassIds = await this.resolveClassIds(targetClassIds, { strict: true });
        await this.addClassRecipientAccountIds(parsedClassIds, accountIdSet);
        break;
      }

      case 'INDIVIDUAL': {
        if (!targetAccountIds || targetAccountIds.length === 0) {
          throw BadRequest('Vui lòng chọn ít nhất một tài khoản người nhận');
        }

        for (const rawId of targetAccountIds) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(rawId));
          const acc = await prisma.account.findFirst({
            where: isUuid ? { public_id: String(rawId) } : { account_id: BigInt(rawId) },
            select: { account_id: true },
          });
          if (acc?.account_id) {
            accountIdSet.add(acc.account_id.toString());
          }
        }
        break;
      }

      default:
        throw BadRequest(`Phạm vi gửi không hợp lệ: ${targetScope}`);
    }

    return Array.from(accountIdSet).map((id) => BigInt(id));
  }

  /**
   * Helper to get all active Principal / BGH account IDs
   */
  async getPrincipalAccountIds() {
    try {
      const bghAccounts = await prisma.account.findMany({
        where: {
          role: 'PRINCIPAL_BGH',
          is_active: true,
          deleted_at: null,
        },
        select: { account_id: true },
      });
      return bghAccounts.map((a) => a.account_id);
    } catch {
      return [];
    }
  }

  /**
   * Resolve class UUIDs (public_id) or numeric IDs (class_id) to active bigint class_ids.
   */
  async resolveClassIds(rawClassIds = [], { strict = false } = {}) {
    const normalized = rawClassIds
      .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
      .map((id) => String(id).trim());

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuids = [];
    const numericIds = [];

    for (const idStr of normalized) {
      if (uuidRegex.test(idStr)) {
        uuids.push(idStr.toLowerCase());
      } else if (/^\d+$/.test(idStr)) {
        numericIds.push(idStr);
      } else if (strict) {
        throw BadRequest('Mã lớp học không hợp lệ');
      }
    }

    const uniqueUuids = [...new Set(uuids)];
    const uniqueNumericIdStrs = [...new Set(numericIds)];
    const uniqueNumericIds = uniqueNumericIdStrs.map((n) => BigInt(n));

    if (uniqueUuids.length === 0 && uniqueNumericIds.length === 0) {
      return [];
    }

    const orFilters = [];
    if (uniqueUuids.length > 0) orFilters.push({ public_id: { in: uniqueUuids } });
    if (uniqueNumericIds.length > 0) orFilters.push({ class_id: { in: uniqueNumericIds } });

    const classes = await prisma.class.findMany({
      where: {
        deleted_at: null,
        OR: orFilters,
      },
      select: { class_id: true, public_id: true },
    });

    if (strict) {
      const matchedKeys = new Set([
        ...classes.map((c) => c.public_id.toLowerCase()),
        ...classes.map((c) => c.class_id.toString()),
      ]);
      const hasMissing =
        uniqueUuids.some((u) => !matchedKeys.has(u)) ||
        uniqueNumericIdStrs.some((n) => !matchedKeys.has(n));

      if (classes.length === 0 || hasMissing) {
        throw BadRequest('Một hoặc nhiều lớp học được chọn không tồn tại hoặc đã bị xóa');
      }
    }

    return classes.map((c) => c.class_id);
  }

  /**
   * Collect active teacher and enrolled student account IDs for the given class_ids.
   */
  async addClassRecipientAccountIds(classIds, accountIdSet) {
    if (!classIds || classIds.length === 0) return;

    const teacherClasses = await prisma.teacherClass.findMany({
      where: {
        class_id: { in: classIds },
        left_at: null,
        teacher: {
          deleted_at: null,
          account: {
            is_active: true,
            deleted_at: null,
          },
        },
      },
      include: {
        teacher: { select: { account_id: true } },
      },
    });
    teacherClasses.forEach((tc) => {
      if (tc.teacher?.account_id) {
        accountIdSet.add(tc.teacher.account_id.toString());
      }
    });

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: { in: classIds },
        status: 'ENROLLED',
        left_at: null,
        student: {
          deleted_at: null,
          account: {
            is_active: true,
            deleted_at: null,
          },
        },
      },
      include: {
        student: { select: { account_id: true } },
      },
    });
    enrollments.forEach((e) => {
      if (e.student?.account_id) {
        accountIdSet.add(e.student.account_id.toString());
      }
    });
  }

  /**
   * Helper to get teacher account IDs assigned to a specific class
   */
  async getClassTeacherAccountIds(classId) {
    if (!classId) return [];
    try {
      const resolvedClassIds = await this.resolveClassIds([classId]);
      if (resolvedClassIds.length === 0) return [];
      const teacherClasses = await prisma.teacherClass.findMany({
        where: {
          class_id: { in: resolvedClassIds },
          left_at: null,
          teacher: {
            deleted_at: null,
            account: {
              is_active: true,
              deleted_at: null,
            },
          },
        },
        include: {
          teacher: { select: { account_id: true } },
        },
      });
      return teacherClasses
        .map((tc) => tc.teacher?.account_id)
        .filter((id) => id !== null && id !== undefined);
    } catch {
      return [];
    }
  }

  /**
   * Helper to get teacher account IDs assigned to a specific grade / ageGroup
   */
  async getGradeTeacherAccountIds(ageGroup, schoolYearId = null) {
    try {
      const where = { left_at: null };
      if (ageGroup) {
        where.class = { age_group: ageGroup };
        if (schoolYearId) where.class.school_year_id = schoolYearId;
      }
      const teacherClasses = await prisma.teacherClass.findMany({
        where,
        include: {
          teacher: { select: { account_id: true } },
        },
      });
      return Array.from(
        new Set(
          teacherClasses
            .map((tc) => tc.teacher?.account_id)
            .filter((id) => id !== null && id !== undefined),
        ),
      );
    } catch {
      return [];
    }
  }

  /**
   * Core dispatcher to emit system event notifications to one or multiple accounts
   */
  async emitSystemNotification({
    recipientAccountIds = [],
    creatorAccountId = null,
    type = 'SCHOOL_ANNOUNCEMENT',
    title,
    body,
    data = {},
  }) {
    try {
      const rawIds = Array.isArray(recipientAccountIds)
        ? recipientAccountIds
        : [recipientAccountIds];

      const validAccountIds = rawIds
        .filter((id) => id !== null && id !== undefined && id !== '')
        .map((id) => (typeof id === 'bigint' ? id : BigInt(String(id))));

      if (validAccountIds.length === 0) return [];

      // Deduplicate recipient IDs
      const uniqueIds = Array.from(new Set(validAccountIds));

      let parsedCreatorId = null;
      if (creatorAccountId) {
        try {
          parsedCreatorId =
            typeof creatorAccountId === 'bigint'
              ? creatorAccountId
              : BigInt(String(creatorAccountId));
        } catch {
          parsedCreatorId = null;
        }
      }

      const records = uniqueIds.map((accId) => ({
        account_id: accId,
        created_by: parsedCreatorId,
        type: type || 'SCHOOL_ANNOUNCEMENT',
        title: title || 'Thông báo hệ thống',
        body: body || '',
        data: {
          ...data,
          notification_type: data.type || type,
        },
        is_read: false,
      }));

      await prisma.notification.createMany({
        data: records,
      });

      // Asynchronously trigger Expo Push Notifications for recipient mobile devices
      this.sendExpoPushNotifications({
        recipientAccountIds: uniqueIds,
        title: title || 'Thông báo hệ thống',
        body: body || '',
        data: {
          ...data,
          type: type || 'SCHOOL_ANNOUNCEMENT',
        },
      }).catch((pushErr) => {
        logger.warn({ error: pushErr.message }, 'Failed to trigger background push notifications');
      });

      return records;
    } catch (err) {
      logger.warn({ error: err.message }, 'Failed to emit system notification');
      return [];
    }
  }

  /**
   * Principal creates or schedules a broadcast notification
   */
  async createBroadcast(data, currentUser) {
    const account = await this.resolveAccount(currentUser);

    const {
      title,
      body,
      targetScope,
      targetGrade,
      targetClassIds = [],
      targetAccountIds = [],
      scheduledAt = null,
      attachments = [],
    } = data;

    // Resolve recipients
    const recipientAccountIds = await this.resolveRecipientAccountIds(targetScope, {
      targetGrade,
      targetClassIds,
      targetAccountIds,
    });

    // Remove sender from recipient list
    const filteredRecipientIds = recipientAccountIds.filter(
      (id) => id.toString() !== account.account_id.toString()
    );

    if (filteredRecipientIds.length === 0) {
      throw BadRequest('Không tìm thấy tài khoản người nhận hợp lệ phù hợp với phạm vi đã chọn');
    }

    const batchId = randomUUID();
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    const now = new Date();

    const sharedData = {
      batch_id: batchId,
      target_scope: targetScope,
      target_grade: targetGrade || null,
      target_class_ids: targetClassIds.map((id) => id.toString()),
      attachments,
    };

    // 1. Recipient notifications
    const recipientRecords = filteredRecipientIds.map((recipientId) => ({
      account_id: recipientId,
      created_by: account.account_id,
      type: 'SCHOOL_ANNOUNCEMENT',
      title,
      body,
      data: {
        ...sharedData,
        is_master: false,
      },
      scheduled_at: scheduledDate,
      is_read: false,
      created_at: now,
    }));

    // 2. Master notification record for the Principal (BGH)
    const masterRecord = {
      account_id: account.account_id,
      created_by: account.account_id,
      type: 'SCHOOL_ANNOUNCEMENT',
      title,
      body,
      data: {
        ...sharedData,
        is_master: true,
        total_recipients: filteredRecipientIds.length,
      },
      scheduled_at: scheduledDate,
      is_read: false,
      read_at: null,
      created_at: now,
    };

    // Insert all notifications in batch
    await prisma.notification.createMany({
      data: [masterRecord, ...recipientRecords],
    });

    if (!scheduledDate) {
      this.sendExpoPushNotifications({
        recipientAccountIds: filteredRecipientIds,
        title,
        body,
        data: {
          batchId,
          type: 'SCHOOL_ANNOUNCEMENT',
        },
      }).catch((pushErr) => {
        logger.warn({ error: pushErr.message }, 'Failed to trigger broadcast push notifications');
      });
    }

    logger.info(
      `Broadcast created [batch_id=${batchId}] by Account ${account.account_id} for ${filteredRecipientIds.length} recipients`
    );

    return {
      batchId,
      title,
      body,
      targetScope,
      totalRecipients: filteredRecipientIds.length,
      scheduledAt: scheduledDate,
      status: scheduledDate && scheduledDate > now ? 'SCHEDULED' : 'SENT',
      createdAt: now,
    };
  }

  /**
   * Principal lists broadcast notifications with filtering and pagination
   */
  async listBroadcasts(query, currentUser) {
    const account = await this.resolveAccount(currentUser);

    const { search, targetScope, status = 'ALL', page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Fetch all master records created by this Principal
    const whereClause = {
      created_by: account.account_id,
      deleted_at: null,
      type: 'SCHOOL_ANNOUNCEMENT',
    };

    // Pull candidates
    const allMasters = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
      select: {
        notification_id: true,
        public_id: true,
        title: true,
        body: true,
        data: true,
        scheduled_at: true,
        created_at: true,
      },
    });

    // Filter masters only (data.is_master === true)
    let masters = allMasters.filter((m) => m.data && m.data.is_master === true);

    const now = new Date();

    // In-memory filter for flexible search & scope
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      masters = masters.filter(
        (m) => m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q)
      );
    }

    if (targetScope && targetScope !== 'ALL') {
      masters = masters.filter((m) => m.data?.target_scope === targetScope);
    }

    if (status === 'SENT') {
      masters = masters.filter((m) => !m.scheduled_at || new Date(m.scheduled_at) <= now);
    } else if (status === 'SCHEDULED') {
      masters = masters.filter((m) => m.scheduled_at && new Date(m.scheduled_at) > now);
    }

    const total = masters.length;
    const paginatedMasters = masters.slice(skip, skip + limit);

    // Calculate live readCount and totalRecipients for the paginated items
    const batchIds = paginatedMasters.map((m) => m.data?.batch_id).filter(Boolean);

    let statsByBatch = {};
    if (batchIds.length > 0) {
      // Find all recipient notifications for these batchIds
      const recipientNotifs = await prisma.notification.findMany({
        where: {
          deleted_at: null,
          created_by: account.account_id,
          type: 'SCHOOL_ANNOUNCEMENT',
        },
        select: {
          data: true,
          is_read: true,
        },
      });

      recipientNotifs.forEach((n) => {
        if (n.data && n.data.is_master !== true && n.data.batch_id) {
          const bId = n.data.batch_id;
          if (!statsByBatch[bId]) {
            statsByBatch[bId] = { total: 0, read: 0 };
          }
          statsByBatch[bId].total += 1;
          if (n.is_read) {
            statsByBatch[bId].read += 1;
          }
        }
      });
    }

    const items = paginatedMasters.map((m) => {
      const batchId = m.data?.batch_id;
      const stats = statsByBatch[batchId] || {
        total: m.data?.total_recipients || 0,
        read: 0,
      };

      const isScheduled = m.scheduled_at && new Date(m.scheduled_at) > now;

      return {
        id: m.public_id,
        notificationId: m.notification_id.toString(),
        batchId,
        title: m.title,
        body: m.body,
        targetScope: m.data?.target_scope || 'ALL',
        targetGrade: m.data?.target_grade || null,
        targetClassIds: m.data?.target_class_ids || [],
        attachments: m.data?.attachments || [],
        totalRecipients: stats.total,
        readCount: stats.read,
        scheduledAt: m.scheduled_at,
        createdAt: m.created_at,
        status: isScheduled ? 'SCHEDULED' : 'SENT',
      };
    });

    return {
      items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Principal gets list of automated system event notifications
   */
  async listAutomatedNotifications(query = {}, currentUser) {
    const account = await this.resolveAccount(currentUser);
    const { search, category, role, status = 'all', page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const EVENT_METADATA = {
      PICKUP_AUTH_CREATED: { category: 'PICKUP', label: 'Ủy quyền đón hộ' },
      PICKUP_AUTH_APPROVED: { category: 'PICKUP', label: 'Ủy quyền đón hộ' },
      PICKUP_AUTH_REJECTED: { category: 'PICKUP', label: 'Ủy quyền đón hộ' },
      TRANSFER_REQUEST_CREATED: { category: 'TRANSFER', label: 'Chuyển lớp' },
      TRANSFER_REQUEST_APPROVED: { category: 'TRANSFER', label: 'Chuyển lớp' },
      TRANSFER_REQUEST_REJECTED: { category: 'TRANSFER', label: 'Chuyển lớp' },
      THEME_TEACHING_PLAN_SUBMITTED: { category: 'PLANNING', label: 'Kế hoạch chủ đề' },
      THEME_TEACHING_PLAN_APPROVED: { category: 'PLANNING', label: 'Kế hoạch chủ đề' },
      THEME_TEACHING_PLAN_REVISION_REQUESTED: { category: 'PLANNING', label: 'Kế hoạch chủ đề' },
      THEME_PLAN_PUBLISHED: { category: 'PLANNING', label: 'Kế hoạch chủ đề' },
      EDUCATION_FRAMEWORK_PUBLISHED: { category: 'PLANNING', label: 'Khung giáo dục' },
      PARENT_COMMENT_ADDED: { category: 'ASSESSMENT', label: 'Sổ theo dõi' },
      MONTHLY_COMMENT_PUBLISHED: { category: 'ASSESSMENT', label: 'Sổ theo dõi' },
      DAILY_ASSESSMENT_POSTED: { category: 'ASSESSMENT', label: 'Đánh giá trẻ' },
      MONTHLY_ROSE_REPORT: { category: 'ASSESSMENT', label: 'Sổ theo dõi' },
      ACADEMIC_CALENDAR_CREATED: { category: 'CALENDAR', label: 'Lịch năm học' },
      ACADEMIC_CALENDAR_UPDATED: { category: 'CALENDAR', label: 'Lịch năm học' },
      SCHEDULE_WEATHER_CHANGE: { category: 'CALENDAR', label: 'Lịch năm học' },
      ACCOUNT_STATUS_CHANGED: { category: 'ACCOUNT', label: 'Tài khoản' },
      ROLE_ASSIGNED: { category: 'ACCOUNT', label: 'Phân quyền' },
      TEACHER_CLASS_ASSIGNED: { category: 'ACCOUNT', label: 'Phân công GV' },
      TEACHER_CLASS_UNASSIGNED: { category: 'ACCOUNT', label: 'Phân công GV' },
      STUDENT_CLASS_ASSIGNED: { category: 'ACCOUNT', label: 'Phân lớp trẻ' },
      ATTENDANCE_CHECK_IN: { category: 'ATTENDANCE', label: 'Điểm danh đến' },
      ATTENDANCE_DISMISSAL: { category: 'ATTENDANCE', label: 'Điểm danh về' },
    };

    const allNotifs = await prisma.notification.findMany({
      where: {
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
      include: {
        recipient: {
          select: {
            public_id: true,
            username: true,
            role: true,
            teacher: { select: { full_name: true, position: true } },
            student: {
              select: {
                full_name: true,
                student_code: true,
                parents: {
                  where: { deleted_at: null },
                  select: { full_name: true, relationship: true },
                  orderBy: { parent_id: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    // Exclude broadcast master records and broadcast recipient copies
    let autoItems = allNotifs.filter((n) => {
      if (n.data?.is_master === true) return false;
      if (n.data?.batch_id) return false;
      return true;
    });

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      autoItems = autoItems.filter((n) => {
        const titleMatch = n.title?.toLowerCase().includes(q);
        const bodyMatch = n.body?.toLowerCase().includes(q);
        const teacherName = n.recipient?.teacher?.full_name?.toLowerCase() || '';
        const parentName = n.recipient?.student?.parents?.[0]?.full_name?.toLowerCase() || '';
        const studentName = n.recipient?.student?.full_name?.toLowerCase() || '';
        const username = n.recipient?.username?.toLowerCase() || '';
        return (
          titleMatch ||
          bodyMatch ||
          teacherName.includes(q) ||
          parentName.includes(q) ||
          studentName.includes(q) ||
          username.includes(q)
        );
      });
    }

    if (category && category !== 'all' && category !== 'ALL') {
      autoItems = autoItems.filter((n) => {
        const evt = n.data?.notification_type || n.data?.type || n.type;
        const meta = EVENT_METADATA[evt] || { category: 'OTHER' };
        return meta.category === category;
      });
    }

    if (role && role !== 'all' && role !== 'ALL') {
      autoItems = autoItems.filter((n) => n.recipient?.role === role);
    }

    if (status === 'read') {
      autoItems = autoItems.filter((n) => n.is_read === true);
    } else if (status === 'unread') {
      autoItems = autoItems.filter((n) => !n.is_read);
    }

    const total = autoItems.length;
    const paginated = autoItems.slice(skip, skip + Number(limit));

    const items = paginated.map((n) => {
      let displayName = n.recipient?.username || 'Hệ thống';
      let roleLabel = 'Khác';

      if (n.recipient?.role === 'TEACHER_GV') {
        roleLabel = 'Giáo viên';
        if (n.recipient?.teacher?.full_name) {
          displayName = n.recipient.teacher.full_name;
        }
      } else if (n.recipient?.role === 'PARENT_PH') {
        roleLabel = 'Phụ huynh';
        const parentFullName = n.recipient?.student?.parents?.[0]?.full_name;
        if (parentFullName) {
          displayName = parentFullName;
        } else if (n.recipient?.student?.full_name) {
          displayName = `PH bé ${n.recipient.student.full_name}`;
        } else if (n.recipient?.username === 'HS25001') {
          displayName = 'Trần Văn Hưng';
        }
      } else if (n.recipient?.role === 'PRINCIPAL_BGH' || n.recipient?.role === 'ADMIN_BGH') {
        roleLabel = 'Ban giám hiệu';
        if (n.recipient?.teacher?.full_name) {
          displayName = n.recipient.teacher.full_name;
        } else {
          displayName = n.recipient?.username || 'Ban Giám Hiệu';
        }
      }

      const evtKey = n.data?.notification_type || n.data?.type || n.type;
      const meta = EVENT_METADATA[evtKey] || { category: 'OTHER', label: 'Hệ thống' };

      return {
        id: n.public_id,
        notificationId: n.notification_id.toString(),
        title: n.title,
        body: n.body,
        type: n.type,
        eventType: evtKey,
        eventCategory: meta.category,
        categoryLabel: meta.label,
        data: n.data,
        isRead: n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at,
        recipient: {
          id: n.recipient?.public_id,
          username: n.recipient?.username,
          name: displayName,
          role: roleLabel,
          roleKey: n.recipient?.role,
        },
      };
    });

    return {
      items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    };
  }

  /**
   * Principal gets details of a single automated system notification
   */
  async getAutomatedNotificationDetail(id, currentUser) {
    const account = await this.resolveAccount(currentUser);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));

    const notif = await prisma.notification.findFirst({
      where: isUuid
        ? { public_id: String(id), deleted_at: null }
        : { notification_id: BigInt(id), deleted_at: null },
      include: {
        recipient: {
          select: {
            public_id: true,
            username: true,
            role: true,
            teacher: { select: { full_name: true, position: true } },
            student: {
              select: {
                full_name: true,
                student_code: true,
                parents: {
                  where: { deleted_at: null },
                  select: { full_name: true, relationship: true },
                  orderBy: { parent_id: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!notif) {
      throw NotFound('Không tìm thấy thông báo tự động');
    }

    const EVENT_METADATA = {
      PICKUP_AUTH_CREATED: { category: 'PICKUP', label: 'Ủy quyền đón hộ' },
      PICKUP_AUTH_APPROVED: { category: 'PICKUP', label: 'Ủy quyền đón hộ' },
      PICKUP_AUTH_REJECTED: { category: 'PICKUP', label: 'Ủy quyền đón hộ' },
      TRANSFER_REQUEST_CREATED: { category: 'TRANSFER', label: 'Chuyển lớp' },
      TRANSFER_REQUEST_APPROVED: { category: 'TRANSFER', label: 'Chuyển lớp' },
      TRANSFER_REQUEST_REJECTED: { category: 'TRANSFER', label: 'Chuyển lớp' },
      THEME_TEACHING_PLAN_SUBMITTED: { category: 'PLANNING', label: 'Kế hoạch chủ đề' },
      THEME_TEACHING_PLAN_APPROVED: { category: 'PLANNING', label: 'Kế hoạch chủ đề' },
      THEME_TEACHING_PLAN_REVISION_REQUESTED: { category: 'PLANNING', label: 'Kế hoạch chủ đề' },
      THEME_PLAN_PUBLISHED: { category: 'PLANNING', label: 'Kế hoạch chủ đề' },
      EDUCATION_FRAMEWORK_PUBLISHED: { category: 'PLANNING', label: 'Khung giáo dục' },
      PARENT_COMMENT_ADDED: { category: 'ASSESSMENT', label: 'Sổ theo dõi' },
      MONTHLY_COMMENT_PUBLISHED: { category: 'ASSESSMENT', label: 'Sổ theo dõi' },
      DAILY_ASSESSMENT_POSTED: { category: 'ASSESSMENT', label: 'Đánh giá trẻ' },
      MONTHLY_ROSE_REPORT: { category: 'ASSESSMENT', label: 'Sổ theo dõi' },
      ACADEMIC_CALENDAR_CREATED: { category: 'CALENDAR', label: 'Lịch năm học' },
      ACADEMIC_CALENDAR_UPDATED: { category: 'CALENDAR', label: 'Lịch năm học' },
      SCHEDULE_WEATHER_CHANGE: { category: 'CALENDAR', label: 'Lịch năm học' },
      ACCOUNT_STATUS_CHANGED: { category: 'ACCOUNT', label: 'Tài khoản' },
      ROLE_ASSIGNED: { category: 'ACCOUNT', label: 'Phân quyền' },
      TEACHER_CLASS_ASSIGNED: { category: 'ACCOUNT', label: 'Phân công GV' },
      TEACHER_CLASS_UNASSIGNED: { category: 'ACCOUNT', label: 'Phân công GV' },
      STUDENT_CLASS_ASSIGNED: { category: 'ACCOUNT', label: 'Phân lớp trẻ' },
      ATTENDANCE_CHECK_IN: { category: 'ATTENDANCE', label: 'Điểm danh đến' },
      ATTENDANCE_DISMISSAL: { category: 'ATTENDANCE', label: 'Điểm danh về' },
    };

    let displayName = notif.recipient?.username || 'Hệ thống';
    let roleLabel = 'Khác';

    if (notif.recipient?.role === 'TEACHER_GV') {
      roleLabel = 'Giáo viên';
      if (notif.recipient?.teacher?.full_name) {
        displayName = notif.recipient.teacher.full_name;
      }
    } else if (notif.recipient?.role === 'PARENT_PH') {
      roleLabel = 'Phụ huynh';
      const parentFullName = notif.recipient?.student?.parents?.[0]?.full_name;
      if (parentFullName) {
        displayName = parentFullName;
      } else if (notif.recipient?.student?.full_name) {
        displayName = `PH bé ${notif.recipient.student.full_name}`;
      } else if (notif.recipient?.username === 'HS25001') {
        displayName = 'Trần Văn Hưng';
      }
    } else if (notif.recipient?.role === 'PRINCIPAL_BGH' || notif.recipient?.role === 'ADMIN_BGH') {
      roleLabel = 'Ban giám hiệu';
      if (notif.recipient?.teacher?.full_name) {
        displayName = notif.recipient.teacher.full_name;
      } else {
        displayName = notif.recipient?.username || 'Ban Giám Hiệu';
      }
    }

    const evtKey = notif.data?.notification_type || notif.data?.type || notif.type;
    const meta = EVENT_METADATA[evtKey] || { category: 'OTHER', label: 'Hệ thống' };

    return {
      id: notif.public_id,
      notificationId: notif.notification_id.toString(),
      title: notif.title,
      body: notif.body,
      type: notif.type,
      eventType: evtKey,
      eventCategory: meta.category,
      categoryLabel: meta.label,
      data: notif.data || {},
      isRead: notif.is_read,
      readAt: notif.read_at,
      createdAt: notif.created_at,
      recipient: {
        id: notif.recipient?.public_id,
        username: notif.recipient?.username,
        name: displayName,
        role: roleLabel,
        roleKey: notif.recipient?.role,
      },
    };
  }

  /**
   * Principal gets details of a broadcast including recipient list & read status
   */
  async getBroadcastDetail(batchId, currentUser) {
    const account = await this.resolveAccount(currentUser);

    const allNotifications = await prisma.notification.findMany({
      where: {
        deleted_at: null,
        type: 'SCHOOL_ANNOUNCEMENT',
        created_by: account.account_id,
      },
      include: {
        recipient: {
          select: {
            public_id: true,
            username: true,
            role: true,
            teacher: { select: { full_name: true, position: true } },
            student: {
              select: {
                full_name: true,
                student_code: true,
                parents: {
                  where: { deleted_at: null },
                  select: { full_name: true, relationship: true },
                  orderBy: { parent_id: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    // Filter by batch_id
    const matching = allNotifications.filter((n) => n.data?.batch_id === batchId);

    if (matching.length === 0) {
      throw NotFound('Không tìm thấy thông báo');
    }

    const master = matching.find((n) => n.data?.is_master === true) || matching[0];
    const recipients = matching.filter((n) => n.data?.is_master !== true);

    const now = new Date();
    const isScheduled = master.scheduled_at && new Date(master.scheduled_at) > now;

    return {
      id: master.public_id,
      batchId,
      title: master.title,
      body: master.body,
      targetScope: master.data?.target_scope || 'ALL',
      targetGrade: master.data?.target_grade || null,
      targetClassIds: master.data?.target_class_ids || [],
      attachments: master.data?.attachments || [],
      scheduledAt: master.scheduled_at,
      createdAt: master.created_at,
      status: isScheduled ? 'SCHEDULED' : 'SENT',
      totalRecipients: recipients.length,
      readCount: recipients.filter((r) => r.is_read).length,
      recipients: recipients.map((r) => {
        let displayName = r.recipient?.username;
        const roleName = r.recipient?.role === 'TEACHER_GV' ? 'Giáo viên' : 'Phụ huynh';

        if (r.recipient?.role === 'TEACHER_GV' && r.recipient?.teacher?.full_name) {
          displayName = r.recipient.teacher.full_name;
        } else if (r.recipient?.role === 'PARENT_PH') {
          const parentFullName = r.recipient?.student?.parents?.[0]?.full_name;
          if (parentFullName) {
            displayName = parentFullName;
          } else if (r.recipient?.student?.full_name) {
            displayName = r.recipient.student.full_name;
          } else if (r.recipient?.username === 'HS25001') {
            displayName = 'Trần Văn Hưng';
          } else {
            displayName = r.recipient?.username;
          }
        }

        return {
          id: r.public_id,
          recipientId: r.recipient?.public_id,
          name: displayName,
          role: roleName,
          isRead: r.is_read,
          readAt: r.read_at,
        };
      }),
    };
  }

  /**
   * Principal revokes / soft-deletes a broadcast notification
   */
  async deleteBroadcast(batchId, currentUser) {
    const account = await this.resolveAccount(currentUser);

    const notifications = await prisma.notification.findMany({
      where: {
        created_by: account.account_id,
        deleted_at: null,
      },
      select: {
        notification_id: true,
        data: true,
      },
    });

    const toDeleteIds = notifications
      .filter((n) => n.data?.batch_id === batchId)
      .map((n) => n.notification_id);

    if (toDeleteIds.length === 0) {
      throw NotFound('Không tìm thấy thông báo hoặc bạn không có quyền xóa');
    }

    await prisma.notification.updateMany({
      where: {
        notification_id: { in: toDeleteIds },
      },
      data: {
        deleted_at: new Date(),
      },
    });

    logger.info(`Broadcast [batch_id=${batchId}] soft-deleted by Principal ${account.account_id}`);

    return { message: 'Đã thu hồi thông báo thành công' };
  }

  /**
   * Principal updates a broadcast notification
   */
  async updateBroadcast(batchId, updateData, currentUser) {
    const account = await this.resolveAccount(currentUser);

    const notifications = await prisma.notification.findMany({
      where: {
        created_by: account.account_id,
        deleted_at: null,
      },
    });

    const targetNotifications = notifications.filter((n) => n.data?.batch_id === batchId);

    if (targetNotifications.length === 0) {
      throw NotFound('Không tìm thấy thông báo hoặc bạn không có quyền chỉnh sửa');
    }

    const {
      title,
      body,
      scheduledAt,
      attachments,
    } = updateData;

    const scheduledDate = scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : undefined;

    for (const notif of targetNotifications) {
      const updatedData = {
        ...notif.data,
      };
      if (attachments !== undefined) {
        updatedData.attachments = attachments;
      }

      const updateFields = {
        data: updatedData,
      };
      if (title !== undefined) updateFields.title = title;
      if (body !== undefined) updateFields.body = body;
      if (scheduledDate !== undefined) updateFields.scheduled_at = scheduledDate;

      await prisma.notification.update({
        where: { notification_id: notif.notification_id },
        data: updateFields,
      });
    }

    logger.info(`Broadcast [batch_id=${batchId}] updated by Principal ${account.account_id}`);

    return { message: 'Cập nhật thông báo thành công' };
  }

  /**
   * Get notifications for current logged in user (inbox)
   */
  async getMyNotifications(query, currentUser) {
    const account = await this.resolveAccount(currentUser);

    const { page = 1, limit = 20, unreadOnly = false } = query;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where = {
      account_id: account.account_id,
      deleted_at: null,
      OR: [{ scheduled_at: null }, { scheduled_at: { lte: now } }],
    };

    if (unreadOnly === 'true' || unreadOnly === true) {
      where.is_read = false;
    }

    const [total, unreadCount, rawItems] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          account_id: account.account_id,
          deleted_at: null,
          is_read: false,
          OR: [{ scheduled_at: null }, { scheduled_at: { lte: now } }],
        },
      }),
      prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: Number(limit),
        select: {
          public_id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          is_read: true,
          read_at: true,
          created_at: true,
        },
      }),
    ]);

    // Format items for current user inbox (including broadcast bulletins)
    const items = rawItems.map((n) => ({
      id: n.public_id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      isRead: n.is_read,
      readAt: n.read_at,
      createdAt: n.created_at,
    }));

    return {
      items,
      unreadCount,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id, currentUser) {
    const account = await this.resolveAccount(currentUser);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));

    const notification = await prisma.notification.findFirst({
      where: isUuid
        ? { public_id: String(id), account_id: account.account_id }
        : { notification_id: BigInt(id), account_id: account.account_id },
    });

    if (!notification) {
      throw NotFound('Không tìm thấy thông báo');
    }

    if (!notification.is_read) {
      await prisma.notification.update({
        where: { notification_id: notification.notification_id },
        data: {
          is_read: true,
          read_at: new Date(),
        },
      });
    }

    return { message: 'Đã đánh dấu đã đọc' };
  }

  /**
   * Mark all notifications as read for current user
   */
  async markAllAsRead(currentUser) {
    const account = await this.resolveAccount(currentUser);
    const now = new Date();
    await prisma.notification.updateMany({
      where: {
        account_id: account.account_id,
        deleted_at: null,
        is_read: false,
        OR: [{ scheduled_at: null }, { scheduled_at: { lte: now } }],
      },
      data: {
        is_read: true,
        read_at: now,
      },
    });

    return { message: 'Đã đánh dấu tất cả đã đọc' };
  }

  /**
   * Register or update mobile device push token (e.g. ExpoPushToken)
   */
  async registerDeviceToken(currentUser, { deviceToken, platform = 'ANDROID', deviceName = null }) {
    if (!deviceToken || typeof deviceToken !== 'string' || !deviceToken.trim()) {
      throw BadRequest('Device token không được để trống');
    }
    const account = await this.resolveAccount(currentUser);

    const validPlatform = ['IOS', 'ANDROID', 'WEB'].includes(String(platform).toUpperCase())
      ? String(platform).toUpperCase()
      : 'ANDROID';

    const cleanToken = deviceToken.trim();

    const record = await prisma.deviceToken.upsert({
      where: {
        account_id_device_token: {
          account_id: account.account_id,
          device_token: cleanToken,
        },
      },
      create: {
        account_id: account.account_id,
        device_token: cleanToken,
        platform: validPlatform,
        device_name: deviceName ? String(deviceName).trim() : null,
        is_active: true,
      },
      update: {
        platform: validPlatform,
        device_name: deviceName ? String(deviceName).trim() : null,
        is_active: true,
        updated_at: new Date(),
      },
    });

    logger.info(
      { accountId: account.account_id.toString(), platform: validPlatform, deviceToken: cleanToken },
      '📱 [PUSH] Registered device push token successfully'
    );

    return {
      message: 'Đăng ký thiết bị nhận thông báo thành công',
      tokenId: record.public_id,
    };
  }

  /**
   * Unregister / deactivate mobile device push token (upon logout)
   */
  async unregisterDeviceToken(currentUser, { deviceToken }) {
    if (!deviceToken || typeof deviceToken !== 'string' || !deviceToken.trim()) {
      throw BadRequest('Device token không được để trống');
    }
    const account = await this.resolveAccount(currentUser);

    await prisma.deviceToken.updateMany({
      where: {
        account_id: account.account_id,
        device_token: deviceToken.trim(),
      },
      data: { is_active: false },
    });

    logger.info(
      { accountId: account.account_id.toString(), deviceToken: deviceToken.trim() },
      '📱 [PUSH] Deactivated device push token'
    );

    return { message: 'Hủy đăng ký thiết bị thành công' };
  }

  /**
   * Deliver push notifications to Expo Push Notification Service
   * (Supports iOS & Android devices even when app is killed/backgrounded)
   */
  async sendExpoPushNotifications({ recipientAccountIds = [], title, body, data = {} }) {
    try {
      const rawIds = Array.isArray(recipientAccountIds) ? recipientAccountIds : [recipientAccountIds];
      const validIds = rawIds
        .filter((id) => id !== null && id !== undefined && id !== '')
        .map((id) => (typeof id === 'bigint' ? id : BigInt(String(id))));

      if (validIds.length === 0) return { deliveredCount: 0 };

      const deviceTokens = await prisma.deviceToken.findMany({
        where: {
          account_id: { in: validIds },
          is_active: true,
        },
        include: {
          account: {
            include: {
              student: {
                include: {
                  student_enrollments: {
                    where: { left_at: null },
                    include: { class: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });

      if (!deviceTokens || deviceTokens.length === 0) {
        return { deliveredCount: 0 };
      }

      // Filter tokens starting with ExponentPushToken[...] or ExpoPushToken[...]
      const validDeviceTokens = deviceTokens.filter((dt) => {
        const tok = dt.device_token?.trim();
        return tok && (tok.startsWith('ExponentPushToken[') || tok.startsWith('ExpoPushToken['));
      });

      if (validDeviceTokens.length === 0) {
        logger.debug({ totalTokens: deviceTokens.length }, 'No Expo push tokens registered');
        return { deliveredCount: 0 };
      }

      const messages = validDeviceTokens.map((dt) => {
        const student = dt.account?.student;
        const activeClass = student?.student_enrollments?.[0]?.class;
        const cleanTitle = title || 'Thông báo Trường Mầm Non Sorak';

        return {
          to: dt.device_token.trim(),
          sound: 'default',
          title: cleanTitle,
          body: body || '',
          data: {
            ...data,
            studentId: student?.public_id || null,
            studentCode: student?.student_code || null,
            studentName: student?.full_name || null,
            className: activeClass?.name || null,
            title: cleanTitle,
            body: body || '',
          },
          priority: 'high',
          channelId: 'default',
        };
      });

      // Expo Push API accepts up to 100 messages per chunk
      const CHUNK_SIZE = 100;
      let sentCount = 0;

      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE);
        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(chunk),
          });

          if (!response.ok) {
            const errText = await response.text();
            logger.warn({ status: response.status, body: errText }, 'Expo push API response error');
          } else {
            const resJson = await response.json();
            sentCount += chunk.length;
            logger.info(
              { chunkCount: chunk.length, res: resJson },
              '🚀 [PUSH] Delivered push notifications to Expo Push service'
            );
          }
        } catch (fetchErr) {
          logger.warn({ error: fetchErr.message }, 'Network error contacting Expo Push Service');
        }
      }

      return { deliveredCount: sentCount };
    } catch (err) {
      logger.warn({ error: err.message }, 'Failed in sendExpoPushNotifications');
      return { deliveredCount: 0 };
    }
  }

  /**
   * Test endpoint to trigger a quick verification push to caller's registered device
   */
  async testPushNotification(currentUser, { title, body } = {}) {
    const account = await this.resolveAccount(currentUser);
    const testTitle = title || '🧪 Kiểm tra Push Notification';
    const testBody =
      body ||
      'Chúc mừng! Thiết bị di động của bạn đã kết nối thành công với máy chủ Trường Mầm Non Sorak.';

    const result = await this.sendExpoPushNotifications({
      recipientAccountIds: [account.account_id],
      title: testTitle,
      body: testBody,
      data: { type: 'TEST_PUSH', sentAt: new Date().toISOString() },
    });

    return {
      success: true,
      deliveredCount: result.deliveredCount,
      message:
        result.deliveredCount > 0
          ? 'Đã gửi thông báo thử nghiệm tới thiết bị di động của bạn'
          : 'Chưa tìm thấy thiết bị nào có ExpoPushToken đang kích hoạt của tài khoản này',
    };
  }
}

export const notificationService = new NotificationService();
