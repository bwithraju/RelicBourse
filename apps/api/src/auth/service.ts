import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { withTransaction, usersRepo, seedNewUserData } from '../db/index.js';
import { AppError } from '../middleware/error.js';

const JWT_SECRET = process.env.JWT_SECRET || 'relicbourse_default_jwt_secret_never_use_in_prod';
const JWT_EXPIRES_IN = '24h';

export interface UserResponse {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthSuccessResult {
  user: UserResponse;
  token: string;
}

export class AuthService {
  /**
   * Register a new user:
   * 1. Hash password with bcryptjs
   * 2. In ONE transaction: create user + seed balance (₹1,00,000) & inventory (2 units per market)
   * 3. Return user info
   */
  public static async register(email: string, password: string): Promise<AuthSuccessResult> {
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const user = await withTransaction(async (client) => {
        const newUser = await usersRepo.createUser(client, {
          email,
          passwordHash,
        });
        await seedNewUserData(client, newUser.id);
        return newUser;
      });

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
        token,
      };
    } catch (err: any) {
      if (err.code === '23505' || err.message?.includes('duplicate key') || err.message?.includes('UNIQUE')) {
        throw new AppError('Email already in use', 409);
      }
      throw err;
    }
  }

  /**
   * Login user:
   * Verify password, return JWT (24h) + user info.
   * Unknown email and wrong password return the EXACT SAME generic error (security requirement).
   */
  public static async login(email: string, password: string): Promise<AuthSuccessResult> {
    const GENERIC_AUTH_ERROR = 'Invalid email or password';

    const user = await withTransaction(async (client) => {
      return await usersRepo.findByEmail(client, email);
    });

    if (!user) {
      throw new AppError(GENERIC_AUTH_ERROR, 401);
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new AppError(GENERIC_AUTH_ERROR, 401);
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      token,
    };
  }
}
