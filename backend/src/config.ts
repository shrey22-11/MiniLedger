import 'dotenv/config';
import { z } from 'zod';

const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    CORS_ORIGINS: z.string().default('http://localhost:8081'),
    BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),
  })
  .parse(process.env);

// Fail early if the timezone is misspelled.
new Intl.DateTimeFormat('en-CA', { timeZone: env.BUSINESS_TIMEZONE }).format();
export const config = env;
