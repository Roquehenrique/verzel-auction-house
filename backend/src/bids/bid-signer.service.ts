import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createPublicKey, KeyObject } from 'node:crypto';
import {
  computePseudonym,
  computeReceiptHash,
  ReceiptData,
  signHash,
  StoredBid,
  verifyBidChain,
  verifyHashSignature,
} from './bid-chain.js';

// Holds the secrets of the bid history. They come from the environment and are
// never stored in the database.
@Injectable()
export class BidSignerService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly pseudonymSecret: string;

  constructor(config: ConfigService) {
    this.privateKey = parsePrivateKey(
      config.getOrThrow<string>('BID_SIGNING_PRIVATE_KEY'),
    );
    this.publicKey = createPublicKey(this.privateKey);
    this.pseudonymSecret = config.getOrThrow<string>('PSEUDONYM_SECRET');
  }

  sign(hash: string): string {
    return signHash(hash, this.privateKey);
  }

  pseudonym(lotId: string, userId: string): string {
    return computePseudonym(this.pseudonymSecret, lotId, userId);
  }

  verifyChain(bids: StoredBid[]) {
    return verifyBidChain(bids, this.publicKey);
  }

  signReceipt(receipt: ReceiptData): string {
    return signHash(computeReceiptHash(receipt), this.privateKey);
  }

  verifyReceipt(receipt: ReceiptData, signature: string): boolean {
    return verifyHashSignature(
      computeReceiptHash(receipt),
      signature,
      this.publicKey,
    );
  }

  // Published so anyone can verify the signatures without trusting the server.
  publicKeyPem(): string {
    return this.publicKey.export({ format: 'pem', type: 'spki' }).toString();
  }
}

// Ed25519 private key as base64 of the PKCS#8 DER (single line, env friendly).
export function parsePrivateKey(base64: string): KeyObject {
  const key = createPrivateKey({
    key: Buffer.from(base64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('BID_SIGNING_PRIVATE_KEY must be an Ed25519 key');
  }
  return key;
}
