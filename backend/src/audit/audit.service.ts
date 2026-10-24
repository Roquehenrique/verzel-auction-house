import { Injectable, NotFoundException } from '@nestjs/common';
import { createPublicKey } from 'node:crypto';
import { CHAIN_VERSION, ChainIssue, GENESIS_HASH } from '../bids/bid-chain.js';
import { BidSignerService } from '../bids/bid-signer.service.js';
import { formatBRL } from '../common/money.js';
import { getLotStatus } from '../lots/lot-status.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuditCheck = 'chain' | 'bidders' | 'lotState' | 'rules' | 'receipt';

export interface AuditIssue extends ChainIssue {
  check: AuditCheck;
}

// Public, login-free audit of a lot's bid history.
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: BidSignerService,
  ) {}

  publicKey() {
    const pem = this.signer.publicKeyPem();
    // Raw 32-byte key: what browser libraries (WebCrypto / noble) expect.
    const jwk = createPublicKey(pem).export({ format: 'jwk' });
    return {
      algorithm: 'Ed25519',
      publicKeyPem: pem,
      publicKeyBase64: Buffer.from(jwk.x!, 'base64url').toString('base64'),
      bidHash: {
        algorithm: 'SHA-256 (hex)',
        format: `${CHAIN_VERSION}|lotId|sequence|bidderPseudonym|amountCents|createdAt(ISO 8601)|prevHash`,
        genesisPrevHash: GENESIS_HASH,
        signedMessage: 'the hash hex string (UTF-8), signature in base64',
      },
      receiptHash: {
        algorithm: 'SHA-256 (hex)',
        format:
          'receipt-v1|lotId|winnerPseudonym|amountCents|bidCount|chainHeadHash|issuedAt(ISO 8601)',
      },
    };
  }

  async auditLot(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        bids: { orderBy: { sequence: 'asc' } },
        receipt: true,
      },
    });
    if (!lot) throw new NotFoundException('Lote não encontrado');

    const bids = lot.bids;
    const last = bids.at(-1);
    const issues: AuditIssue[] = [];
    const add = (check: AuditCheck, sequence: number | null, problem: string) =>
      issues.push({ check, sequence, problem });

    // 1. Hash chain and signatures.
    for (const issue of this.signer.verifyChain(bids)) {
      add('chain', issue.sequence, issue.problem);
    }

    // 2. Each bid really belongs to the user recorded as its bidder
    //    (needs the pseudonym secret, so only the server can check it).
    for (const bid of bids) {
      if (this.signer.pseudonym(lot.id, bid.bidderId) !== bid.bidderPseudonym) {
        add(
          'bidders',
          bid.sequence,
          'o licitante registrado não corresponde ao pseudônimo assinado',
        );
      }
    }

    // 3. The lot's current state must match the end of the chain.
    if (lot.bidCount !== bids.length) {
      add(
        'lotState',
        null,
        `o lote informa ${lot.bidCount} lance(s), mas o histórico tem ${bids.length}`,
      );
    }
    if ((lot.lastBidHash ?? null) !== (last?.hash ?? null)) {
      add(
        'lotState',
        null,
        'o último hash registrado no lote não é o do último lance',
      );
    }
    if ((lot.currentBidCents ?? null) !== (last?.amountCents ?? null)) {
      add(
        'lotState',
        null,
        'o lance atual do lote não é o valor do último lance',
      );
    }
    if ((lot.currentLeaderId ?? null) !== (last?.bidderId ?? null)) {
      add(
        'lotState',
        null,
        'o líder atual do lote não é o autor do último lance',
      );
    }

    // 4. Bid rules, re-checked on the stored data.
    bids.forEach((bid, index) => {
      const previous = bids[index - 1];
      if (!previous) {
        if (bid.amountCents < lot.startingBidCents) {
          add(
            'rules',
            bid.sequence,
            `primeiro lance abaixo do lance inicial (${formatBRL(lot.startingBidCents)})`,
          );
        }
      } else {
        if (bid.amountCents < previous.amountCents + lot.minIncrementCents) {
          add(
            'rules',
            bid.sequence,
            'lance abaixo do anterior + incremento mínimo',
          );
        }
        if (bid.bidderPseudonym === previous.bidderPseudonym) {
          add('rules', bid.sequence, 'o líder cobriu o próprio lance');
        }
        if (bid.createdAt < previous.createdAt) {
          add('rules', bid.sequence, 'horário anterior ao do lance anterior');
        }
      }
      if (bid.createdAt < lot.startsAt || bid.createdAt >= lot.endsAt) {
        add('rules', bid.sequence, 'lance fora do período do lote');
      }
      if (lot.cancelledAt && bid.createdAt >= lot.cancelledAt) {
        add(
          'rules',
          bid.sequence,
          'lance registrado depois do cancelamento do lote',
        );
      }
    });

    // 5. Receipt: signed at settlement with the chain head, so it also protects
    //    the history of settled lots against deletions.
    const receipt = lot.receipt;
    let receiptView = null;
    if (receipt) {
      const signatureValid = this.signer.verifyReceipt(
        {
          lotId: lot.id,
          winnerPseudonym: receipt.winnerPseudonym,
          amountCents: receipt.amountCents,
          bidCount: lot.bidCount,
          chainHeadHash: receipt.chainHeadHash,
          issuedAt: receipt.issuedAt,
        },
        receipt.signature,
      );
      if (!signatureValid)
        add('receipt', null, 'assinatura do comprovante inválida');
      if (!last || receipt.chainHeadHash !== last.hash) {
        add(
          'receipt',
          null,
          'o comprovante não aponta para o último lance do histórico',
        );
      }
      if (last && receipt.amountCents !== last.amountCents) {
        add('receipt', null, 'o valor do comprovante difere do último lance');
      }
      if (last && receipt.winnerPseudonym !== last.bidderPseudonym) {
        add(
          'receipt',
          null,
          'o vencedor do comprovante não é o autor do último lance',
        );
      }
      receiptView = {
        winnerPseudonym: receipt.winnerPseudonym,
        amountCents: receipt.amountCents,
        chainHeadHash: receipt.chainHeadHash,
        issuedAt: receipt.issuedAt,
        signature: receipt.signature,
        signatureValid,
      };
    } else if (lot.settledAt && bids.length > 0) {
      add('receipt', null, 'lote arrematado sem comprovante');
    }

    const now = new Date();
    return {
      lot: {
        id: lot.id,
        title: lot.title,
        status: getLotStatus(lot, now),
        startingBidCents: lot.startingBidCents,
        minIncrementCents: lot.minIncrementCents,
        startsAt: lot.startsAt,
        endsAt: lot.endsAt,
        settledAt: lot.settledAt,
        cancelledAt: lot.cancelledAt,
        cancelReason: lot.cancelReason,
        bidCount: lot.bidCount,
        lastBidHash: lot.lastBidHash,
      },
      // Everything needed to recompute the chain independently (no user ids).
      bids: bids.map((bid) => ({
        sequence: bid.sequence,
        bidderPseudonym: bid.bidderPseudonym,
        amountCents: bid.amountCents,
        createdAt: bid.createdAt,
        prevHash: bid.prevHash,
        hash: bid.hash,
        signature: bid.signature,
      })),
      receipt: receiptView,
      verification: {
        intact: issues.length === 0,
        issues,
        checkedAt: now,
      },
    };
  }
}
