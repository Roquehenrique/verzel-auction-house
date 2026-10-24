import { verifyAsync } from "@noble/ed25519";

// Independent verification of the bid history IN THE BROWSER, using only the
// public data of the audit endpoint and the server's public key. It does not
// trust the server's verdict: hashes and signatures are recomputed here,
// following the format published at GET /api/audit/public-key.

export const GENESIS_HASH = "0".repeat(64);

export interface AuditBid {
  sequence: number;
  bidderPseudonym: string;
  amountCents: number;
  createdAt: string; // ISO 8601 with milliseconds, exactly as hashed
  prevHash: string;
  hash: string;
  signature: string; // base64
}

export interface AuditReceipt {
  winnerPseudonym: string;
  amountCents: number;
  chainHeadHash: string;
  issuedAt: string;
  signature: string;
}

export interface BidCheck {
  sequence: number;
  sequenceOk: boolean;
  linkOk: boolean; // prevHash points to the previous bid
  hashOk: boolean; // recomputed SHA-256 equals the stored hash
  signatureOk: boolean; // Ed25519 signature valid for the server key
}

export interface BrowserVerification {
  bids: BidCheck[];
  lotStateOk: boolean; // the lot's last hash / bid count match the chain
  receiptOk: boolean | null; // null when there is no receipt
  intact: boolean;
}

const encoder = new TextEncoder();

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

// The server signs the hash hex string (UTF-8).
async function verifySignature(hash: string, signatureBase64: string, publicKey: Uint8Array) {
  try {
    return await verifyAsync(base64ToBytes(signatureBase64), encoder.encode(hash), publicKey);
  } catch {
    return false;
  }
}

export function canonicalBid(lotId: string, bid: AuditBid): string {
  return ["v1", lotId, bid.sequence, bid.bidderPseudonym, bid.amountCents, bid.createdAt, bid.prevHash].join("|");
}

export function canonicalReceipt(lotId: string, bidCount: number, receipt: AuditReceipt): string {
  return [
    "receipt-v1",
    lotId,
    receipt.winnerPseudonym,
    receipt.amountCents,
    bidCount,
    receipt.chainHeadHash,
    receipt.issuedAt,
  ].join("|");
}

export async function verifyInBrowser(params: {
  lotId: string;
  bids: AuditBid[]; // ordered by sequence
  lotBidCount: number;
  lotLastBidHash: string | null;
  receipt: AuditReceipt | null;
  publicKeyBase64: string;
}): Promise<BrowserVerification> {
  const publicKey = base64ToBytes(params.publicKeyBase64);

  const checks: BidCheck[] = [];
  let expectedPrev = GENESIS_HASH;
  for (const [index, bid] of params.bids.entries()) {
    const recomputed = await sha256Hex(canonicalBid(params.lotId, bid));
    checks.push({
      sequence: bid.sequence,
      sequenceOk: bid.sequence === index + 1,
      linkOk: bid.prevHash === expectedPrev,
      hashOk: recomputed === bid.hash,
      signatureOk: await verifySignature(bid.hash, bid.signature, publicKey),
    });
    expectedPrev = bid.hash;
  }

  const last = params.bids.at(-1);
  const lotStateOk =
    params.lotBidCount === params.bids.length && (params.lotLastBidHash ?? null) === (last?.hash ?? null);

  let receiptOk: boolean | null = null;
  if (params.receipt) {
    const receiptHash = await sha256Hex(canonicalReceipt(params.lotId, params.lotBidCount, params.receipt));
    receiptOk =
      (await verifySignature(receiptHash, params.receipt.signature, publicKey)) &&
      params.receipt.chainHeadHash === last?.hash;
  }

  const bidsOk = checks.every((c) => c.sequenceOk && c.linkOk && c.hashOk && c.signatureOk);
  return { bids: checks, lotStateOk, receiptOk, intact: bidsOk && lotStateOk && receiptOk !== false };
}

// Verifies only a receipt signature (receipt page).
export async function verifyReceiptInBrowser(params: {
  lotId: string;
  bidCount: number;
  receipt: AuditReceipt;
  publicKeyBase64: string;
}): Promise<boolean> {
  const hash = await sha256Hex(canonicalReceipt(params.lotId, params.bidCount, params.receipt));
  return verifySignature(hash, params.receipt.signature, base64ToBytes(params.publicKeyBase64));
}
