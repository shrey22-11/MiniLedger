import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z, ZodError } from 'zod';
import { pool } from './db.js';
import { config } from './config.js';
import { requireAuth, signToken } from './auth.js';
import { businessToday, hashOtp, isOverdue, loanSchema, phoneSchema } from './domain.js';

const uploads = path.resolve('uploads');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3 },
});
const idSchema = z.uuid();
const selectLoan = `id, friend_name AS "friendName", amount_paise::float8 AS "amountPaise",
  to_char(due_date, 'YYYY-MM-DD') AS "dueDate", repaid_at AS "repaidAt",
  created_at AS "createdAt", (receipt_path IS NOT NULL) AS "hasReceipt"`;

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGINS.split(',').map((origin) => origin.trim()) }));
app.use(express.json({ limit: '16kb' }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute.' },
  }),
);

app.get('/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

const authLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});
app.use('/auth', authLimit);

app.post('/auth/request-otp', async (req, res) => {
  const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
  const code = String(randomInt(100000, 1000000));
  // A conditional upsert also enforces the cooldown under simultaneous requests.
  const result = await pool.query(
    `INSERT INTO otp_challenges(phone, code_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
    ON CONFLICT(phone) DO UPDATE SET code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at, attempts = 0, requested_at = NOW()
    WHERE otp_challenges.requested_at <= NOW() - INTERVAL '30 seconds'
    RETURNING phone`,
    [phone, hashOtp(phone, code, config.JWT_SECRET)],
  );
  if (!result.rowCount) {
    res.status(429).json({ error: 'Wait 30 seconds before requesting another OTP.' });
    return;
  }
  console.log(`[MOCK OTP] ${phone}: ${code} (expires in 5 minutes)`);
  res.json({
    message: 'Mock OTP printed in the backend terminal.',
    expiresInSeconds: 300,
    retryAfterSeconds: 30,
  });
});

app.post('/auth/verify-otp', async (req, res) => {
  const { phone, otp } = z
    .object({ phone: phoneSchema, otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP') })
    .parse(req.body);
  const client = await pool.connect();
  let userId: string | undefined;
  try {
    await client.query('BEGIN');
    // Row lock prevents two requests from consuming the same OTP.
    const result = await client.query(
      'SELECT *, expires_at > NOW() AS valid FROM otp_challenges WHERE phone = $1 FOR UPDATE',
      [phone],
    );
    const challenge = result.rows[0];
    if (challenge?.valid && challenge.attempts < 5) {
      const expected = Buffer.from(challenge.code_hash, 'hex');
      const actual = Buffer.from(hashOtp(phone, otp, config.JWT_SECRET), 'hex');
      if (timingSafeEqual(expected, actual)) {
        const user = await client.query(
          `INSERT INTO users(id, phone) VALUES ($1, $2)
          ON CONFLICT(phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id`,
          [randomUUID(), phone],
        );
        userId = user.rows[0].id;
        await client.query('DELETE FROM otp_challenges WHERE phone = $1', [phone]);
      } else {
        await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE phone = $1', [
          phone,
        ]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (!userId) {
    res.status(401).json({ error: 'Invalid, expired, or locked OTP. Request a new code.' });
    return;
  }
  res.json({ token: signToken(userId), user: { id: userId, phone } });
});

app.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT id, phone FROM users WHERE id = $1', [req.userId]);
  if (!result.rowCount) {
    res.status(401).json({ error: 'Account not found. Please log in again.' });
    return;
  }
  res.json({ user: result.rows[0] });
});

app.get('/loans', requireAuth, async (req, res) => {
  const today = businessToday(config.BUSINESS_TIMEZONE);
  const result = await pool.query(
    `SELECT ${selectLoan} FROM loans WHERE user_id = $1
    ORDER BY (repaid_at IS NOT NULL), due_date ASC, created_at DESC`,
    [req.userId],
  );
  res.json({
    today,
    timezone: config.BUSINESS_TIMEZONE,
    entries: result.rows.map((loan) => ({
      ...loan,
      overdue: isOverdue(loan.dueDate, loan.repaidAt, today),
    })),
  });
});

app.post('/loans', requireAuth, upload.single('receipt'), async (req, res) => {
  const input = loanSchema.parse(req.body);
  let receiptPath: string | null = null;
  if (req.file) {
    const bytes = req.file.buffer;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!isJpeg && !isPng) {
      res.status(400).json({ error: 'Receipt must be a JPEG or PNG image, up to 5 MB.' });
      return;
    }
    await mkdir(uploads, { recursive: true });
    receiptPath = `${randomUUID()}.${isJpeg ? 'jpg' : 'png'}`;
    await writeFile(path.join(uploads, receiptPath), bytes);
  }
  try {
    const result = await pool.query(
      `INSERT INTO loans(id, user_id, friend_name, amount_paise, due_date, receipt_path)
      VALUES($1, $2, $3, $4, $5, $6) RETURNING ${selectLoan}`,
      [randomUUID(), req.userId, input.friendName, input.amount, input.dueDate, receiptPath],
    );
    const loan = result.rows[0];
    res.status(201).json({
      entry: {
        ...loan,
        overdue: isOverdue(loan.dueDate, loan.repaidAt, businessToday(config.BUSINESS_TIMEZONE)),
      },
    });
  } catch (error) {
    if (receiptPath) await unlink(path.join(uploads, receiptPath)).catch(() => {});
    throw error;
  }
});

app.patch('/loans/:id/repay', requireAuth, async (req, res) => {
  const id = idSchema.parse(req.params.id);
  // COALESCE keeps the original timestamp when a request is retried.
  const result = await pool.query(
    `UPDATE loans SET repaid_at = COALESCE(repaid_at, NOW())
    WHERE id = $1 AND user_id = $2 RETURNING ${selectLoan}`,
    [id, req.userId],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: 'Entry not found.' });
    return;
  }
  res.json({ entry: { ...result.rows[0], overdue: false } });
});

app.get('/loans/:id/receipt', requireAuth, async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const result = await pool.query('SELECT receipt_path FROM loans WHERE id = $1 AND user_id = $2', [
    id,
    req.userId,
  ]);
  const file = result.rows[0]?.receipt_path;
  if (!file) {
    res.status(404).json({ error: 'Receipt not found.' });
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file, { root: uploads });
});

app.get('/summary', requireAuth, async (req, res) => {
  const today = businessToday(config.BUSINESS_TIMEZONE);
  const result = await pool.query(
    `SELECT
    COALESCE(SUM(amount_paise), 0)::float8 AS "totalLentPaise",
    COALESCE(SUM(amount_paise) FILTER (WHERE repaid_at IS NOT NULL), 0)::float8 AS "totalRepaidPaise",
    COALESCE(SUM(amount_paise) FILTER (WHERE repaid_at IS NULL), 0)::float8 AS "outstandingPaise",
    COALESCE(SUM(amount_paise) FILTER (WHERE repaid_at IS NULL AND due_date < $2::date), 0)::float8 AS "overduePaise",
    COUNT(*)::int AS "entryCount"
    FROM loans WHERE user_id = $1`,
    [req.userId, today],
  );
  res.json({ ...result.rows[0], currency: 'INR', today, timezone: config.BUSINESS_TIMEZONE });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});
const errorHandler: express.ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ error: error.issues[0]?.message ?? 'Invalid input.', issues: error.issues });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Receipt must be 5 MB or smaller.'
          : 'Invalid receipt upload.',
    });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }
  if (error.status === 413) {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }
  if (error.status === 404) {
    res.status(404).json({ error: 'Receipt file not found.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
app.use(errorHandler);
