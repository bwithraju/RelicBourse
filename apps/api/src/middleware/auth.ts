import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'relicbourse_default_jwt_secret_never_use_in_prod';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

interface JwtPayloadWithUser {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadWithUser;
    if (!decoded || !decoded.userId) {
      res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
      return;
    }
    req.userId = decoded.userId;
    next();
  } catch (_err) {
    res.status(401).json({ error: 'Unauthorized: Token verification failed' });
  }
}
