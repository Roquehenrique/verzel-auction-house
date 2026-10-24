import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { assertTestDatabase } from './test-env.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

// Empties every table of the test database (never runs on a non *_test database).
export async function resetDatabase(app: INestApplication): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL!);
  await app.get(PrismaService)
    .$executeRaw`TRUNCATE TABLE receipts, bids, ledger_entries, lot_images, lots, wallets, users`;
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Independent connection to the test database, used to simulate a concurrent
// transaction (e.g. holding a row lock) outside the application.
export async function connectToTestDatabase(): Promise<pg.Client> {
  assertTestDatabase(process.env.DATABASE_URL!);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

// Fills the catalog cache so lot creation does not call the real NHTSA API.
// Make 448 = Toyota, model 3647 = Supra (2020).
export const CATALOG = { makeId: 448, modelId: 3647, year: 2020 };

export async function seedCatalogCache(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const fresh = {
    fetchedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
  const entries = [
    { key: 'nhtsa:makes', payload: [{ id: 448, name: 'Toyota' }] },
    {
      key: 'nhtsa:models:448:2020',
      payload: [
        { id: 2208, name: 'Corolla' },
        { id: 3647, name: 'Supra' },
      ],
    },
  ];
  for (const entry of entries) {
    await prisma.externalApiCache.upsert({
      where: { key: entry.key },
      create: { ...entry, ...fresh },
      update: { payload: entry.payload, ...fresh },
    });
  }
}

const MINUTE = 60 * 1000;

// Inserts a lot directly in the database (bypassing the API validation), useful
// to build lots in any state: scheduled, ended, with bids...
export async function createLotInDb(
  app: INestApplication,
  auctioneerId: string,
  overrides: Partial<{
    title: string;
    make: string;
    startsAt: Date;
    endsAt: Date;
    cancelledAt: Date;
  }> = {},
) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() - MINUTE);
  const endsAt = overrides.endsAt ?? new Date(Date.now() + 60 * MINUTE);
  return app.get(PrismaService).lot.create({
    data: {
      auctioneerId,
      title: overrides.title ?? 'Toyota Supra 2020',
      make: overrides.make ?? 'Toyota',
      model: 'Supra',
      year: 2020,
      externalSource: 'test',
      startingBidCents: 100_000,
      minIncrementCents: 10_000,
      startsAt,
      endsAt,
      originalEndsAt: endsAt,
      cancelledAt: overrides.cancelledAt,
    },
  });
}

export async function registerUser(
  app: INestApplication<App>,
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    role: Role;
  }> = {},
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
  return {
    ...body,
    token: res.body.accessToken as string,
    user: res.body.user,
  };
}
