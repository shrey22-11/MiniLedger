import { createHmac } from 'node:crypto';
import { z } from 'zod';

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use country code, e.g. +919876543210');
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= '2000-01-01' &&
      value <= '2100-12-31'
    );
  }, 'Enter a real date between 2000 and 2100');

// Receive decimal money as a string, then convert using integer arithmetic.
export const amountSchema = z
  .string()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, 'Use a positive amount with at most 2 decimal places')
  .transform((value) => {
    const [rupees = '0', paise = ''] = value.split('.');
    return Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
  })
  .pipe(
    z
      .number()
      .int()
      .min(1, 'Amount must be greater than zero')
      .max(100000000, 'Maximum amount is ₹10,00,000'),
  );

export const loanSchema = z.object({
  friendName: z.string().trim().min(1, 'Friend name is required').max(80),
  amount: amountSchema,
  dueDate: dateSchema,
});

export function businessToday(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function hashOtp(phone: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

export function isOverdue(dueDate: string, repaidAt: string | null, today: string): boolean {
  return repaidAt === null && dueDate < today;
}
