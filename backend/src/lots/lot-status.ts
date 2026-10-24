import type { Prisma } from '../generated/prisma/client.js';

export const LOT_STATUSES = [
  'SCHEDULED',
  'LIVE',
  'ENDED',
  'CANCELLED',
] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

// Statuses listed in the public showcase (cancelled lots never appear there).
export const SHOWCASE_STATUSES = ['LIVE', 'SCHEDULED', 'ENDED'] as const;
export type ShowcaseStatus = (typeof SHOWCASE_STATUSES)[number];

interface LotTimes {
  startsAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
}

// Status is always derived from the server clock, never stored, so a lot can
// never be "live" in the database after its end time has passed.
// endsAt is exclusive: at exactly endsAt the lot is already ENDED.
export function getLotStatus(lot: LotTimes, now: Date = new Date()): LotStatus {
  if (lot.cancelledAt) return 'CANCELLED';
  if (now < lot.startsAt) return 'SCHEDULED';
  if (now < lot.endsAt) return 'LIVE';
  return 'ENDED';
}

// Same rules as getLotStatus, as a database filter.
export function statusWhere(
  status: ShowcaseStatus,
  now: Date,
): Prisma.LotWhereInput {
  switch (status) {
    case 'SCHEDULED':
      return { cancelledAt: null, startsAt: { gt: now } };
    case 'LIVE':
      return { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } };
    case 'ENDED':
      return { cancelledAt: null, endsAt: { lte: now } };
  }
}
