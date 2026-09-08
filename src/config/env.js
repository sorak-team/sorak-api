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

  jwt: {
    accessSecret: value.JWT_ACCESS_SECRET,
    refreshSecret: value.JWT_REFRESH_SECRET,
    accessTtl: value.JWT_ACCESS_TTL,
    refreshTtl: value.JWT_REFRESH_TTL,
  },
};