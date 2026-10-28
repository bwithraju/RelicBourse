import { DbClient, UsersRepository } from '../contract.js';
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
};
