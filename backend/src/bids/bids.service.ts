import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { formatBRL } from '../common/money.js';
import type { Bid } from '../generated/prisma/client.js';
import { getLotStatus } from '../lots/lot-status.js';
import { nextMinimumBidCents, toPublicLot } from '../lots/lot.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuctionEventsService } from '../realtime/auction-events.service.js';
import { computeBidHash, GENESIS_HASH } from './bid-chain.js';
import { BidRejectedException } from './bid-rejection.js';
import { BidSignerService } from './bid-signer.service.js';

// Anti-sniping: a bid accepted in the last 2 minutes moves the end to bid time + 2 minutes.
export const ANTI_SNIPING_MS = 2 * 60 * 1000;

const withAuctioneer = { auctioneer: { select: { name: true } } } as const;

// Public view of a bid: never exposes the bidder's user id (privacy).
export function toPublicBid(bid: Bid) {
  return {
    sequence: bid.sequence,
    bidderPseudonym: bid.bidderPseudonym,
    amountCents: bid.amountCents,
    createdAt: bid.createdAt,
    hash: bid.hash,
  };
}

@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: BidSignerService,
    // Optional so scripts (seed) can place bids without the WebSocket layer.
    @Optional() private readonly events?: AuctionEventsService,
  ) {}

  async placeBid(userId: string, lotId: string, amountCents: number) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1. Lock the lot row: concurrent bids (and cancellations / settlement)
        //    on this lot wait here and run one at a time.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM lots WHERE id = ${lotId}::uuid FOR UPDATE`;
        if (locked.length === 0)
          throw new NotFoundException('Lote não encontrado');
        const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });

        // 2. The clock is read AFTER getting the lock: a bid that waited in line
        //    is judged by the moment it is actually processed.
        const now = new Date();

        // 3. Business rules, in order.
        switch (getLotStatus(lot, now)) {
          case 'SCHEDULED':
            throw new BidRejectedException(
              'LOT_NOT_STARTED',
              'Este lote ainda não foi iniciado',
            );
          case 'ENDED':
            throw new BidRejectedException(
              'LOT_ENDED',
              'Este lote já foi encerrado',
            );
          case 'CANCELLED':
            throw new BidRejectedException(
              'LOT_CANCELLED',
              'Este lote foi cancelado',
            );
        }
        if (lot.currentLeaderId === userId) {
          throw new BidRejectedException(
            'ALREADY_WINNING',
            'Você já está ganhando este lote',
          );
        }
        const minimum = nextMinimumBidCents(lot);
        if (amountCents < minimum) {
          throw new BidRejectedException(
            'BELOW_MINIMUM',
            `Lance abaixo do mínimo. O lance precisa ser de pelo menos ${formatBRL(minimum)}`,
          );
        }

        // 4. Lock the wallets involved, always in the same order (by id) so two
        //    transactions can never wait for each other (deadlock).
        const walletIds = [userId, lot.currentLeaderId]
          .filter((id): id is string => id !== null)
          .sort();
        await tx.$queryRaw`
          SELECT user_id FROM wallets
          WHERE user_id = ANY(${walletIds}::uuid[])
          ORDER BY user_id FOR UPDATE`;

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        const available = wallet.balanceCents - wallet.committedCents;
        if (amountCents > available) {
          throw new BidRejectedException(
            'INSUFFICIENT_BALANCE',
            `Saldo insuficiente. Seu saldo disponível é ${formatBRL(available)}`,
          );
        }

        // 5. Committed balance: the outbid leader gets the money back
        //    immediately; the new leader's amount becomes committed.
        if (lot.currentLeaderId && lot.currentBidCents !== null) {
          await tx.wallet.update({
            where: { userId: lot.currentLeaderId },
            data: { committedCents: { decrement: lot.currentBidCents } },
          });
        }
        await tx.wallet.update({
          where: { userId },
          data: { committedCents: { increment: amountCents } },
        });

        // 6. Anti-sniping.
        const extend = lot.endsAt.getTime() - now.getTime() <= ANTI_SNIPING_MS;
        const endsAt = extend
          ? new Date(now.getTime() + ANTI_SNIPING_MS)
          : lot.endsAt;

        // 7. New link of the hash chain, signed by the server.
        const link = {
          lotId,
          sequence: lot.bidCount + 1,
          bidderPseudonym: this.signer.pseudonym(lotId, userId),
          amountCents,
          createdAt: now,
          prevHash: lot.lastBidHash ?? GENESIS_HASH,
        };
        const hash = computeBidHash(link);
        const bid = await tx.bid.create({
          data: {
            ...link,
            bidderId: userId,
            hash,
            signature: this.signer.sign(hash),
          },
        });

        const updatedLot = await tx.lot.update({
          where: { id: lotId },
          data: {
            currentBidCents: amountCents,
            currentLeaderId: userId,
            bidCount: { increment: 1 },
            lastBidHash: hash,
            endsAt,
          },
          include: withAuctioneer,
        });

        return {
          bid,
          lot: updatedLot,
          previousLeaderId: lot.currentLeaderId,
          extended: extend,
          now,
        };
      },
      // Bids may queue behind the lot lock under heavy load.
      { maxWait: 5_000, timeout: 10_000 },
    );

    const response = {
      bid: toPublicBid(result.bid),
      lot: toPublicLot(result.lot, result.now),
      extended: result.extended,
    };
    // Only after the commit: clients are never told about a rolled-back bid.
    this.events?.bidPlaced({
      ...response,
      bidderId: userId,
      previousLeaderId: result.previousLeaderId,
    });
    return response;
  }

  // Public bid history of a lot (newest first), identified only by pseudonyms.
  async listBids(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { id: true, bids: { orderBy: { sequence: 'desc' } } },
    });
    if (!lot) throw new NotFoundException('Lote não encontrado');
    return {
      lotId,
      leaderPseudonym: lot.bids[0]?.bidderPseudonym ?? null,
      bids: lot.bids.map(toPublicBid),
    };
  }

  // The logged-in bidder's situation in a lot: winning or outbid, and position.
  async myStatus(userId: string, lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { currentLeaderId: true },
    });
    if (!lot) throw new NotFoundException('Lote não encontrado');

    // Highest bid of each bidder, best first.
    const ranking = await this.prisma.bid.groupBy({
      by: ['bidderId'],
      where: { lotId },
      _max: { amountCents: true },
      _count: { _all: true },
      orderBy: { _max: { amountCents: 'desc' } },
    });
    const index = ranking.findIndex((row) => row.bidderId === userId);
    const mine = index >= 0 ? ranking[index] : null;

    return {
      pseudonym: this.signer.pseudonym(lotId, userId),
      hasBid: mine !== null,
      isLeader: lot.currentLeaderId === userId,
      myHighestBidCents: mine?._max.amountCents ?? null,
      myBidCount: mine?._count._all ?? 0,
      position: mine ? index + 1 : null, // 1 = winning
      totalBidders: ranking.length,
    };
  }
}
