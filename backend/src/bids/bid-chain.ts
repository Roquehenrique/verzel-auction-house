import {
  createHash,
  createHmac,
  KeyObject,
  sign as edSign,
  verify as edVerify,
} from 'node:crypto';

// Tamper-evident bid history
// ---------------------------
// Every bid is a link of a hash chain: its hash covers its own data AND the hash
// of the previous bid. Changing, removing or inserting any bid breaks every hash
// after it. Each hash is also signed (Ed25519) with a private key that lives
// outside the database, so someone with database access cannot simply recompute
// the chain: they would also need the key.

export const CHAIN_VERSION = 'v1';

// prevHash of the first bid of every lot.
export const GENESIS_HASH = '0'.repeat(64);

export interface BidLink {
  lotId: string;
  sequence: number;
  bidderPseudonym: string;
  amountCents: number;
  createdAt: Date;
  prevHash: string;
}

// The exact text that is hashed. Kept simple and documented so anyone can
// recompute it (the audit page does it in the browser).
export function canonicalBidString(bid: BidLink): string {
  return [
    CHAIN_VERSION,
    bid.lotId,
    bid.sequence,
    bid.bidderPseudonym,
    bid.amountCents,
    bid.createdAt.toISOString(),
    bid.prevHash,
  ].join('|');
}

export function computeBidHash(bid: BidLink): string {
  return createHash('sha256').update(canonicalBidString(bid)).digest('hex');
}

export function signHash(hash: string, privateKey: KeyObject): string {
  return edSign(null, Buffer.from(hash, 'utf8'), privateKey).toString('base64');
}

export function verifyHashSignature(
  hash: string,
  signature: string,
  publicKey: KeyObject,
): boolean {
  try {
    return edVerify(
      null,
      Buffer.from(hash, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

// Public, non-identifying name of a bidder within ONE lot. Stable inside the lot
// (the history reads well) but different across lots, so the same person cannot
// be tracked from auction to auction.
export function computePseudonym(
  secret: string,
  lotId: string,
  userId: string,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${lotId}:${userId}`)
    .digest('hex');
  return `Licitante #${digest.slice(0, 6).toUpperCase()}`;
}

export interface StoredBid extends BidLink {
  hash: string;
  signature: string;
}

export interface ChainIssue {
  sequence: number | null; // null when the problem is about the lot itself
  problem: string;
}

// Recomputes the whole chain of a lot and reports every inconsistency.
// Bids must be ordered by sequence.
export function verifyBidChain(
  bids: StoredBid[],
  publicKey: KeyObject,
): ChainIssue[] {
  const issues: ChainIssue[] = [];
  let expectedPrevHash = GENESIS_HASH;

  bids.forEach((bid, index) => {
    const expectedSequence = index + 1;
    if (bid.sequence !== expectedSequence) {
      issues.push({
        sequence: bid.sequence,
        problem: `sequência esperada ${expectedSequence}, encontrada ${bid.sequence} (lance removido ou inserido)`,
      });
    }
    if (bid.prevHash !== expectedPrevHash) {
      issues.push({
        sequence: bid.sequence,
        problem: 'não aponta para o lance anterior (corrente quebrada)',
      });
    }
    if (computeBidHash(bid) !== bid.hash) {
      issues.push({
        sequence: bid.sequence,
        problem: 'dados alterados: o hash não confere com o conteúdo do lance',
      });
    }
    if (!verifyHashSignature(bid.hash, bid.signature, publicKey)) {
      issues.push({
        sequence: bid.sequence,
        problem:
          'assinatura inválida: o lance não foi registrado pelo servidor',
      });
    }
    expectedPrevHash = bid.hash;
  });

  return issues;
}
