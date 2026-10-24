import { INestApplication } from '@nestjs/common';
import { createHash, createPublicKey, verify } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { computeBidHash } from '../src/bids/bid-chain.js';
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

interface AuditResponse {
  lot: { id: string; bidCount: number; lastBidHash: string | null };
  bids: Array<{
    sequence: number;
    bidderPseudonym: string;
    amountCents: number;
    createdAt: string;
    prevHash: string;
    hash: string;
    signature: string;
  }>;
  receipt: { signatureValid: boolean } | null;
  verification: {
    intact: boolean;
    issues: Array<{ check: string; sequence: number | null; problem: string }>;
  };
}

describe('Public audit (e2e)', () => {
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
  const audit = async (lotId: string) =>
    (await http().get(`/api/lots/${lotId}/audit`).expect(200))
      .body as AuditResponse;

  // Lot with 3 bids: Ana 100k, Bruno 120k, Ana 140k.
  async function lotWithBids() {
    const lot = await createLotInDb(app, auctioneer.user.id);
    await bid(ana, lot.id, 100_000);
    await bid(bruno, lot.id, 120_000);
    await bid(ana, lot.id, 140_000);
    return lot;
  }

  // Simulates someone editing the database directly (outside the application).
  async function sql(query: string, params: unknown[] = []) {
    const client = await connectToTestDatabase();
    try {
      await client.query(query, params);
    } finally {
      await client.end();
    }
  }

  const problems = (result: AuditResponse) =>
    result.verification.issues.map(
      (issue) => `${issue.check}:${issue.problem}`,
    );

  it('reports an intact history, publicly and without personal data', async () => {
    const lot = await lotWithBids();

    const result = await audit(lot.id);

    expect(result.verification).toEqual({
      intact: true,
      issues: [],
      checkedAt: expect.any(String),
    });
    expect(result.bids.map((b) => b.sequence)).toEqual([1, 2, 3]);
    const text = JSON.stringify(result);
    for (const secret of [
      ana.user.id,
      bruno.user.id,
      ana.user.email,
      'Bruno',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('reports a lot without bids as intact', async () => {
    const lot = await createLotInDb(app, auctioneer.user.id);
    expect((await audit(lot.id)).verification.intact).toBe(true);
  });

  it('lets anyone verify the chain with the public key alone (no trust in the server)', async () => {
    const lot = await lotWithBids();
    const result = await audit(lot.id);
    const keyInfo = (await http().get('/api/audit/public-key').expect(200))
      .body;
    const publicKey = createPublicKey(keyInfo.publicKeyPem);

    let prevHash = '0'.repeat(64);
    for (const b of result.bids) {
      const text = [
        'v1',
        lot.id,
        b.sequence,
        b.bidderPseudonym,
        b.amountCents,
        b.createdAt,
        prevHash,
      ].join('|');
      expect(createHash('sha256').update(text).digest('hex')).toBe(b.hash);
      expect(b.prevHash).toBe(prevHash);
      expect(
        verify(
          null,
          Buffer.from(b.hash),
          publicKey,
          Buffer.from(b.signature, 'base64'),
        ),
      ).toBe(true);
      prevHash = b.hash;
    }
    expect(Buffer.from(keyInfo.publicKeyBase64, 'base64')).toHaveLength(32);
  });

  describe('detects tampering done directly in the database', () => {
    it('a changed amount', async () => {
      const lot = await lotWithBids();
      await sql(
        'UPDATE bids SET amount_cents = 1 WHERE lot_id = $1 AND sequence = 2',
        [lot.id],
      );

      const result = await audit(lot.id);

      expect(result.verification.intact).toBe(false);
      expect(problems(result)).toContain(
        'chain:dados alterados: o hash não confere com o conteúdo do lance',
      );
    });

    it('a changed amount with all hashes recomputed (attacker without the private key)', async () => {
      const lot = await lotWithBids();
      const bids = await prisma.bid.findMany({
        where: { lotId: lot.id },
        orderBy: { sequence: 'asc' },
      });
      bids[1].amountCents = 125_000;
      for (let i = 1; i < bids.length; i++) {
        bids[i].prevHash = bids[i - 1].hash;
        bids[i].hash = computeBidHash(bids[i]);
        await sql(
          'UPDATE bids SET amount_cents = $1, prev_hash = $2, hash = $3 WHERE id = $4',
          [bids[i].amountCents, bids[i].prevHash, bids[i].hash, bids[i].id],
        );
      }
      await sql('UPDATE lots SET last_bid_hash = $1 WHERE id = $2', [
        bids[2].hash,
        lot.id,
      ]);

      const result = await audit(lot.id);

      expect(result.verification.intact).toBe(false);
      expect(problems(result)).toContain(
        'chain:assinatura inválida: o lance não foi registrado pelo servidor',
      );
    });

    it('a deleted bid in the middle', async () => {
      const lot = await lotWithBids();
      await sql('DELETE FROM bids WHERE lot_id = $1 AND sequence = 2', [
        lot.id,
      ]);

      const result = await audit(lot.id);

      expect(result.verification.intact).toBe(false);
      expect(problems(result)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^chain:sequência esperada 2/),
          'chain:não aponta para o lance anterior (corrente quebrada)',
          'lotState:o lote informa 3 lance(s), mas o histórico tem 2',
        ]),
      );
    });

    it('the last bid deleted', async () => {
      const lot = await lotWithBids();
      await sql('DELETE FROM bids WHERE lot_id = $1 AND sequence = 3', [
        lot.id,
      ]);

      const result = await audit(lot.id);

      expect(problems(result)).toEqual(
        expect.arrayContaining([
          'lotState:o último hash registrado no lote não é o do último lance',
          'lotState:o lance atual do lote não é o valor do último lance',
        ]),
      );
    });

    it('a bid moved to another user (bidder swapped)', async () => {
      const lot = await lotWithBids();
      await sql(
        'UPDATE bids SET bidder_id = $1 WHERE lot_id = $2 AND sequence = 2',
        [ana.user.id, lot.id],
      );

      const result = await audit(lot.id);

      expect(problems(result)).toContain(
        'bidders:o licitante registrado não corresponde ao pseudônimo assinado',
      );
    });

    it('a lot rule changed after the bids (starting bid raised)', async () => {
      const lot = await lotWithBids();
      await sql('UPDATE lots SET starting_bid_cents = 110000 WHERE id = $1', [
        lot.id,
      ]);

      const result = await audit(lot.id);

      expect(problems(result)).toEqual([
        'rules:primeiro lance abaixo do lance inicial (R$ 1.100,00)',
      ]);
    });

    it('a changed receipt', async () => {
      const lot = await lotWithBids();
      const past = new Date(); // ends now, after the bids
      await prisma.lot.update({
        where: { id: lot.id },
        data: { endsAt: past, originalEndsAt: past },
      });
      await app.get(SettlementService).settleLot(lot.id);
      expect((await audit(lot.id)).verification.intact).toBe(true);

      await sql('UPDATE receipts SET amount_cents = 1 WHERE lot_id = $1', [
        lot.id,
      ]);

      const result = await audit(lot.id);
      expect(result.receipt?.signatureValid).toBe(false);
      expect(problems(result)).toEqual(
        expect.arrayContaining([
          'receipt:assinatura do comprovante inválida',
          'receipt:o valor do comprovante difere do último lance',
        ]),
      );
    });

    it('the whole history of a settled lot erased (lot reset to "no bids")', async () => {
      const lot = await lotWithBids();
      const past = new Date(); // ends now, after the bids
      await prisma.lot.update({
        where: { id: lot.id },
        data: { endsAt: past, originalEndsAt: past },
      });
      await app.get(SettlementService).settleLot(lot.id);

      await sql('DELETE FROM bids WHERE lot_id = $1', [lot.id]);
      await sql(
        `UPDATE lots SET bid_count = 0, current_bid_cents = NULL,
           current_leader_id = NULL, last_bid_hash = NULL WHERE id = $1`,
        [lot.id],
      );

      const result = await audit(lot.id);

      expect(result.verification.intact).toBe(false);
      expect(problems(result)).toEqual(
        expect.arrayContaining([
          'receipt:assinatura do comprovante inválida',
          'receipt:o comprovante não aponta para o último lance do histórico',
        ]),
      );
    });
  });

  it('returns 404 for an unknown lot', async () => {
    await http().get(`/api/lots/${crypto.randomUUID()}/audit`).expect(404);
  });
});
