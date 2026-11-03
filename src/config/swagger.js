import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openApiSpecPath = path.join(__dirname, '../docs/openapi.yaml');

let swaggerDocument = {};
try {
  const fileContent = fs.readFileSync(openApiSpecPath, 'utf8');
  swaggerDocument = YAML.parse(fileContent);
} catch (error) {
  logger.error({ err: error }, 'Failed to load Swagger OpenAPI specification file');
}

/**
 * Cấu hình Swagger UI route vào Express app
 * @param {import('express').Express} app
 */
export function setupSwagger(app) {
  // Middleware cho phép inline scripts/styles đối với trang Swagger UI (tránh bị Helmet chặn)
  app.use('/docs', (req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    next();
  });

  const swaggerUiOptions = {
    customSiteTitle: 'Sorak API Documentation',
    customCss: '.swagger-ui .topbar { display: flex; }',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
  };

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerUiOptions));

  // Endpoint cung cấp raw JSON spec cho tooling hoặc Postman import
  app.get('/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocument);
  });

  logger.info('Swagger UI initialized at /docs and /docs.json');
}

