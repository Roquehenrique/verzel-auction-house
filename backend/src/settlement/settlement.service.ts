import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { BidSignerService } from '../bids/bid-signer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuctionEventsService } from '../realtime/auction-events.service.js';

const DEFAULT_INTERVAL_MS = 5_000;
const BATCH_SIZE = 50;

export interface SettlementOutcome {
  lotId: string;
  title: string;
  auctioneerId: string;
  sold: boolean;
  winnerId: string | null;
  winnerPseudonym: string | null;
  amountCents: number | null;
  shareCode: string | null;
}

// Closes lots whose end time has passed:
//   - no bids  -> closed without a winner
//   - with bids -> winner debited, auctioneer credited, signed receipt issued
// Runs every few seconds. Each lot is settled in its own transaction with the
// lot row locked and `settledAt` re-checked, so running it twice (or on two
// API instances at once) never charges anyone twice.
@Injectable()
export class SettlementService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SettlementService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: BidSignerService,
    private readonly config: ConfigService,
    @Optional() private readonly events?: AuctionEventsService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get('SETTLEMENT_JOB_ENABLED') === 'false') return;
    const interval = Number(
      this.config.get('SETTLEMENT_INTERVAL_MS') ?? DEFAULT_INTERVAL_MS,
    );
    this.timer = setInterval(() => void this.runOnce(), interval);
    this.timer.unref(); // never keeps the process alive on shutdown
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  // A slow run is never overlapped by the next tick.
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.settleDueLots();
    } catch (error) {
      this.logger.error('Settlement run failed', error as Error);
    } finally {
      this.running = false;
    }
  }

  async settleDueLots(): Promise<SettlementOutcome[]> {
    const due = await this.prisma.lot.findMany({
      where: {
        settledAt: null,
        cancelledAt: null,
        endsAt: { lte: new Date() },
      },
      select: { id: true },
      orderBy: { endsAt: 'asc' },
      take: BATCH_SIZE,
    });

    const settled: SettlementOutcome[] = [];
    for (const { id } of due) {
      try {
        const outcome = await this.settleLot(id);
        if (outcome) settled.push(outcome);
      } catch (error) {
        // One failing lot must not block the others; it is retried next run.
        this.logger.error(`Could not settle lot ${id}`, error as Error);
      }
    }
    return settled;
  }

  // Returns null when there was nothing to do (already settled, cancelled,
  // extended by a last-second bid, or locked by a bid in progress).
  async settleLot(lotId: string): Promise<SettlementOutcome | null> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      // SKIP LOCKED: if a bid is being processed on this lot right now, skip it
      // instead of waiting; the next run settles it (the bid may extend it).
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM lots WHERE id = ${lotId}::uuid FOR UPDATE SKIP LOCKED`;
      if (locked.length === 0) return null;

      const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });
      const now = new Date();
      // Re-checked under the lock (the lot may have been extended meanwhile).
      if (lot.settledAt || lot.cancelledAt || lot.endsAt > now) return null;

      const base = {
        lotId,
        title: lot.title,
        auctioneerId: lot.auctioneerId,
      };

      if (
        lot.bidCount === 0 ||
        lot.currentLeaderId === null ||
        lot.currentBidCents === null ||
        lot.lastBidHash === null
      ) {
        await tx.lot.update({ where: { id: lotId }, data: { settledAt: now } });
        return {
          ...base,
          sold: false,
          winnerId: null,
          winnerPseudonym: null,
          amountCents: null,
          shareCode: null,
        };
      }

      const winnerId = lot.currentLeaderId;
      const amountCents = lot.currentBidCents;

      // Same lock order as bids (by user id) to avoid deadlocks.
      const walletIds = [winnerId, lot.auctioneerId].sort();
      await tx.$queryRaw`
        SELECT user_id FROM wallets
        WHERE user_id = ANY(${walletIds}::uuid[])
        ORDER BY user_id FOR UPDATE`;

      // The amount was already committed while the winner was leading:
      // it leaves both the total and the committed balance.
      await tx.wallet.update({
        where: { userId: winnerId },
        data: {
          balanceCents: { decrement: amountCents },
          committedCents: { decrement: amountCents },
        },
      });
      await tx.wallet.update({
        where: { userId: lot.auctioneerId },
        data: { balanceCents: { increment: amountCents } },
      });
      await tx.ledgerEntry.createMany({
        data: [
          { userId: winnerId, type: 'PURCHASE', amountCents, lotId },
          { userId: lot.auctioneerId, type: 'SALE', amountCents, lotId },
        ],
      });

      const winnerPseudonym = this.signer.pseudonym(lotId, winnerId);
      const shareCode = randomBytes(16).toString('base64url'); // unguessable link
      await tx.receipt.create({
        data: {
          lotId,
          winnerId,
          winnerPseudonym,
          amountCents,
          shareCode,
          chainHeadHash: lot.lastBidHash,
          issuedAt: now,
          signature: this.signer.signReceipt({
            lotId,
            winnerPseudonym,
            amountCents,
            bidCount: lot.bidCount,
            chainHeadHash: lot.lastBidHash,
            issuedAt: now,
          }),
        },
      });
      await tx.lot.update({ where: { id: lotId }, data: { settledAt: now } });

      return {
        ...base,
        sold: true,
        winnerId,
        winnerPseudonym,
        amountCents,
        shareCode,
      };
    });

    if (outcome) {
      this.logger.log(
        `Lot ${lotId} settled: ${outcome.sold ? `sold for ${outcome.amountCents} cents` : 'no bids'}`,
      );
      this.events?.lotEnded(outcome); // after the commit
    }
    return outcome;
  }
}
