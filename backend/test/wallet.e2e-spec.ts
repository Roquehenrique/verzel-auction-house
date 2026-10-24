import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createLotInDb,
  createTestApp,
  registerUser,
  resetDatabase,
} from './utils.js';

describe('Wallet (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let bidder: Awaited<ReturnType<typeof registerUser>>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    bidder = await registerUser(app, { role: 'BIDDER' });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const deposit = (amountCents: unknown, token = bidder.token) =>
    http()
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send({ amountCents });
  const getWallet = (token = bidder.token) =>
    http().get('/api/wallet').set('Authorization', `Bearer ${token}`);

  it('starts empty', async () => {
    const res = await getWallet().expect(200);
    expect(res.body).toEqual({
      balanceCents: 0,
      committedCents: 0,
      availableCents: 0,
      commitments: [],
      recentEntries: [],
    });
  });

  it('deposits and records the entry in the ledger', async () => {
    const res = await deposit(150_000).expect(200);

    expect(res.body).toMatchObject({
      balanceCents: 150_000,
      committedCents: 0,
      availableCents: 150_000,
    });
    expect(res.body.recentEntries).toEqual([
      expect.objectContaining({ type: 'DEPOSIT', amountCents: 150_000 }),
    ]);
  });

  it('available = total - committed, listing the lots holding the money', async () => {
    await deposit(500_000).expect(200);
    const auctioneer = await registerUser(app, { role: 'AUCTIONEER' });
    const lot = await createLotInDb(app, auctioneer.user.id, {
      title: 'Supra',
    });
    // Simulates a leading bid (the bid engine comes in the next stage).
    await prisma.$transaction([
      prisma.lot.update({
        where: { id: lot.id },
        data: {
          bidCount: 1,
          currentBidCents: 120_000,
          currentLeaderId: bidder.user.id,
          lastBidHash: 'hash',
        },
      }),
      prisma.wallet.update({
        where: { userId: bidder.user.id },
        data: { committedCents: 120_000 },
      }),
    ]);

    const res = await getWallet().expect(200);

    expect(res.body).toMatchObject({
      balanceCents: 500_000,
      committedCents: 120_000,
      availableCents: 380_000,
      commitments: [{ lotId: lot.id, title: 'Supra', amountCents: 120_000 }],
    });
  });

  it('never loses money with simultaneous deposits', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => deposit(10_000).expect(200)),
    );

    const res = await getWallet().expect(200);
    expect(res.body.balanceCents).toBe(100_000);
    expect(
      await prisma.ledgerEntry.count({ where: { userId: bidder.user.id } }),
    ).toBe(10);
  });

  it.each([
    ['below R$ 1,00', 99],
    ['above R$ 5.000.000,00', 500_000_001],
    ['not an integer (cents)', 10.5],
    ['not a number', 'mil reais'],
    ['negative', -100],
  ])('rejects a deposit %s', async (_case, amount) => {
    const res = await deposit(amount).expect(400);
    expect(res.body.message).toEqual([
      'O depósito deve ser entre R$ 1,00 e R$ 5.000.000,00 (em centavos)',
    ]);
  });

  it('caps the total balance at R$ 20.000.000,00 without a partial deposit', async () => {
    for (let i = 0; i < 4; i++) await deposit(500_000_000).expect(200); // R$ 20M

    const res = await deposit(100).expect(400);

    expect(res.body.message).toMatch(/não pode passar de R\$ 20.000.000,00/);
    expect((await getWallet().expect(200)).body.balanceCents).toBe(
      2_000_000_000,
    );
    expect(await prisma.ledgerEntry.count()).toBe(4); // rejected deposit left no entry
  });

  it('auctioneers can see their wallet but cannot deposit', async () => {
    const auctioneer = await registerUser(app, { role: 'AUCTIONEER' });
    await getWallet(auctioneer.token).expect(200);
    const res = await deposit(10_000, auctioneer.token).expect(403);
    expect(res.body.message).toBe('Ação permitida apenas para licitantes');
  });

  it('requires login', async () => {
    await http().get('/api/wallet').expect(401);
    await http()
      .post('/api/wallet/deposit')
      .send({ amountCents: 100 })
      .expect(401);
  });
});
