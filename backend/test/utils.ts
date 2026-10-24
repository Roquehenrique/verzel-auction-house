import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { assertTestDatabase } from './test-env.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

// Empties every table of the test database (never runs on a non *_test database).
export async function resetDatabase(app: INestApplication): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL!);
  await app
    .get(PrismaService)
    .$executeRaw`TRUNCATE TABLE receipts, bids, ledger_entries, lots, wallets, users`;
}

export async function registerUser(
  app: INestApplication<App>,
  overrides: Partial<{ name: string; email: string; password: string; role: Role }> = {},
) {
  const body = {
    name: 'Usuário Teste',
    email: `user-${crypto.randomUUID()}@test.dev`,
    password: 'Senha@123',
    role: 'BIDDER' as Role,
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send(body)
    .expect(201);
  return { ...body, token: res.body.accessToken as string, user: res.body.user };
}
