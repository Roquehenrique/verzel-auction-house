import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createLotInDb,
  createTestApp,
  registerUser,
  resetDatabase,
} from './utils.js';

type TestUser = Awaited<ReturnType<typeof registerUser>>;

describe('Realtime (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  let prisma: PrismaService;
  let auctioneer: TestUser;
  let ana: TestUser;
  let bruno: TestUser;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0); // WebSockets need a real port
    const server = app.getHttpServer() as unknown as Server;
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
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

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  async function connect(token?: string): Promise<Socket> {
    const socket = io(url, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  const emitWithAck = (socket: Socket, event: string, payload?: unknown) =>
    socket.timeout(2000).emitWithAck(event, payload) as Promise<{
      ok: boolean;
    }>;

  const waitFor = <T = any>(socket: Socket, event: string, timeoutMs = 2000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`"${event}" not received`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  // Resolves true if the event arrives within the window.
  const receives = (socket: Socket, event: string, windowMs = 300) =>
    waitFor(socket, event, windowMs).then(
      () => true,
      () => false,
    );

  const bid = (user: TestUser, lotId: string, amountCents: number) =>
    request(app.getHttpServer())
      .post(`/api/lots/${lotId}/bids`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ amountCents });

  it('anonymous viewers in the lot room receive new bids without personal data', async () => {
    const lot = await createLotInDb(app, auctioneer.user.id);
    const viewer = await connect();
    expect(await emitWithAck(viewer, 'lot:join', { lotId: lot.id })).toEqual({
      ok: true,
    });

    const event = waitFor(viewer, 'lot:bid');
    await bid(ana, lot.id, 100_000).expect(201);
    const payload = await event;

    expect(payload).toMatchObject({
      lotId: lot.id,
      bid: { sequence: 1, amountCents: 100_000 },
      lot: {
        currentBidCents: 100_000,
        nextMinimumBidCents: 110_000,
        bidCount: 1,
      },
      extended: false,
    });
    expect(payload.bid.bidderPseudonym).toMatch(/^Licitante #/);
    const text = JSON.stringify(payload);
    expect(text).not.toContain(ana.user.id);
    expect(text).not.toContain(ana.user.email);
  });

  it('sends the new end time when anti-sniping extends the lot', async () => {
    const lot = await createLotInDb(app, auctioneer.user.id, {
      endsAt: new Date(Date.now() + 30_000),
    });
    const viewer = await connect();
    await emitWithAck(viewer, 'lot:join', { lotId: lot.id });

    const event = waitFor(viewer, 'lot:bid');
    await bid(ana, lot.id, 100_000).expect(201);
    const payload = await event;

    expect(payload.extended).toBe(true);
    expect(new Date(payload.lot.endsAt).getTime()).toBeGreaterThan(
      lot.endsAt.getTime(),
    );
  });

  it('notifies only the outbid user privately, and updates both wallets', async () => {
    const lot = await createLotInDb(app, auctioneer.user.id);
    await bid(ana, lot.id, 100_000).expect(201);
    const anaSocket = await connect(ana.token);
    const brunoSocket = await connect(bruno.token);
    const outsider = await connect(
      (await registerUser(app, { role: 'BIDDER' })).token,
    );

    const anaOutbid = waitFor(anaSocket, 'user:outbid');
    const anaWallet = waitFor(anaSocket, 'wallet:updated');
    const brunoWallet = waitFor(brunoSocket, 'wallet:updated');
    const outsiderGotIt = receives(outsider, 'user:outbid');
    const brunoGotOutbid = receives(brunoSocket, 'user:outbid');

    await bid(bruno, lot.id, 120_000).expect(201);

    expect(await anaOutbid).toMatchObject({
      lotId: lot.id,
      currentBidCents: 120_000,
      nextMinimumBidCents: 130_000,
    });
    await anaWallet;
    await brunoWallet;
    expect(await outsiderGotIt).toBe(false);
    expect(await brunoGotOutbid).toBe(false);
  });

  it('updates the showcase cards', async () => {
    const lot = await createLotInDb(app, auctioneer.user.id);
    const viewer = await connect();
    await emitWithAck(viewer, 'showcase:join');

    const event = waitFor(viewer, 'showcase:update');
    await bid(ana, lot.id, 100_000).expect(201);

    expect(await event).toMatchObject({
      lotId: lot.id,
      currentBidCents: 100_000,
      bidCount: 1,
    });
  });

  it('does not broadcast rejected bids', async () => {
    const lot = await createLotInDb(app, auctioneer.user.id);
    const viewer = await connect();
    await emitWithAck(viewer, 'lot:join', { lotId: lot.id });

    const got = receives(viewer, 'lot:bid');
    await bid(ana, lot.id, 1).expect(422);

    expect(await got).toBe(false);
  });

  it('only sends lot events to viewers of that lot', async () => {
    const [lot1, lot2] = [
      await createLotInDb(app, auctioneer.user.id),
      await createLotInDb(app, auctioneer.user.id),
    ];
    const viewer = await connect();
    await emitWithAck(viewer, 'lot:join', { lotId: lot2.id });

    const got = receives(viewer, 'lot:bid');
    await bid(ana, lot1.id, 100_000).expect(201);

    expect(await got).toBe(false);
  });

  it('announces a cancelled lot to its room and to the showcase', async () => {
    const lot = await createLotInDb(app, auctioneer.user.id);
    const roomViewer = await connect();
    const showcaseViewer = await connect();
    await emitWithAck(roomViewer, 'lot:join', { lotId: lot.id });
    await emitWithAck(showcaseViewer, 'showcase:join');

    const inRoom = waitFor(roomViewer, 'lot:cancelled');
    const inShowcase = waitFor(showcaseViewer, 'lot:cancelled');
    await request(app.getHttpServer())
      .post(`/api/lots/${lot.id}/cancel`)
      .set('Authorization', `Bearer ${auctioneer.token}`)
      .expect(200);

    expect(await inRoom).toEqual({ lotId: lot.id });
    expect(await inShowcase).toEqual({ lotId: lot.id });
  });

  it('refuses a connection with an invalid token', async () => {
    await expect(connect('not-a-valid-token')).rejects.toThrow('UNAUTHORIZED');
  });

  it('ignores an invalid lot id when joining', async () => {
    const viewer = await connect();
    expect(await emitWithAck(viewer, 'lot:join', { lotId: 'x' })).toEqual({
      ok: false,
    });
  });
});
