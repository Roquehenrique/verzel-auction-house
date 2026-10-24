import type { Lot } from '../generated/prisma/client.js';
import { getLotStatus } from './lot-status.js';

export type LotWithAuctioneer = Lot & { auctioneer: { name: string } };

// Lowest amount the next bid must have:
// first bid >= starting bid; next ones >= current bid + minimum increment.
export function nextMinimumBidCents(
  lot: Pick<
    Lot,
    'bidCount' | 'currentBidCents' | 'startingBidCents' | 'minIncrementCents'
  >,
): number {
  return lot.bidCount === 0 || lot.currentBidCents === null
    ? lot.startingBidCents
    : lot.currentBidCents + lot.minIncrementCents;
}

// What anyone (even without login) can see about a lot. Internal fields such as
// the leader's user id are deliberately left out (privacy).
export function toPublicLot(lot: LotWithAuctioneer, now: Date = new Date()) {
  return {
    id: lot.id,
    title: lot.title,
    make: lot.make,
    model: lot.model,
    year: lot.year,
    description: lot.description,
    imageUrl: lot.imageUrl, // original source; prefer GET /lots/:id/image
    hasImage: lot.imageUrl !== null,
    attributes: lot.attributes,
    externalSource: lot.externalSource,
    startingBidCents: lot.startingBidCents,
    minIncrementCents: lot.minIncrementCents,
    currentBidCents: lot.currentBidCents,
    nextMinimumBidCents: nextMinimumBidCents(lot),
    bidCount: lot.bidCount,
    startsAt: lot.startsAt,
    endsAt: lot.endsAt,
    originalEndsAt: lot.originalEndsAt,
    extended: lot.endsAt > lot.originalEndsAt, // anti-sniping moved the end
    status: getLotStatus(lot, now),
    cancelledAt: lot.cancelledAt,
    cancelReason: lot.cancelReason,
    auctioneer: { name: lot.auctioneer.name },
  };
}

export type PublicLot = ReturnType<typeof toPublicLot>;
