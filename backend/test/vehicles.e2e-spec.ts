import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser, resetDatabase } from './utils.js';

// The external APIs are simulated by replacing the global fetch (supertest does
// not use fetch, so only the outgoing calls to NHTSA/Wikipedia are affected).
const nhtsaModels = {
  Count: 2,
  Results: [
    { Model_ID: 2, Model_Name: 'Supra' },
    { Model_ID: 1, Model_Name: 'Corolla' },
  ],
};
const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const down = () => Promise.reject(new TypeError('fetch failed'));

describe('Vehicles catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auctioneerToken: string;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(async () => {
    // New app per test: circuit breakers start closed.
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
    await prisma.externalApiCache.deleteMany();
    auctioneerToken = (await registerUser(app, { role: 'AUCTIONEER' })).token;

    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  const getModels = () =>
    request(app.getHttpServer())
      .get('/api/vehicles/models?makeId=448&year=2020')
      .set('Authorization', `Bearer ${auctioneerToken}`);

  it('fetches from the API, then serves from the cache', async () => {
    fetchMock.mockImplementation(() => ok(nhtsaModels));

    const first = await getModels().expect(200);
    expect(first.body).toMatchObject({
      stale: false,
      data: [
        { id: 1, name: 'Corolla' },
        { id: 2, name: 'Supra' },
      ],
    });

    await getModels().expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1); // second request did not hit the API
  });

  it('keeps working with cached data (stale) when the API is down', async () => {
    fetchMock.mockImplementation(() => ok(nhtsaModels));
    await getModels().expect(200);
    await prisma.externalApiCache.updateMany({
      data: { expiresAt: new Date(0) },
    }); // expire it

    fetchMock.mockImplementation(down);
    const res = await getModels().expect(200);

    expect(res.body.stale).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns 503 with a friendly message when the API is down and nothing is cached', async () => {
    fetchMock.mockImplementation(down);
    const res = await getModels().expect(503);
    expect(res.body.message).toMatch(/catálogo de veículos está indisponível/);
  });

  it('stops calling a failing API after 3 failures (circuit breaker)', async () => {
    fetchMock.mockImplementation(down);
    for (let i = 0; i < 3; i++) await getModels().expect(503);
    const callsWhenOpened = fetchMock.mock.calls.length;

    await getModels().expect(503);
    expect(fetchMock.mock.calls.length).toBe(callsWhenOpened); // failed fast
  });

  it('is restricted to auctioneers', async () => {
    const bidder = await registerUser(app, { role: 'BIDDER' });
    await request(app.getHttpServer())
      .get('/api/vehicles/makes')
      .set('Authorization', `Bearer ${bidder.token}`)
      .expect(403);
    await request(app.getHttpServer()).get('/api/vehicles/makes').expect(401);
  });

  it('validates the year range', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/vehicles/models?makeId=448&year=1970')
      .set('Authorization', `Bearer ${auctioneerToken}`)
      .expect(400);
    expect(res.body.message).toMatch(/O ano deve estar entre 1981 e/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
