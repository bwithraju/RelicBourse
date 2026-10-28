import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from './service.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/index.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { usersRepo, withTransaction } from '../db/index.js';
import { AppError } from '../middleware/error.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await AuthService.register(email, password);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

authRouter.get(
  '/me',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const user = await withTransaction(async (client) => {
        return await usersRepo.findById(client, userId);
      });
      if (!user) {
        throw new AppError('User not found', 404);
      }
      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
