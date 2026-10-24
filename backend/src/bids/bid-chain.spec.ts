import { generateKeyPairSync } from 'node:crypto';
import {
  canonicalBidString,
  computeBidHash,
  computePseudonym,
  GENESIS_HASH,
  signHash,
  StoredBid,
  verifyBidChain,
} from './bid-chain.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const LOT = '6f1c2a3e-0000-4000-8000-000000000001';

function buildChain(amounts: number[]): StoredBid[] {
  const chain: StoredBid[] = [];
  let prevHash = GENESIS_HASH;
  amounts.forEach((amountCents, index) => {
    const link = {
      lotId: LOT,
      sequence: index + 1,
      bidderPseudonym: `Licitante #00000${index % 2}`,
      amountCents,
      createdAt: new Date(Date.UTC(2026, 0, 1, 10, 0, index)),
      prevHash,
    };
    const hash = computeBidHash(link);
    chain.push({ ...link, hash, signature: signHash(hash, privateKey) });
    prevHash = hash;
  });
  return chain;
}

describe('bid chain', () => {
  it('uses a documented canonical string', () => {
    const [bid] = buildChain([100_000]);
    expect(canonicalBidString(bid)).toBe(
      `v1|${LOT}|1|Licitante #000000|100000|2026-01-01T10:00:00.000Z|${GENESIS_HASH}`,
    );
  });

  it('accepts an intact chain', () => {
    expect(verifyBidChain(buildChain([100, 200, 300]), publicKey)).toEqual([]);
  });

  it('accepts a lot without bids', () => {
    expect(verifyBidChain([], publicKey)).toEqual([]);
  });

  it('detects a changed amount', () => {
    const chain = buildChain([100, 200, 300]);
    chain[1].amountCents = 999;
    const issues = verifyBidChain(chain, publicKey);
    expect(issues).toEqual([
      expect.objectContaining({
        sequence: 2,
        problem: expect.stringMatching(/dados alterados/),
      }),
    ]);
  });

  it('detects a changed amount even if the attacker recomputes the hashes (signature)', () => {
    const chain = buildChain([100, 200, 300]);
    chain[1].amountCents = 999;
    // recompute every hash from the tampered bid on, without the private key
    for (let i = 1; i < chain.length; i++) {
      chain[i].prevHash = chain[i - 1].hash;
      chain[i].hash = computeBidHash(chain[i]);
    }
    const problems = verifyBidChain(chain, publicKey).map(
      (issue) => issue.problem,
    );
    expect(
      problems.some((problem) => /assinatura inválida/.test(problem)),
    ).toBe(true);
  });

  it('detects a removed bid in the middle', () => {
    const chain = buildChain([100, 200, 300]);
    chain.splice(1, 1);
    const issues = verifyBidChain(chain, publicKey);
    expect(issues.map((issue) => issue.problem)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/sequência esperada 2/),
        expect.stringMatching(/corrente quebrada/),
      ]),
    );
  });

  it('detects an inserted bid', () => {
    const chain = buildChain([100, 200]);
    const forged = {
      ...chain[1],
      sequence: 3,
      amountCents: 50,
      prevHash: chain[1].hash,
    };
    forged.hash = computeBidHash(forged);
    forged.signature = signHash(
      forged.hash,
      generateKeyPairSync('ed25519').privateKey,
    );
    const issues = verifyBidChain([...chain, forged], publicKey);
    expect(issues).toEqual([
      expect.objectContaining({
        sequence: 3,
        problem: expect.stringMatching(/assinatura inválida/),
      }),
    ]);
  });

  describe('computePseudonym', () => {
    it('is stable for the same lot and user', () => {
      expect(computePseudonym('s', 'lot-1', 'user-1')).toBe(
        computePseudonym('s', 'lot-1', 'user-1'),
      );
    });

    it('differs across lots (cannot track a bidder between auctions)', () => {
      expect(computePseudonym('s', 'lot-1', 'user-1')).not.toBe(
        computePseudonym('s', 'lot-2', 'user-1'),
      );
    });

    it('has a friendly format and depends on the secret', () => {
      expect(computePseudonym('s', 'lot-1', 'user-1')).toMatch(
        /^Licitante #[0-9A-F]{6}$/,
      );
      expect(computePseudonym('a', 'lot-1', 'user-1')).not.toBe(
        computePseudonym('b', 'lot-1', 'user-1'),
      );
    });
  });
});
