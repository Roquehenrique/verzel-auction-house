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
  sleep,
} from './utils.js';

type TestUser = Awaited<ReturnType<typeof registerUser>>;

// Optional feature: cancelling a live lot that already has bids, with a
// mandatory reason and automatic refund of the leader's committed amount.
describe('Cancellation with refund (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auctioneer: TestUser;
  let ana: TestUser;
  let bruno: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    auctioneer = await registerUser(app, { role: 'AUCTIONEER' });
    ana = await registerUser(app, { role: 'BIDDER' });
    bruno = await registerUser(app, { role: 'BIDDER' });
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
      .send({ amountCents });
  const cancel = (lotId: string, reason?: string) =>
    http()
      .post(`/api/lots/${lotId}/cancel`)
      .set('Authorization', `Bearer ${auctioneer.token}`)
      .send(reason === undefined ? {} : { reason });
  const wallet = (user: TestUser) =>
    prisma.wallet.findUniqueOrThrow({ where: { userId: user.user.id } });
  const REASON = 'Veículo retirado pelo proprietário';

  async function lotWithTwoBids() {
    const lot = await createLotInDb(app, auctioneer.user.id);
    await bid(ana, lot.id, 100_000).expect(201);
    await bid(bruno, lot.id, 120_000).expect(201); // Bruno leads, R$ 1.200 committed
    return lot;
  }

  it('cancels with a reason and releases the leader committed amount', async () => {
    const lot = await lotWithTwoBids();
    expect((await wallet(bruno)).committedCents).toBe(120_000);

    const res = await cancel(lot.id, REASON).expect(200);

    expect(res.body).toMatchObject({
      status: 'CANCELLED',
      cancelReason: REASON,
    });
    expect(await wallet(bruno)).toMatchObject({
      balanceCents: 1_000_000, // nothing was ever debited
      committedCents: 0, // refunded to the available balance
    });
    expect((await wallet(ana)).committedCents).toBe(0);
    // History is kept and still verifiable.
    expect(await prisma.bid.count({ where: { lotId: lot.id } })).toBe(2);
    const audit = await http().get(`/api/lots/${lot.id}/audit`).expect(200);
    expect(audit.body.verification.intact).toBe(true);
    expect(audit.body.lot).toMatchObject({
      status: 'CANCELLED',
      cancelReason: REASON,
    });
  });

  it('validates the reason', async () => {
    const lot = await lotWithTwoBids();
    const res = await cancel(lot.id, 'abc').expect(400);
    expect(res.body.message).toEqual([
      'O motivo deve ter pelo menos 5 caracteres',
    ]);
    await cancel(lot.id, '     ').expect(400); // blank = missing
  });

  it('a cancelled lot refuses new bids', async () => {
    const lot = await lotWithTwoBids();
    await cancel(lot.id, REASON).expect(200);

    const res = await bid(ana, lot.id, 200_000).expect(422);
    expect(res.body.code).toBe('LOT_CANCELLED');
  });

  it('settlement ignores a cancelled lot (nobody is charged)', async () => {
    const lot = await lotWithTwoBids();
    await cancel(lot.id, REASON).expect(200);
    const now = new Date();
    await prisma.lot.update({
      where: { id: lot.id },
      data: { endsAt: now, originalEndsAt: now },
    });

    expect(await app.get(SettlementService).settleDueLots()).toEqual([]);
    expect(await prisma.receipt.count()).toBe(0);
    expect((await wallet(bruno)).balanceCents).toBe(1_000_000);
    expect((await wallet(auctioneer)).balanceCents).toBe(0);
  });

  it('an ended lot cannot be cancelled, even before settlement', async () => {
    const lot = await lotWithTwoBids();
    const now = new Date();
    await prisma.lot.update({
      where: { id: lot.id },
      data: { endsAt: now, originalEndsAt: now },
    });
    const res = await cancel(lot.id, REASON).expect(409);
    expect(res.body.message).toBe('Um lote encerrado não pode ser cancelado');
  });

  it('a bid racing with the cancellation never leaves money committed', async () => {
    const lot = await lotWithTwoBids();
    const other = await connectToTestDatabase();
    try {
      await other.query('BEGIN');
      await other.query('SELECT id FROM lots WHERE id = $1 FOR UPDATE', [
        lot.id,
      ]);
      const pending = Promise.all([
        bid(ana, lot.id, 150_000).then((res) => res),
        cancel(lot.id, REASON).then((res) => res),
      ]);
      await sleep(300);
      await other.query('COMMIT');
      const [bidRes, cancelRes] = await pending;
      expect(cancelRes.status).toBe(200);
      // Either the bid ran first (and its amount was refunded by the
      // cancellation) or it was refused because the lot was already cancelled.
      expect([201, 422]).toContain(bidRes.status);
    } finally {
      await other.end();
    }
    expect((await wallet(ana)).committedCents).toBe(0);
    expect((await wallet(bruno)).committedCents).toBe(0);
  });

  it('audit flags a bid recorded after the cancellation', async () => {
    const lot = await lotWithTwoBids();
    await cancel(lot.id, REASON).expect(200);
    // Tampering: move the cancellation back in time, before the last bid.
    await prisma.lot.update({
      where: { id: lot.id },
      data: { cancelledAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const audit = await http().get(`/api/lots/${lot.id}/audit`).expect(200);
    expect(audit.body.verification.intact).toBe(false);
    expect(audit.body.verification.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'rules',
          problem: 'lance registrado depois do cancelamento do lote',
        }),
      ]),
    );
  });
});
