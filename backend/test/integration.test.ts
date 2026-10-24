import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { test } from 'node:test';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { businessToday, hashOtp } from '../src/domain.js';
import { signToken } from '../src/auth.js';

test('PostgreSQL API integration', async (t) => {
  assert.ok(
    new URL(config.DATABASE_URL).pathname.endsWith('_test'),
    'Use a dedicated DATABASE_URL ending in _test.',
  );
  await pool.query(await readFile(new URL('../migrations/001_init.sql', import.meta.url), 'utf8'));
  const owner = randomUUID();
  const other = randomUUID();
  const phone = '+919000001001';
  const otpPhone = '+919000001003';
  const token = signToken(owner);
  const otherToken = signToken(other);
  const auth = { Authorization: `Bearer ${token}` };
  const otherAuth = { Authorization: `Bearer ${otherToken}` };
  const today = businessToday(config.BUSINESS_TIMEZONE);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  let overdueId = '';
  let receiptId = '';
  const receiptFiles: string[] = [];
  try {
    await pool.query('INSERT INTO users(id, phone) VALUES($1,$2),($3,$4)', [
      owner,
      phone,
      other,
      '+919000001002',
    ]);
    await t.test('health connects to PostgreSQL', async () => {
      await request(app).get('/health').expect(200);
    });
    await t.test('protected endpoints reject missing or forged tokens', async () => {
      await request(app).get('/loans').expect(401);
      await request(app).get('/summary').set('Authorization', 'Bearer forged').expect(401);
    });
    await t.test('empty ledger totals are all zero', async () => {
      const response = await request(app).get('/summary').set(auth).expect(200);
      assert.equal(response.body.totalLentPaise, 0);
      assert.equal(response.body.totalRepaidPaise, 0);
      assert.equal(response.body.overduePaise, 0);
    });
    await t.test('input validation rejects impossible dates and invalid money', async () => {
      for (const body of [
        { friendName: 'Aditi', amount: '0', dueDate: today },
        { friendName: 'Aditi', amount: '100', dueDate: '2026-02-30' },
        { friendName: ' ', amount: '100', dueDate: today },
      ])
        await request(app).post('/loans').set(auth).send(body).expect(400);
    });
    await t.test('create overdue and due-today entries with exact amounts', async () => {
      const old = await request(app)
        .post('/loans')
        .set(auth)
        .send({
          friendName: 'Aditi',
          amount: '1500.50',
          dueDate: yesterday.toISOString().slice(0, 10),
        })
        .expect(201);
      overdueId = old.body.entry.id;
      assert.equal(old.body.entry.amountPaise, 150050);
      assert.equal(old.body.entry.overdue, true);
      const due = await request(app)
        .post('/loans')
        .set(auth)
        .send({ friendName: 'Rahul', amount: '500', dueDate: today })
        .expect(201);
      assert.equal(due.body.entry.overdue, false);
    });
    await t.test('summary calculates lent, repaid, outstanding and overdue', async () => {
      const { body } = await request(app).get('/summary').set(auth).expect(200);
      assert.equal(body.totalLentPaise, 200050);
      assert.equal(body.totalRepaidPaise, 0);
      assert.equal(body.outstandingPaise, 200050);
      assert.equal(body.overduePaise, 150050);
    });
    await t.test('another account cannot read or modify entries', async () => {
      const list = await request(app).get('/loans').set(otherAuth).expect(200);
      assert.deepEqual(list.body.entries, []);
      await request(app).patch(`/loans/${overdueId}/repay`).set(otherAuth).expect(404);
      await request(app).get(`/loans/${overdueId}/receipt`).set(otherAuth).expect(404);
      const totals = await request(app).get('/summary').set(otherAuth).expect(200);
      assert.equal(totals.body.totalLentPaise, 0);
    });
    await t.test('repayment is idempotent and removes overdue amount', async () => {
      const first = await request(app).patch(`/loans/${overdueId}/repay`).set(auth).expect(200);
      const retry = await request(app).patch(`/loans/${overdueId}/repay`).set(auth).expect(200);
      assert.equal(first.body.entry.repaidAt, retry.body.entry.repaidAt);
      assert.equal(retry.body.entry.overdue, false);
      const { body } = await request(app).get('/summary').set(auth).expect(200);
      assert.equal(body.totalLentPaise, 200050);
      assert.equal(body.totalRepaidPaise, 150050);
      assert.equal(body.overduePaise, 0);
      assert.equal(body.outstandingPaise, 50000);
    });
    await t.test('receipts are stored privately and checked by file signature', async () => {
      await request(app)
        .post('/loans')
        .set(auth)
        .field('friendName', 'Bad file')
        .field('amount', '1')
        .field('dueDate', today)
        .attach('receipt', Buffer.from('not an image'), 'fake.jpg')
        .expect(400);
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=',
        'base64',
      );
      const saved = await request(app)
        .post('/loans')
        .set(auth)
        .field('friendName', 'Receipt friend')
        .field('amount', '2.25')
        .field('dueDate', today)
        .attach('receipt', png, 'receipt.png')
        .expect(201);
      receiptId = saved.body.entry.id;
      assert.equal(saved.body.entry.hasReceipt, true);
      const file = await pool.query('SELECT receipt_path FROM loans WHERE id = $1', [receiptId]);
      receiptFiles.push(file.rows[0].receipt_path);
      await request(app).get(`/loans/${receiptId}/receipt`).expect(401);
      await request(app).get(`/loans/${receiptId}/receipt`).set(otherAuth).expect(404);
      await request(app)
        .get(`/loans/${receiptId}/receipt`)
        .set(auth)
        .expect('Content-Type', /image\/png/)
        .expect(200);
      await request(app)
        .post('/loans')
        .set(auth)
        .field('friendName', 'Large file')
        .field('amount', '1')
        .field('dueDate', today)
        .attach('receipt', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
        .expect(400);
    });
    await t.test('malformed ids and unknown routes return JSON errors', async () => {
      await request(app).patch('/loans/invalid/repay').set(auth).expect(400);
      await request(app).get('/does-not-exist').expect(404).expect('Content-Type', /json/);
    });
    await t.test('mock OTP is logged, rate-limited per phone, and consumed once', async () => {
      let code = '';
      const log = console.log;
      console.log = (...args) => {
        const match = String(args[0]).match(/\[MOCK OTP\].*: (\d{6})/);
        if (match) code = match[1]!;
        else log(...args);
      };
      try {
        const sent = await request(app)
          .post('/auth/request-otp')
          .send({ phone: otpPhone })
          .expect(200);
        assert.equal(sent.body.otp, undefined);
      } finally {
        console.log = log;
      }
      assert.match(code, /^\d{6}$/);
      await request(app).post('/auth/request-otp').send({ phone: otpPhone }).expect(429);
      const wrong = code === '111111' ? '222222' : '111111';
      await request(app).post('/auth/verify-otp').send({ phone: otpPhone, otp: wrong }).expect(401);
      const login = await request(app)
        .post('/auth/verify-otp')
        .send({ phone: otpPhone, otp: code })
        .expect(200);
      assert.ok(login.body.token);
      await request(app).get('/me').set('Authorization', `Bearer ${login.body.token}`).expect(200);
      await request(app).post('/auth/verify-otp').send({ phone: otpPhone, otp: code }).expect(401);
    });
    await t.test('expired and five-failure OTPs are rejected', async () => {
      const hash = hashOtp(otpPhone, '123456', config.JWT_SECRET);
      await pool.query(
        `INSERT INTO otp_challenges(phone, code_hash, expires_at) VALUES($1,$2,NOW() - INTERVAL '1 second')`,
        [otpPhone, hash],
      );
      await request(app)
        .post('/auth/verify-otp')
        .send({ phone: otpPhone, otp: '123456' })
        .expect(401);
      await pool.query(
        "UPDATE otp_challenges SET expires_at = NOW() + INTERVAL '5 minutes', attempts = 0 WHERE phone = $1",
        [otpPhone],
      );
      for (let i = 0; i < 5; i++)
        await request(app)
          .post('/auth/verify-otp')
          .send({ phone: otpPhone, otp: '654321' })
          .expect(401);
      await request(app)
        .post('/auth/verify-otp')
        .send({ phone: otpPhone, otp: '123456' })
        .expect(401);
    });
  } finally {
    await pool.query('DELETE FROM otp_challenges WHERE phone = $1', [otpPhone]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[]) OR phone = $2', [
      [owner, other],
      otpPhone,
    ]);
    for (const file of receiptFiles)
      await unlink(new URL(`../uploads/${file}`, import.meta.url)).catch(() => {});
    await pool.end();
  }
});
