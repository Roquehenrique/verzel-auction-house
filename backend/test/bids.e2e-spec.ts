import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { GENESIS_HASH } from '../src/bids/bid-chain.js';
import { BidSignerService } from '../src/bids/bid-signer.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  connectToTestDatabase,
  createLotInDb,
  createTestApp,
  registerUser,
  resetDatabase,
  sleep,
} from './utils.js';

const MINUTE = 60 * 1000;
// createLotInDb: starting bid R$ 1.000,00 and minimum increment R$ 100,00
const STARTING = 100_000;
const INCREMENT = 10_000;

type TestUser = Awaited<ReturnType<typeof registerUser>>;

describe('Bids (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let signer: BidSignerService;
  let auctioneer: TestUser;
  let ana: TestUser;
  let bruno: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    signer = app.get(BidSignerService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    auctioneer = await registerUser(app, { role: 'AUCTIONEER' });
    ana = await registerUser(app, { role: 'BIDDER', name: 'Ana' });
    bruno = await registerUser(app, { role: 'BIDDER', name: 'Bruno' });
    await setBalance(ana, 1_000_000);
    await setBalance(bruno, 1_000_000);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const bid = (user: TestUser, lotId: string, amountCents: number) =>
    http()
      .post(`/api/lots/${lotId}/bids`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ amountCents });
  const liveLot = (overrides = {}) =>
    createLotInDb(app, auctioneer.user.id, overrides);
  const wallet = (user: TestUser) =>
    prisma.wallet.findUniqueOrThrow({ where: { userId: user.user.id } });
  async function setBalance(user: TestUser, balanceCents: number) {
    await prisma.wallet.update({
      where: { userId: user.user.id },
      data: { balanceCents },
    });
  }

  // committed balance must always equal the sum of the bids the user is leading
  async function expectWalletInvariant() {
    const wallets = await prisma.wallet.findMany();
    for (const w of wallets) {
      const leading = await prisma.lot.aggregate({
        where: {
          currentLeaderId: w.userId,
          settledAt: null,
          cancelledAt: null,
        },
        _sum: { currentBidCents: true },
      });
      expect(w.committedCents).toBe(leading._sum.currentBidCents ?? 0);
      expect(w.committedCents).toBeLessThanOrEqual(w.balanceCents);
    }
  }

  async function expectRejected(
    res: request.Response,
    code: string,
    message?: string | RegExp,
  ) {
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(code);
    if (message) expect(res.body.message).toMatch(message);
  }

  describe('bid rules', () => {
    it('accepts a first bid equal to the starting bid and commits the amount', async () => {
      const lot = await liveLot();

      const res = await bid(ana, lot.id, STARTING).expect(201);

      expect(res.body.bid).toEqual({
        sequence: 1,
        bidderPseudonym: signer.pseudonym(lot.id, ana.user.id),
        amountCents: STARTING,
        createdAt: expect.any(String),
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(res.body.lot).toMatchObject({
        currentBidCents: STARTING,
        bidCount: 1,
        nextMinimumBidCents: STARTING + INCREMENT,
      });
      expect(res.body.bid).not.toHaveProperty('bidderId');
      expect(await wallet(ana)).toMatchObject({ committedCents: STARTING });
    });

    it('rejects a first bid below the starting bid', async () => {
      const lot = await liveLot();
      const res = await bid(ana, lot.id, STARTING - 1);
      await expectRejected(res, 'BELOW_MINIMUM', 'pelo menos R$ 1.000,00');
    });

    it('requires the next bids to be >= current bid + minimum increment', async () => {
      const lot = await liveLot();
      await bid(ana, lot.id, STARTING).expect(201);

      await expectRejected(
        await bid(bruno, lot.id, STARTING + INCREMENT - 1),
        'BELOW_MINIMUM',
        'pelo menos R$ 1.100,00',
      );
      await bid(bruno, lot.id, STARTING + INCREMENT).expect(201);
    });

    it('releases the outbid leader committed amount immediately', async () => {
      const lot = await liveLot();
      await bid(ana, lot.id, STARTING).expect(201);
      expect((await wallet(ana)).committedCents).toBe(STARTING);

      await bid(bruno, lot.id, 150_000).expect(201);

      expect((await wallet(ana)).committedCents).toBe(0);
      expect((await wallet(bruno)).committedCents).toBe(150_000);
      await expectWalletInvariant();
    });

    it('does not let the leader cover their own bid', async () => {
      const lot = await liveLot();
      await bid(ana, lot.id, STARTING).expect(201);
      await expectRejected(
        await bid(ana, lot.id, 200_000),
        'ALREADY_WINNING',
        'Você já está ganhando este lote',
      );
    });

    it('only accepts bids that fit in the available balance (total - committed)', async () => {
      await setBalance(ana, 150_000);
      const lot1 = await liveLot();
      const lot2 = await liveLot();
      await bid(ana, lot1.id, STARTING).expect(201); // available: R$ 500,00

      await expectRejected(
        await bid(ana, lot2.id, STARTING),
        'INSUFFICIENT_BALANCE',
        'Seu saldo disponível é R$ 500,00',
      );

      // once outbid on lot 1, the money is available again
      await bid(bruno, lot1.id, 200_000).expect(201);
      await bid(ana, lot2.id, STARTING).expect(201);
      await expectWalletInvariant();
    });

    it('rejects bids on a lot that has not started', async () => {
      const lot = await liveLot({
        startsAt: new Date(Date.now() + 10 * MINUTE),
        endsAt: new Date(Date.now() + 60 * MINUTE),
      });
      await expectRejected(
        await bid(ana, lot.id, STARTING),
        'LOT_NOT_STARTED',
        'ainda não foi iniciado',
      );
    });

    it('rejects bids on an ended lot', async () => {
      const lot = await liveLot({
        startsAt: new Date(Date.now() - 60 * MINUTE),
        endsAt: new Date(Date.now() - 1),
      });
      await expectRejected(
        await bid(ana, lot.id, STARTING),
        'LOT_ENDED',
        'encerrado',
      );
    });

    it('rejects bids on a cancelled lot', async () => {
      const lot = await liveLot({ cancelledAt: new Date() });
      await expectRejected(await bid(ana, lot.id, STARTING), 'LOT_CANCELLED');
    });

    it('a rejected bid changes nothing', async () => {
      const lot = await liveLot();
      await bid(ana, lot.id, STARTING).expect(201);
      const before = await prisma.lot.findUniqueOrThrow({
        where: { id: lot.id },
      });

      await bid(bruno, lot.id, STARTING + 1).expect(422);

      expect(
        await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } }),
      ).toEqual(before);
      expect(await prisma.bid.count()).toBe(1);
      expect((await wallet(bruno)).committedCents).toBe(0);
    });

    it('only bidders can bid (auctioneers cannot)', async () => {
      const lot = await liveLot();
      const res = await http()
        .post(`/api/lots/${lot.id}/bids`)
        .set('Authorization', `Bearer ${auctioneer.token}`)
        .send({ amountCents: STARTING })
        .expect(403);
      expect(res.body.message).toBe('Ação permitida apenas para licitantes');
      await http()
        .post(`/api/lots/${lot.id}/bids`)
        .send({ amountCents: STARTING })
        .expect(401);
    });

    it('validates the amount and the lot id', async () => {
      const lot = await liveLot();
      await bid(ana, lot.id, 10.5).expect(400);
      await bid(ana, crypto.randomUUID(), STARTING).expect(404);
    });
  });

  describe('anti-sniping', () => {
    it('a bid in the last 2 minutes moves the end to bid time + 2 minutes', async () => {
      const lot = await liveLot({ endsAt: new Date(Date.now() + 30_000) });

      const before = Date.now();
      const res = await bid(ana, lot.id, STARTING).expect(201);
      const createdAt = new Date(res.body.bid.createdAt).getTime();

      expect(res.body.extended).toBe(true);
      expect(new Date(res.body.lot.endsAt).getTime()).toBe(
        createdAt + 2 * MINUTE,
      );
      expect(createdAt).toBeGreaterThanOrEqual(before);
      expect(res.body.lot.originalEndsAt).toBe(lot.endsAt.toISOString());
      expect(res.body.lot.extended).toBe(true);
    });

    it('a bid before the last 2 minutes does not change the end', async () => {
      const lot = await liveLot({ endsAt: new Date(Date.now() + 10 * MINUTE) });
      const res = await bid(ana, lot.id, STARTING).expect(201);
      expect(res.body.extended).toBe(false);
      expect(res.body.lot.endsAt).toBe(lot.endsAt.toISOString());
    });

    it('extends again on every bid in the extended window', async () => {
      const lot = await liveLot({ endsAt: new Date(Date.now() + 30_000) });
      const first = await bid(ana, lot.id, STARTING).expect(201);
      await sleep(20);
      const second = await bid(bruno, lot.id, STARTING + INCREMENT).expect(201);

      expect(second.body.extended).toBe(true);
      expect(new Date(second.body.lot.endsAt).getTime()).toBeGreaterThan(
        new Date(first.body.lot.endsAt).getTime(),
      );
    });
  });

  describe('history and hash chain', () => {
    it('chains every bid to the previous one with a valid signature', async () => {
      const lot = await liveLot();
      await bid(ana, lot.id, STARTING).expect(201);
      await bid(bruno, lot.id, 120_000).expect(201);
      await bid(ana, lot.id, 140_000).expect(201);

      const bids = await prisma.bid.findMany({
        where: { lotId: lot.id },
        orderBy: { sequence: 'asc' },
      });
      expect(bids.map((b) => b.sequence)).toEqual([1, 2, 3]);
      expect(bids[0].prevHash).toBe(GENESIS_HASH);
      expect(bids[1].prevHash).toBe(bids[0].hash);
      expect(bids[2].prevHash).toBe(bids[1].hash);
      expect(signer.verifyChain(bids)).toEqual([]);

      const stored = await prisma.lot.findUniqueOrThrow({
        where: { id: lot.id },
      });
      expect(stored.lastBidHash).toBe(bids[2].hash);
    });

    it('lists the public history newest first, with pseudonyms only', async () => {
      const lot = await liveLot();
      await bid(ana, lot.id, STARTING).expect(201);
      await bid(bruno, lot.id, 120_000).expect(201);

      const res = await http().get(`/api/lots/${lot.id}/bids`).expect(200);

      const brunoPseudonym = signer.pseudonym(lot.id, bruno.user.id);
      expect(res.body.leaderPseudonym).toBe(brunoPseudonym);
      expect(
        res.body.bids.map((b: { amountCents: number }) => b.amountCents),
      ).toEqual([120_000, STARTING]);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(ana.user.id);
      expect(body).not.toContain(ana.user.email);
      expect(body).not.toContain('Ana');
    });

    it('uses a different pseudonym for the same bidder in another lot', async () => {
      const [lot1, lot2] = [await liveLot(), await liveLot()];
      const a = await bid(ana, lot1.id, STARTING).expect(201);
      const b = await bid(ana, lot2.id, STARTING).expect(201);
      expect(a.body.bid.bidderPseudonym).not.toBe(b.body.bid.bidderPseudonym);
    });
  });

  describe('my status in a lot', () => {
    const myStatus = (user: TestUser, lotId: string) =>
      http()
        .get(`/api/lots/${lotId}/my-status`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

    it('tells who is winning and who was outbid, with positions', async () => {
      const lot = await liveLot();
      await bid(ana, lot.id, STARTING).expect(201);
      await bid(bruno, lot.id, 120_000).expect(201);

      expect((await myStatus(bruno, lot.id)).body).toMatchObject({
        isLeader: true,
        position: 1,
        myHighestBidCents: 120_000,
        totalBidders: 2,
      });
      expect((await myStatus(ana, lot.id)).body).toMatchObject({
        isLeader: false,
        hasBid: true,
        position: 2,
        myHighestBidCents: STARTING,
      });
    });

    it('reports no participation for a bidder without bids', async () => {
      const lot = await liveLot();
      expect((await myStatus(ana, lot.id)).body).toMatchObject({
        hasBid: false,
        isLeader: false,
        position: null,
        totalBidders: 0,
      });
    });
  });

  describe('concurrency', () => {
    it('two simultaneous bids with the same amount: exactly one wins (lot lock)', async () => {
      const lot = await liveLot();
      const other = await connectToTestDatabase();
      try {
        // Hold the lot lock so both requests are guaranteed to be in flight together.
        await other.query('BEGIN');
        await other.query('SELECT id FROM lots WHERE id = $1 FOR UPDATE', [
          lot.id,
        ]);
        const pending = Promise.all([
          bid(ana, lot.id, STARTING).then((res) => res),
          bid(bruno, lot.id, STARTING).then((res) => res),
        ]);
        await sleep(300);
        await other.query('COMMIT');

        const responses = await pending;
        expect(
          responses.map((res) => res.status).sort((a, b) => a - b),
        ).toEqual([201, 422]);
        const loser = responses.find((res) => res.status === 422)!;
        expect(loser.body.code).toBe('BELOW_MINIMUM');
      } finally {
        await other.end();
      }
      expect(await prisma.bid.count()).toBe(1);
      await expectWalletInvariant();
    });

    it('the same bidder on two lots at once cannot spend the same money twice (wallet lock)', async () => {
      await setBalance(ana, STARTING); // enough for only one bid
      const [lot1, lot2] = [await liveLot(), await liveLot()];
      const other = await connectToTestDatabase();
      try {
        await other.query('BEGIN');
        await other.query(
          'SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE',
          [ana.user.id],
        );
        const pending = Promise.all([
          bid(ana, lot1.id, STARTING).then((res) => res),
          bid(ana, lot2.id, STARTING).then((res) => res),
        ]);
        await sleep(300);
        await other.query('COMMIT');

        const responses = await pending;
        expect(
          responses.map((res) => res.status).sort((a, b) => a - b),
        ).toEqual([201, 422]);
        const loser = responses.find((res) => res.status === 422)!;
        expect(loser.body.code).toBe('INSUFFICIENT_BALANCE');
      } finally {
        await other.end();
      }
      await expectWalletInvariant();
    });

    it('stays consistent under a burst of concurrent bids', async () => {
      const lot = await liveLot();
      const carla = await registerUser(app, { role: 'BIDDER' });
      await setBalance(carla, 1_000_000);
      const bidders = [ana, bruno, carla];

      // 30 bids fired at once with increasing amounts from rotating bidders.
      const responses = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          bid(bidders[i % 3], lot.id, STARTING + i * INCREMENT),
        ),
      );

      // Every request got a business answer: never a 500.
      for (const res of responses) expect([201, 422]).toContain(res.status);
      const accepted = responses.filter((res) => res.status === 201).length;

      const bids = await prisma.bid.findMany({
        where: { lotId: lot.id },
        orderBy: { sequence: 'asc' },
      });
      expect(bids).toHaveLength(accepted);
      expect(signer.verifyChain(bids)).toEqual([]);
      // amounts strictly respect the increment rule, in order
      for (let i = 1; i < bids.length; i++) {
        expect(bids[i].amountCents).toBeGreaterThanOrEqual(
          bids[i - 1].amountCents + INCREMENT,
        );
        expect(bids[i].bidderId).not.toBe(bids[i - 1].bidderId); // nobody covered themselves
      }
      const stored = await prisma.lot.findUniqueOrThrow({
        where: { id: lot.id },
      });
      expect(stored.bidCount).toBe(accepted);
      expect(stored.currentBidCents).toBe(bids.at(-1)!.amountCents);
      await expectWalletInvariant();
    });
  });
});
