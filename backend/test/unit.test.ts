import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  amountSchema,
  businessToday,
  dateSchema,
  hashOtp,
  isOverdue,
  loanSchema,
  phoneSchema,
} from '../src/domain.js';

test('decimal amounts convert exactly to integer paise', () => {
  assert.equal(amountSchema.parse('0.01'), 1);
  assert.equal(amountSchema.parse('1250.50'), 125050);
  assert.equal(amountSchema.parse('12.3'), 1230);
  assert.equal(amountSchema.parse('1000000'), 100000000);
});
test('invalid amounts are rejected instead of rounded', () => {
  for (const value of ['0', '-1', '1.001', '1e3', 'NaN', '1000000.01', '', ' 20'])
    assert.equal(amountSchema.safeParse(value).success, false, value);
});
test('calendar validation handles leap years and impossible dates', () => {
  assert.equal(dateSchema.safeParse('2028-02-29').success, true);
  for (const date of [
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-1-01',
    '1999-12-31',
    '2101-01-01',
  ])
    assert.equal(dateSchema.safeParse(date).success, false, date);
});
test('due today is not overdue; repaid loans are never overdue', () => {
  assert.equal(isOverdue('2026-10-23', null, '2026-10-24'), true);
  assert.equal(isOverdue('2026-10-24', null, '2026-10-24'), false);
  assert.equal(isOverdue('2026-10-25', null, '2026-10-24'), false);
  assert.equal(isOverdue('2026-10-01', '2026-10-02T10:00:00Z', '2026-10-24'), false);
});
test('business date uses the configured timezone across midnight', () => {
  const now = new Date('2026-10-24T19:00:00Z');
  assert.equal(businessToday('Asia/Kolkata', now), '2026-10-25');
  assert.equal(businessToday('UTC', now), '2026-10-24');
});
test('phone requires a country code and normalizes outside whitespace', () => {
  assert.equal(phoneSchema.parse(' +919876543210 '), '+919876543210');
  for (const value of ['9876543210', '+0123456789', '+91 9876543210', '+12'])
    assert.equal(phoneSchema.safeParse(value).success, false);
});
test('loan trims names and rejects blank or overlong names', () => {
  assert.equal(
    loanSchema.parse({ friendName: '  Aditi  ', amount: '500', dueDate: '2026-10-24' }).friendName,
    'Aditi',
  );
  for (const friendName of ['  ', 'a'.repeat(81)])
    assert.equal(
      loanSchema.safeParse({ friendName, amount: '500', dueDate: '2026-10-24' }).success,
      false,
    );
});
test('OTP hash binds both phone and code to the server secret', () => {
  const hash = hashOtp('+919876543210', '123456', 'secret');
  assert.equal(hash.length, 64);
  assert.equal(hash, hashOtp('+919876543210', '123456', 'secret'));
  assert.notEqual(hash, hashOtp('+919876543211', '123456', 'secret'));
  assert.notEqual(hash, hashOtp('+919876543210', '654321', 'secret'));
  assert.notEqual(hash, hashOtp('+919876543210', '123456', 'different'));
});
