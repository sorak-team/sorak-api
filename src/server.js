import { createApp } from './app.js';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import prisma from './config/prisma.js';
import { initJobs } from './jobs/index.js';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`🚀 Sorak API (Express) running at http://localhost:${env.port}`);
});

const cronTasks = initJobs();

const shutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down...`);
  if (cronTasks && typeof cronTasks.stop === 'function') {
    cronTasks.stop();
  }
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Ready
