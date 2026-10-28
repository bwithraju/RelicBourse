import { DbClient, UsersRepository, PasswordResetRecord } from '../contract.js';
import { User } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgUsersRepo: UsersRepository = {
  async createUser(client: DbClient, params: { email: string; passwordHash: string }): Promise<User> {
    const runner = getRunner(client);
    try {
      const res = await runner.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, password_hash AS "passwordHash", created_at AS "createdAt";`,
        [params.email.toLowerCase(), params.passwordHash]
      );
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        createdAt: new Date(row.createdAt).toISOString(),
      };
    } catch (err: any) {
      if (err.code === '23505') {
        const error = new Error('duplicate key value violates unique constraint "users_email_key"');
        (error as any).code = '23505';
        throw error;
      }
      throw err;
    }
  },

  async findByEmail(client: DbClient, email: string): Promise<User | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt"
       FROM users
       WHERE LOWER(email) = LOWER($1);`,
      [email]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  },

  async findById(client: DbClient, id: string): Promise<User | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt"
       FROM users
       WHERE id = $1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  },

  async updatePassword(client: DbClient, userId: string, newPasswordHash: string): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2;`,
      [newPasswordHash, userId]
    );
  },

  async createPasswordResetToken(client: DbClient, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [userId, tokenHash, expiresAt.toISOString()]
    );
  },

  async findValidResetToken(client: DbClient, tokenHash: string): Promise<PasswordResetRecord | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, user_id AS "userId", token_hash AS "tokenHash",
              expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt"
       FROM password_reset_tokens
       WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL;`,
      [tokenHash]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: new Date(row.expiresAt).toISOString(),
      usedAt: row.usedAt ? new Date(row.usedAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  },

  async markResetTokenUsed(client: DbClient, tokenId: string): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1;`,
      [tokenId]
    );
  },
};
