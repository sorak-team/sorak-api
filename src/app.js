import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import logger from './utils/logger.js';
import { requestId } from './middlewares/request-id.js';
import { responseWrapper } from './middlewares/response-wrapper.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import apiRouter from './routes/index.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.traceId,
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${req.url} ${res.statusCode} ${err.message}`,
      serializers: {
        req: () => undefined,
        res: () => undefined,
      },
    }),
  );

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(responseWrapper);

  app.get('/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
