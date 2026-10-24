import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser, resetDatabase } from './utils.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /api/auth/register', () => {
    it('creates the user with an empty wallet and returns a token', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({
          name: '  Ana  ',
          email: ' Ana@Leilao.DEV ',
          password: 'Senha@123',
          role: 'BIDDER',
        })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toEqual({
        id: expect.any(String),
        name: 'Ana',
        email: 'ana@leilao.dev', // normalized
        role: 'BIDDER',
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');

      const wallet = await prisma.wallet.findUnique({
        where: { userId: res.body.user.id },
      });
      expect(wallet).toMatchObject({ balanceCents: 0, committedCents: 0 });
    });

    it('stores a password hash, never the plain password', async () => {
      const { user } = await registerUser(app, { password: 'Senha@123' });
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(stored.passwordHash).not.toContain('Senha@123');
      expect(stored.passwordHash).toMatch(/^scrypt\$/);
    });

    it('rejects a duplicated e-mail, ignoring case', async () => {
      await registerUser(app, { email: 'dup@leilao.dev' });
      const res = await http()
        .post('/api/auth/register')
        .send({
          name: 'Outro',
          email: 'DUP@leilao.dev',
          password: 'Senha@123',
          role: 'BIDDER',
        })
        .expect(409);
      expect(res.body.message).toBe('Este e-mail já está cadastrado');
    });

    it('validates the payload with messages in Portuguese', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({ name: 'A', email: 'invalido', password: '123', role: 'ADMIN' })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'O nome deve ter pelo menos 2 caracteres',
          'Informe um e-mail válido',
          'A senha deve ter pelo menos 8 caracteres',
          'Perfil inválido: use AUCTIONEER (leiloeiro) ou BIDDER (licitante)',
        ]),
      );
    });

    it('rejects unknown fields (e.g. trying to set the balance)', async () => {
      await http()
        .post('/api/auth/register')
        .send({
          name: 'Esperto',
          email: 'esperto@leilao.dev',
          password: 'Senha@123',
          role: 'BIDDER',
          balanceCents: 999_999_99,
        })
        .expect(400);
      expect(await prisma.user.count()).toBe(0);
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with valid credentials (e-mail case-insensitive)', async () => {
      const registered = await registerUser(app, {
        email: 'login@leilao.dev',
        role: 'AUCTIONEER',
      });
      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'LOGIN@leilao.dev', password: registered.password })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({
        email: 'login@leilao.dev',
        role: 'AUCTIONEER',
      });
    });

    it('returns the same error for wrong password and unknown e-mail', async () => {
      await registerUser(app, { email: 'login@leilao.dev' });

      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ email: 'login@leilao.dev', password: 'errada123' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/auth/login')
        .send({ email: 'ninguem@leilao.dev', password: 'errada123' })
        .expect(401);

      expect(wrongPassword.body.message).toBe('E-mail ou senha inválidos');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the authenticated user', async () => {
      const { token, user } = await registerUser(app);
      const res = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual(user);
    });

    it('requires a token', async () => {
      const res = await http().get('/api/auth/me').expect(401);
      expect(res.body.message).toBe('Faça login para continuar');
    });

    it('rejects an invalid or tampered token', async () => {
      const { token } = await registerUser(app);
      const tampered =
        token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
      await http()
        .get('/api/auth/me')
        .set('Authorization', 'Bearer abc')
        .expect(401);
    });
  });
});
