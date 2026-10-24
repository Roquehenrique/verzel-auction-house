import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SettlementService } from '../src/settlement/settlement.service.js';
import {
  connectToTestDatabase,
  createLotInDb,
  createTestApp,
  registerUser,
  resetDatabase,
} from './utils.js';

type TestUser = Awaited<ReturnType<typeof registerUser>>;

describe('Settlement and receipts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let settlement: SettlementService;
  let auctioneer: TestUser;
  let ana: TestUser;
  let bruno: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    settlement = app.get(SettlementService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    auctioneer = await registerUser(app, { role: 'AUCTIONEER' });
    ana = await registerUser(app, { role: 'BIDDER', name: 'Ana' });
    bruno = await registerUser(app, { role: 'BIDDER', name: 'Bruno' });
    for (const user of [ana, bruno]) {
      await prisma.wallet.update({
        where: { userId: user.user.id },
        data: { balanceCents: 1_000_000 },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const bid = (user: TestUser, lotId: string, amountCents: number) =>
    http()
      .post(`/api/lots/${lotId}/bids`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ amountCents })
      .expect(201);
  const wallet = (user: TestUser) =>
    prisma.wallet.findUniqueOrThrow({ where: { userId: user.user.id } });

  // Ends a live lot "now" (as if its time ran out).
  async function endLot(lotId: string) {
    const past = new Date(Date.now() - 1000);
    await prisma.lot.update({
      where: { id: lotId },
      data: { endsAt: past, originalEndsAt: past },
    });
  }

  // Live lot with Ana 100k and Bruno 120k (Bruno winning), then ended.
  async function endedLotWonByBruno() {
    const lot = await createLotInDb(app, auctioneer.user.id);
    await bid(ana, lot.id, 100_000);
    await bid(bruno, lot.id, 120_000);
    await endLot(lot.id);
    return lot;
  }

  describe('settlement', () => {
    it('debits the winner, credits the auctioneer and issues a receipt', async () => {
      const lot = await endedLotWonByBruno();

      const outcomes = await settlement.settleDueLots();

      expect(outcomes).toEqual([
        expect.objectContaining({
          lotId: lot.id,
          sold: true,
          amountCents: 120_000,
        }),
      ]);
      expect(await wallet(bruno)).toMatchObject({
        balanceCents: 1_000_000 - 120_000,
        committedCents: 0,
      });
      expect(await wallet(ana)).toMatchObject({
        balanceCents: 1_000_000,
        committedCents: 0,
      });
      expect(await wallet(auctioneer)).toMatchObject({ balanceCents: 120_000 });

      const entries = await prisma.ledgerEntry.findMany({
        where: { lotId: lot.id },
      });
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: auctioneer.user.id,
            type: 'SALE',
            amountCents: 120_000,
          }),
          expect.objectContaining({
            userId: bruno.user.id,
            type: 'PURCHASE',
            amountCents: 120_000,
          }),
        ]),
      );

      const stored = await prisma.lot.findUniqueOrThrow({
        where: { id: lot.id },
        include: { receipt: true },
      });
      expect(stored.settledAt).not.toBeNull();
      expect(stored.receipt).toMatchObject({
        winnerId: bruno.user.id,
        amountCents: 120_000,
        chainHeadHash: stored.lastBidHash,
      });
    });

    it('closes a lot without bids without a winner', async () => {
      const lot = await createLotInDb(app, auctioneer.user.id);
      await endLot(lot.id);

      const [outcome] = await settlement.settleDueLots();

      expect(outcome).toMatchObject({
        lotId: lot.id,
        sold: false,
        winnerId: null,
      });
      expect(await prisma.receipt.count()).toBe(0);
      expect(await prisma.ledgerEntry.count()).toBe(0);
      const stored = await prisma.lot.findUniqueOrThrow({
        where: { id: lot.id },
      });
      expect(stored.settledAt).not.toBeNull();
    });

    it('is idempotent: running many times (even in parallel) charges only once', async () => {
      const lot = await endedLotWonByBruno();

      await Promise.all([
        settlement.settleDueLots(),
        settlement.settleLot(lot.id),
        settlement.settleLot(lot.id),
      ]);
      await settlement.settleDueLots();

      expect(await prisma.receipt.count()).toBe(1);
      expect(await prisma.ledgerEntry.count({ where: { lotId: lot.id } })).toBe(
        2,
      );
      expect((await wallet(bruno)).balanceCents).toBe(1_000_000 - 120_000);
      expect((await wallet(auctioneer)).balanceCents).toBe(120_000);
    });

    it('settling an already settled lot again is a clean no-op', async () => {
      const lot = await endedLotWonByBruno();
      await settlement.settleLot(lot.id);

      // Re-checked under the lock: returns null instead of trying to charge again.
      await expect(settlement.settleLot(lot.id)).resolves.toBeNull();
      expect((await wallet(bruno)).balanceCents).toBe(1_000_000 - 120_000);
    });

    it('ignores live, scheduled and cancelled lots', async () => {
      await createLotInDb(app, auctioneer.user.id); // live
      await createLotInDb(app, auctioneer.user.id, {
        startsAt: new Date(Date.now() + 60_000),
        endsAt: new Date(Date.now() + 120_000),
      });
      const cancelled = await createLotInDb(app, auctioneer.user.id, {
        cancelledAt: new Date(),
      });
      await endLot(cancelled.id);

      expect(await settlement.settleDueLots()).toEqual([]);
      expect(
        await prisma.lot.count({ where: { settledAt: { not: null } } }),
      ).toBe(0);
    });

    it('does not settle a lot that was extended by a last-second bid', async () => {
      const lot = await createLotInDb(app, auctioneer.user.id); // still live
      expect(await settlement.settleLot(lot.id)).toBeNull();
    });

    it('skips a lot locked by a bid in progress and settles it on the next run', async () => {
      const lot = await endedLotWonByBruno();
      const other = await connectToTestDatabase();
      try {
        await other.query('BEGIN');
        await other.query('SELECT id FROM lots WHERE id = $1 FOR UPDATE', [
          lot.id,
        ]);
        expect(await settlement.settleLot(lot.id)).toBeNull(); // did not wait
        await other.query('COMMIT');
      } finally {
        await other.end();
      }
      expect(await settlement.settleLot(lot.id)).toMatchObject({ sold: true });
    });

    it('updates the auctioneer panel with the result and the total received', async () => {
      const lot = await endedLotWonByBruno();
      await settlement.settleDueLots();

      const res = await http()
        .get('/api/lots/mine')
        .set('Authorization', `Bearer ${auctioneer.token}`)
        .expect(200);

      const item = res.body.items.find((i: { id: string }) => i.id === lot.id);
      expect(item).toMatchObject({ result: 'SOLD', currentBidCents: 120_000 });
      expect(res.body.summary).toMatchObject({
        totalReceivedCents: 120_000,
        soldCount: 1,
      });
    });
  });

  describe('GET /api/receipts/:shareCode', () => {
    async function settledReceipt() {
      const lot = await endedLotWonByBruno();
      await settlement.settleDueLots();
      const receipt = await prisma.receipt.findUniqueOrThrow({
        where: { lotId: lot.id },
      });
      return { lot, receipt };
    }

    it('is public, signed and does not expose personal data', async () => {
      const { lot, receipt } = await settledReceipt();

      const res = await http()
        .get(`/api/receipts/${receipt.shareCode}`)
        .expect(200);

      expect(res.body).toMatchObject({
        shareCode: receipt.shareCode,
        lot: { id: lot.id, title: 'Toyota Supra 2020' },
        winnerPseudonym: expect.stringMatching(/^Licitante #/),
        amountCents: 120_000,
        bidCount: 2,
        signatureValid: true,
      });
      const text = JSON.stringify(res.body);
      for (const secret of [bruno.user.id, bruno.user.email, 'Bruno']) {
        expect(text).not.toContain(secret);
      }
    });

    it('detects a receipt changed directly in the database', async () => {
      const { receipt } = await settledReceipt();
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { amountCents: 1 },
      });

      const res = await http()
        .get(`/api/receipts/${receipt.shareCode}`)
        .expect(200);
      expect(res.body.signatureValid).toBe(false);
    });

    it('detects bids deleted from a settled lot', async () => {
      const { lot, receipt } = await settledReceipt();
      await prisma.bid.deleteMany({ where: { lotId: lot.id, sequence: 2 } });
      await prisma.lot.update({ where: { id: lot.id }, data: { bidCount: 1 } });

      const res = await http()
        .get(`/api/receipts/${receipt.shareCode}`)
        .expect(200);
      expect(res.body.signatureValid).toBe(false);
    });

    it('returns 404 for an unknown code', async () => {
      await http().get('/api/receipts/nao-existe').expect(404);
    });
  });

  describe('GET /api/bids/mine', () => {
    const myBids = async (user: TestUser) =>
      (
        await http()
          .get('/api/bids/mine')
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200)
      ).body as Array<{
        lot: { id: string };
        outcome: string;
        myHighestBidCents: number;
        receipt: { shareCode: string } | null;
      }>;

    it('shows won lots with the receipt and lost ones without it', async () => {
      const lot = await endedLotWonByBruno();
      await settlement.settleDueLots();
      const receipt = await prisma.receipt.findUniqueOrThrow({
        where: { lotId: lot.id },
      });

      expect(await myBids(bruno)).toEqual([
        expect.objectContaining({
          outcome: 'WON',
          myHighestBidCents: 120_000,
          receipt: expect.objectContaining({ shareCode: receipt.shareCode }),
        }),
      ]);
      expect(await myBids(ana)).toEqual([
        expect.objectContaining({ outcome: 'LOST', receipt: null }),
      ]);
    });

    it('shows live lots as winning or outbid, and ended ones awaiting settlement', async () => {
      const live = await createLotInDb(app, auctioneer.user.id);
      await bid(ana, live.id, 100_000);
      await bid(bruno, live.id, 120_000);
      const ended = await endedLotWonByBruno();

      const outcomes = Object.fromEntries(
        (await myBids(bruno)).map((item) => [item.lot.id, item.outcome]),
      );
      expect(outcomes).toEqual({
        [live.id]: 'WINNING',
        [ended.id]: 'AWAITING_SETTLEMENT',
      });
      expect(
        (await myBids(ana)).find((i) => i.lot.id === live.id)?.outcome,
      ).toBe('OUTBID');
    });

    it('is only for bidders', async () => {
      await http()
        .get('/api/bids/mine')
        .set('Authorization', `Bearer ${auctioneer.token}`)
        .expect(403);
    });
  });
});
