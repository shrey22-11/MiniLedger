import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function signToken(userId: string): string {
  return jwt.sign({}, config.JWT_SECRET, {
    subject: userId,
    expiresIn: '7d',
    algorithm: 'HS256',
    issuer: 'miniledger',
    audience: 'miniledger-app',
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Please log in again.' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'miniledger',
      audience: 'miniledger-app',
    });
    if (typeof payload === 'string' || !payload.sub) throw new Error('Invalid subject');
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Please log in again.' });
  }
};
