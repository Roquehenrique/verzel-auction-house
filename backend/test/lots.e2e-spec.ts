import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  CATALOG,
  connectToTestDatabase,
  createLotInDb,
  createTestApp,
  registerUser,
  resetDatabase,
  seedCatalogCache,
  sleep,
} from './utils.js';

const MINUTE = 60 * 1000;
const IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/supra.png/960px-supra.png';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe('Lots (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auctioneer: Awaited<ReturnType<typeof registerUser>>;
  const fetchMock = vi.fn<typeof fetch>();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await seedCatalogCache(app);
    auctioneer = await registerUser(app, {
      role: 'AUCTIONEER',
      name: 'Leiloeiro',
    });

    // Only the image download uses fetch here (the catalog comes from the cache).
    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(PNG_BYTES, { headers: { 'Content-Type': 'image/png' } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const validLot = (overrides: Record<string, unknown> = {}) => ({
    ...CATALOG,
    imageUrl: IMAGE_URL,
    attributes: { mileageKm: 15_000, color: 'Vermelho' },
    startingBidCents: 30_000_000,
    minIncrementCents: 100_000,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 60 * MINUTE).toISOString(),
    ...overrides,
  });
  const createLot = (body: Record<string, unknown>, token = auctioneer.token) =>
    http().post('/api/lots').set('Authorization', `Bearer ${token}`).send(body);

  describe('POST /api/lots', () => {
    it('creates a live lot with the names from the catalog and a copy of the image', async () => {
      const res = await createLot(validLot()).expect(201);

      expect(res.body).toMatchObject({
        title: 'Toyota Supra 2020',
        make: 'Toyota',
        model: 'Supra',
        year: 2020,
        status: 'LIVE',
        bidCount: 0,
        currentBidCents: null,
        nextMinimumBidCents: 30_000_000,
        externalSource: 'nhtsa',
        attributes: { mileageKm: 15_000, color: 'Vermelho' },
        auctioneer: { name: 'Leiloeiro' },
      });

      const image = await http()
        .get(`/api/lots/${res.body.id}/image`)
        .expect(200);
      expect(image.headers['content-type']).toBe('image/png');
      expect(new Uint8Array(image.body as Buffer)).toEqual(PNG_BYTES);
    });

    it('creates a scheduled lot when the start is in the future', async () => {
      const res = await createLot(
        validLot({
          startsAt: new Date(Date.now() + 60 * MINUTE).toISOString(),
          endsAt: new Date(Date.now() + 120 * MINUTE).toISOString(),
        }),
      ).expect(201);
      expect(res.body.status).toBe('SCHEDULED');
    });

    it('still creates the lot when the image download fails (falls back to the URL)', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const res = await createLot(validLot()).expect(201);

      expect(await prisma.lotImage.count()).toBe(0);
      const image = await http()
        .get(`/api/lots/${res.body.id}/image`)
        .expect(302);
      expect(image.headers.location).toBe(IMAGE_URL);
    });

    it('rejects a vehicle that is not in the catalog', async () => {
      const res = await createLot(validLot({ modelId: 999_999 })).expect(400);
      expect(res.body.message).toBe(
        'Veículo não encontrado no catálogo para o ano informado',
      );
    });

    it('rejects images that are not from Wikimedia', async () => {
      const res = await createLot(
        validLot({ imageUrl: 'https://evil.example/car.png' }),
      ).expect(400);
      expect(res.body.message).toMatch(/Wikimedia/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      [
        'start in the past',
        { startsAt: new Date(Date.now() - 10 * MINUTE).toISOString() },
        'A data de início não pode estar no passado',
      ],
      [
        'shorter than 5 minutes',
        { endsAt: new Date(Date.now() + 2 * MINUTE).toISOString() },
        'O lote deve durar pelo menos 5 minutos',
      ],
      [
        'end before start',
        { endsAt: new Date(Date.now() - MINUTE).toISOString() },
        'O lote deve durar pelo menos 5 minutos',
      ],
      [
        'longer than 30 days',
        { endsAt: new Date(Date.now() + 31 * 24 * 60 * MINUTE).toISOString() },
        'O lote deve durar no máximo 30 dias',
      ],
    ])('rejects a schedule with %s', async (_case, overrides, message) => {
      const res = await createLot(validLot(overrides)).expect(400);
      expect(res.body.message).toBe(message);
    });

    it('validates amounts', async () => {
      const res = await createLot(
        validLot({ startingBidCents: 50, minIncrementCents: 3_000_000_000 }),
      ).expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^O lance inicial deve ser entre/),
          expect.stringMatching(/^O incremento mínimo deve ser entre/),
        ]),
      );
    });

    it('rejects fields the client must not set', async () => {
      await createLot(validLot({ currentBidCents: 1, make: 'Ferrari' })).expect(
        400,
      );
      expect(await prisma.lot.count()).toBe(0);
    });

    it('is restricted to auctioneers', async () => {
      const bidder = await registerUser(app, { role: 'BIDDER' });
      await createLot(validLot(), bidder.token).expect(403);
      await http().post('/api/lots').send(validLot()).expect(401);
    });
  });

  describe('GET /api/lots (showcase)', () => {
    beforeEach(async () => {
      const id = auctioneer.user.id;
      const now = Date.now();
      await createLotInDb(app, id, {
        title: 'Live A',
        endsAt: new Date(now + 30 * MINUTE),
      });
      await createLotInDb(app, id, {
        title: 'Live B (Ford)',
        make: 'Ford',
        endsAt: new Date(now + 10 * MINUTE),
      });
      await createLotInDb(app, id, {
        title: 'Scheduled',
        startsAt: new Date(now + 60 * MINUTE),
        endsAt: new Date(now + 120 * MINUTE),
      });
      await createLotInDb(app, id, {
        title: 'Ended',
        startsAt: new Date(now - 120 * MINUTE),
        endsAt: new Date(now - 60 * MINUTE),
      });
      await createLotInDb(app, id, {
        title: 'Cancelled',
        cancelledAt: new Date(),
      });
    });

    const titles = async (query: string) => {
      const res = await http().get(`/api/lots?${query}`).expect(200);
      return res.body.items.map((lot: { title: string }) => lot.title);
    };

    it('separates live, scheduled and ended lots and hides cancelled ones', async () => {
      expect(await titles('status=LIVE')).toEqual(['Live B (Ford)', 'Live A']); // ending soonest first
      expect(await titles('status=SCHEDULED')).toEqual(['Scheduled']);
      expect(await titles('status=ENDED')).toEqual(['Ended']);
      expect(await titles('')).toEqual(['Live B (Ford)', 'Live A']); // LIVE by default
    });

    it('searches and filters', async () => {
      expect(await titles('status=LIVE&q=ford')).toEqual(['Live B (Ford)']);
      expect(await titles('status=LIVE&make=toyota')).toEqual(['Live A']);
      expect(await titles('status=LIVE&q=cancelled')).toEqual([]);
    });

    it('paginates and returns the server time', async () => {
      const res = await http()
        .get('/api/lots?status=LIVE&pageSize=1&page=2')
        .expect(200);
      expect(res.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(res.body.items.map((lot: { title: string }) => lot.title)).toEqual(
        ['Live A'],
      );
      expect(new Date(res.body.serverTime).getTime()).toBeGreaterThan(0);
    });

    it('does not expose internal fields such as the leader id', async () => {
      const res = await http().get('/api/lots?status=LIVE').expect(200);
      expect(res.body.items[0]).not.toHaveProperty('currentLeaderId');
      expect(res.body.items[0]).not.toHaveProperty('auctioneerId');
    });

    it('rejects an invalid status', async () => {
      await http().get('/api/lots?status=CANCELLED').expect(400);
    });
  });

  describe('GET /api/lots/makes', () => {
    it('lists distinct makes of non-cancelled lots, publicly', async () => {
      const id = auctioneer.user.id;
      await createLotInDb(app, id, { make: 'Toyota' });
      await createLotInDb(app, id, { make: 'Toyota' });
      await createLotInDb(app, id, { make: 'Ford' });
      await createLotInDb(app, id, { make: 'Fiat', cancelledAt: new Date() });

      const res = await http().get('/api/lots/makes').expect(200);

      expect(res.body).toEqual(['Ford', 'Toyota']);
    });
  });

  describe('GET /api/lots/:id', () => {
    it('returns a lot even when cancelled (for receipts and audit)', async () => {
      const lot = await createLotInDb(app, auctioneer.user.id, {
        cancelledAt: new Date(),
      });
      const res = await http().get(`/api/lots/${lot.id}`).expect(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('returns 404 for unknown or invalid ids', async () => {
      await http().get(`/api/lots/${crypto.randomUUID()}`).expect(404);
      await http().get('/api/lots/not-a-uuid').expect(404);
    });
  });

  describe('GET /api/lots/mine (auctioneer panel)', () => {
    it('lists only the own lots, including cancelled ones, with their results', async () => {
      const other = await registerUser(app, { role: 'AUCTIONEER' });
      await createLotInDb(app, other.user.id, { title: 'Not mine' });
      await createLotInDb(app, auctioneer.user.id, { title: 'Mine live' });
      await createLotInDb(app, auctioneer.user.id, {
        title: 'Mine cancelled',
        cancelledAt: new Date(),
      });
      await createLotInDb(app, auctioneer.user.id, {
        title: 'Mine ended',
        startsAt: new Date(Date.now() - 120 * MINUTE),
        endsAt: new Date(Date.now() - 60 * MINUTE),
      });

      const res = await http()
        .get('/api/lots/mine')
        .set('Authorization', `Bearer ${auctioneer.token}`)
        .expect(200);

      const results = Object.fromEntries(
        res.body.items.map((lot: { title: string; result: string }) => [
          lot.title,
          lot.result,
        ]),
      );
      expect(results).toEqual({
        'Mine live': null,
        'Mine cancelled': 'CANCELLED',
        'Mine ended': 'AWAITING_SETTLEMENT',
      });
      expect(res.body.summary).toMatchObject({
        totalReceivedCents: 0,
        liveCount: 1,
      });
    });
  });

  describe('POST /api/lots/:id/cancel', () => {
    const cancel = (id: string, token = auctioneer.token) =>
      http()
        .post(`/api/lots/${id}/cancel`)
        .set('Authorization', `Bearer ${token}`);

    it('cancels a lot without bids and removes it from the showcase', async () => {
      const lot = await createLotInDb(app, auctioneer.user.id);

      const res = await cancel(lot.id).expect(200);

      expect(res.body.status).toBe('CANCELLED');
      const showcase = await http().get('/api/lots?status=LIVE').expect(200);
      expect(showcase.body.total).toBe(0);
    });

    it('does not cancel a lot that already received bids', async () => {
      const lot = await createLotInDb(app, auctioneer.user.id);
      const bidder = await registerUser(app, { role: 'BIDDER' });
      await prisma.lot.update({
        where: { id: lot.id },
        data: {
          bidCount: 1,
          currentBidCents: 100_000,
          currentLeaderId: bidder.user.id,
          lastBidHash: 'hash',
        },
      });

      const res = await cancel(lot.id).expect(409);
      expect(res.body.message).toBe(
        'Não é possível cancelar um lote que já recebeu lances',
      );
    });

    it('does not cancel an ended lot', async () => {
      const lot = await createLotInDb(app, auctioneer.user.id, {
        startsAt: new Date(Date.now() - 120 * MINUTE),
        endsAt: new Date(Date.now() - 60 * MINUTE),
      });
      await cancel(lot.id).expect(409);
    });

    it("does not cancel another auctioneer's lot", async () => {
      const other = await registerUser(app, { role: 'AUCTIONEER' });
      const lot = await createLotInDb(app, other.user.id);
      await cancel(lot.id).expect(403);
    });

    it('waits for a concurrent operation holding the lot lock and re-checks the lot', async () => {
      const lot = await createLotInDb(app, auctioneer.user.id);

      // A separate connection plays "another request" that locked the lot first
      // (e.g. a bid or another cancellation still running).
      const other = await connectToTestDatabase();
      try {
        await other.query('BEGIN');
        await other.query('SELECT id FROM lots WHERE id = $1 FOR UPDATE', [
          lot.id,
        ]);

        const pending = cancel(lot.id).then((res) => res);
        const settled = await Promise.race([
          pending.then(() => true),
          sleep(500).then(() => false),
        ]);
        expect(settled).toBe(false); // blocked by the lock instead of answering

        await other.query(
          'UPDATE lots SET cancelled_at = now() WHERE id = $1',
          [lot.id],
        );
        await other.query('COMMIT');

        const res = await pending;
        expect(res.status).toBe(409); // saw the other change, did not overwrite it
        expect(res.body.message).toBe('Este lote já foi cancelado');
      } finally {
        await other.end();
      }
    });
  });
});
