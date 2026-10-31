import Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),

  DATABASE_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  TURNSTILE_SECRET_KEY: Joi.string().allow('', null).optional(),
  RESEND_API_KEY: Joi.string().allow('', null).optional(),
  EMAIL_FROM: Joi.string().default('Trường Mầm Non Hòn Tre <noreply@mamnonhontre.sorak.io.vn>'),

  // MinIO S3 Object Storage
  MINIO_ENDPOINT: Joi.string().allow('', null).optional(),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().allow('', null).optional(),
  MINIO_SECRET_KEY: Joi.string().allow('', null).optional(),
  MINIO_BUCKET_NAME: Joi.string().default('sorak-media'),
  MINIO_PUBLIC_URL: Joi.string().allow('', null).optional(),
}).unknown(true);

const { value, error } = schema.validate(process.env, { abortEarly: false });
if (error) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment:', error.message);
  process.exit(1);
}

export const env = {
  nodeEnv: value.NODE_ENV,
  port: Number(value.PORT),
  isProd: value.NODE_ENV === 'production',
  corsOrigins: value.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  databaseUrl: value.DATABASE_URL,
  turnstileSecret: value.TURNSTILE_SECRET_KEY || '',
  resendApiKey: value.RESEND_API_KEY || '',
  emailFrom: value.EMAIL_FROM || 'Trường Mầm Non Hòn Tre <noreply@mamnonhontre.sorak.io.vn>',

  minio: {
    endpoint: value.MINIO_ENDPOINT || '',
    port: Number(value.MINIO_PORT || 9000),
    useSSL: String(value.MINIO_USE_SSL) === 'true',
    accessKey: value.MINIO_ACCESS_KEY || '',
    secretKey: value.MINIO_SECRET_KEY || '',
    bucket: value.MINIO_BUCKET_NAME || 'sorak-media',
    publicUrl: value.MINIO_PUBLIC_URL || '',
  },

  jwt: {
    accessSecret: value.JWT_ACCESS_SECRET,
    refreshSecret: value.JWT_REFRESH_SECRET,
    accessTtl: value.JWT_ACCESS_TTL,
    refreshTtl: value.JWT_REFRESH_TTL,
  },
};
