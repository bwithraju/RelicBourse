import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mockStore, accountsRepo, inventoryRepo, DEMO_MARKETS } from '../src/db/index.js';

describe('Auth & Health API Tests (Task B1)', () => {
  const app = createApp();

  beforeEach(() => {
    mockStore.reset();
  });

  it('GET /health returns { ok: true }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  describe('POST /auth/register', () => {
    it('registers user and seeds balance (₹1,00,000) and inventory in ONE transaction', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'trader1@relicbourse.com',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('trader1@relicbourse.com');
      expect(res.body.user.id).toBeDefined();

      const userId = res.body.user.id;

      // Verify account seeded with ₹1,00,000 (10,000,000 paise)
      const account = await accountsRepo.getAccount({}, userId);
      expect(account).not.toBeNull();
      expect(account?.balanceMinor).toBe(10000000);
      expect(account?.reservedMinor).toBe(0);

      // Verify inventory seeded: 2 units of each demo market
      for (const market of DEMO_MARKETS) {
        const inv = await inventoryRepo.getInventory({}, userId, market.id);
        expect(inv).not.toBeNull();
        expect(inv?.quantity).toBe(2);
        expect(inv?.reservedQty).toBe(0);
      }
    });

    it('rejects duplicate email with 409', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: 'duplicate@relicbourse.com',
          password: 'password123',
        });

      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'duplicate@relicbourse.com',
          password: 'password123',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already in use/i);
    });

    it('rejects bad payload with clean 400', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: '123', // less than 6 chars
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toHaveLength(2);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: 'active@relicbourse.com',
          password: 'secretPassword123',
        });
    });

    it('returns JWT (24h) and user info on valid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'active@relicbourse.com',
          password: 'secretPassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
      expect(res.body.user.email).toBe('active@relicbourse.com');
    });

    it('returns the SAME generic 401 error for unknown email and wrong password', async () => {
      const unknownEmailRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'unknown@relicbourse.com',
          password: 'secretPassword123',
        });

      const wrongPasswordRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'active@relicbourse.com',
          password: 'wrongPassword999',
        });

      expect(unknownEmailRes.status).toBe(401);
      expect(wrongPasswordRes.status).toBe(401);
      expect(unknownEmailRes.body.error).toBe('Invalid email or password');
      expect(wrongPasswordRes.body.error).toBe('Invalid email or password');
    });
  });

  describe('authMiddleware and /auth/me', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/);
    });

    it('returns 401 when an invalid token is provided', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid_garbage_token');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/);
    });

    it('returns authenticated user when valid JWT is provided', async () => {
      const reg = await request(app)
        .post('/auth/register')
        .send({
          email: 'me@relicbourse.com',
          password: 'password123',
        });

      const login = await request(app)
        .post('/auth/login')
        .send({
          email: 'me@relicbourse.com',
          password: 'password123',
        });

      const token = login.body.token;

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(reg.body.user.id);
      expect(res.body.user.email).toBe('me@relicbourse.com');
    });
  });
});
