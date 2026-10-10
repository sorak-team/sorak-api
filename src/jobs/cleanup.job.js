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

    return { deletedTokens: deletedTokens.count, deletedOtps: deletedOtps.count };
  } catch (err) {
    logger.error({ err }, '❌ Scheduled cleanup job failed');
    throw err;
  }
}

/**
 * Initializes the background scheduled cron tasks.
 * Runs daily at 03:00 AM (0 3 * * *).
 */
export function initJobs() {
  // Schedule daily cleanup at 03:00 AM server time
  const task = cron.schedule('0 3 * * *', async () => {
    logger.info('⏰ Running daily database cleanup job...');
    try {
      await runCleanupJob();
    } catch {
      // Error already logged in runCleanupJob
    }
  });

  logger.info('🕒 Scheduled jobs initialized: Daily cleanup task scheduled (03:00 AM)');
  return task;
}
