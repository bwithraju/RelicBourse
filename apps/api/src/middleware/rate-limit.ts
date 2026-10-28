import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { rateLimitConfig } from '../config/rate-limit.config.js';

interface RateRecord {
  count: number;
  resetAt: number;
}

const userOrderRequests = new Map<string, RateRecord>();
const authIpRequests = new Map<string, RateRecord>();

export function authRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Never throttle in unit tests
  if (process.env.VITEST) {
    next();
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxAuthAttempts = 20;

  let record = authIpRequests.get(ip);
  if (!record || now > record.resetAt) {
    record = {
      count: 1,
      resetAt: now + windowMs,
    };
    authIpRequests.set(ip, record);
    next();
    return;
  }

  record.count += 1;
  if (record.count > maxAuthAttempts) {
    res.status(429).json({
      error: 'Rate limit exceeded: too many authentication requests. Please try again later.',
      retryAfterMs: Math.max(0, record.resetAt - now),
    });
    return;
  }

  next();
}

export function orderRateLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const userId = req.userId;
  if (!userId) {
    // If route isn't authenticated yet, allow or let authMiddleware handle
    next();
    return;
  }

  const now = Date.now();
  let record = userOrderRequests.get(userId);

  if (!record || now > record.resetAt) {
    record = {
      count: 1,
      resetAt: now + rateLimitConfig.windowMs,
    };
    userOrderRequests.set(userId, record);
    next();
    return;
  }

  record.count += 1;
  if (record.count > rateLimitConfig.maxOrdersPerWindow) {
    res.status(429).json({
      error: 'Rate limit exceeded: too many order requests. Please slow down.',
      retryAfterMs: Math.max(0, record.resetAt - now),
    });
    return;
  }

  next();
}

export function clearRateLimits(): void {
  userOrderRequests.clear();
  authIpRequests.clear();
}
