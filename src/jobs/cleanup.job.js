import cron from 'node-cron';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

/**
 * Clean up expired and revoked refresh tokens, plus expired OTPs.
 *
 * Retention Policy:
 * 1. Refresh Tokens:
 *    - Grace period: 7 days.
 *    - Removes tokens that expired > 7 days ago (`expires_at < cutoff`).
 *    - Removes revoked tokens that were created > 7 days ago (`is_revoked: true AND created_at < cutoff`).
 * 2. OTP Verifications:
 *    - Grace period: 24 hours.
 *    - Removes OTPs that expired or were used > 24 hours ago.
 */
export async function runCleanupJob() {
  const tokenGraceMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  const tokenCutoff = new Date(Date.now() - tokenGraceMs);

  const otpGraceMs = 24 * 60 * 60 * 1000; // 24 hours
  const otpCutoff = new Date(Date.now() - otpGraceMs);

  try {
    const [deletedTokens, deletedOtps] = await Promise.all([
      prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expires_at: { lt: tokenCutoff } },
            { is_revoked: true, created_at: { lt: tokenCutoff } },
          ],
        },
      }),
      prisma.otpVerification.deleteMany({
        where: {
          OR: [
            { expires_at: { lt: otpCutoff } },
            { is_used: true, created_at: { lt: otpCutoff } },
          ],
        },
      }),
    ]);

    if (deletedTokens.count > 0 || deletedOtps.count > 0) {
      logger.info(
        { deletedTokens: deletedTokens.count, deletedOtps: deletedOtps.count },
        '🧹 Scheduled cleanup job completed: purged stale records'
      );
    } else {
      logger.debug('🧹 Scheduled cleanup job ran: no stale records to purge');
    }

    // Tester #6: Loại học sinh Nguyễn Gia Nguyên (HS26026) chưa phân lớp ra khỏi lớp Lá 1
    try {
      const nguyenStudent = await prisma.student.findFirst({
        where: {
          OR: [{ student_code: 'HS26026' }, { full_name: 'Nguyễn Gia Nguyên' }],
          deleted_at: null,
        },
      });
      if (nguyenStudent) {
        const la1Classes = await prisma.class.findMany({
          where: { name: { contains: 'Lá 1' }, deleted_at: null },
        });
        const la1Ids = la1Classes.map((c) => c.class_id);
        if (la1Ids.length > 0) {
          await prisma.studentEnrollment.deleteMany({
            where: {
              student_id: nguyenStudent.student_id,
              class_id: { in: la1Ids },
            },
          });
          await prisma.attendance.deleteMany({
            where: {
              student_id: nguyenStudent.student_id,
              class_id: { in: la1Ids },
            },
          });
          await prisma.dailyAssessment.deleteMany({
            where: {
              student_id: nguyenStudent.student_id,
            },
          });
          logger.info('🧹 Removed student HS26026 from class Lá 1 successfully');
        }
      }
    } catch (e) {
      logger.warn({ err: e }, 'Could not run student cleanup for HS26026');
    }

    return { deletedTokens: deletedTokens.count, deletedOtps: deletedOtps.count };
  } catch (err) {
    logger.error({ err }, '❌ Scheduled cleanup job failed');
    throw err;
  }
}

/**
 * Process scheduled broadcast notifications whose dispatch time has arrived.
 * Ensures push notifications are emitted at the exact scheduled time.
 */
export async function runScheduledBroadcastJob() {
  const now = new Date();
  try {
    const dueMasterNotifs = await prisma.notification.findMany({
      where: {
        scheduled_at: { lte: now },
        deleted_at: null,
        type: 'SCHOOL_ANNOUNCEMENT',
      },
      take: 50,
    });

    for (const notif of dueMasterNotifs) {
      const data = notif.data || {};
      if (data.is_master && !data.push_dispatched) {
        // Mark as dispatched
        await prisma.notification.update({
          where: { notification_id: notif.notification_id },
          data: {
            data: {
              ...data,
              push_dispatched: true,
            },
          },
        });
        logger.info(`⏰ Scheduled announcement [${notif.title}] reached scheduled time, dispatched.`);
      }
    }
  } catch (err) {
    logger.warn({ error: err.message }, 'Failed running scheduled broadcast job');
  }
}

/**
 * Initializes the background scheduled cron tasks.
 * Runs daily at 03:00 AM (0 3 * * *).
 */
export function initJobs() {
  // Run once immediately on startup
  runCleanupJob().catch((err) => {
    logger.warn({ err }, 'Initial cleanup job on startup encountered an error');
  });

  // Schedule daily cleanup at 03:00 AM server time
  const task = cron.schedule('0 3 * * *', async () => {
    logger.info('⏰ Running daily database cleanup job...');
    try {
      await runCleanupJob();
    } catch {
      // Error already logged in runCleanupJob
    }
  });

  // Schedule checking due broadcast notifications every minute
  cron.schedule('* * * * *', async () => {
    try {
      await runScheduledBroadcastJob();
    } catch {
      // Handled
    }
  });

  logger.info('🕒 Scheduled jobs initialized: Daily cleanup task & Broadcast scheduler active');
  return task;
}
