// Shapes returned by the API (see backend/src/**). Money in integer cents,
// dates as ISO strings.

export type Role = "AUCTIONEER" | "BIDDER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export type LotStatus = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

export interface VehicleAttributes {
  mileageKm?: number;
  color?: string;
  fuel?: string;
  transmission?: string;
  condition?: string;
}

export interface Lot {
  id: string;
  title: string;
  make: string;
  model: string;
  year: number;
  description: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  attributes: VehicleAttributes;
  externalSource: string;
  startingBidCents: number;
  minIncrementCents: number;
  currentBidCents: number | null;
  nextMinimumBidCents: number;
  bidCount: number;
  startsAt: string;
  endsAt: string;
  originalEndsAt: string;
  extended: boolean;
  status: LotStatus;
  auctioneer: { name: string };
}

export interface LotDetail extends Lot {
  serverTime: string;
}

export interface PublicBid {
  sequence: number;
  bidderPseudonym: string;
  amountCents: number;
  createdAt: string;
  hash: string;
}

export interface BidsResponse {
  lotId: string;
  leaderPseudonym: string | null;
  bids: PublicBid[]; // newest first
}

export interface MyLotStatus {
  pseudonym: string;
  hasBid: boolean;
  isLeader: boolean;
  myHighestBidCents: number | null;
  myBidCount: number;
  position: number | null;
  totalBidders: number;
}

export interface PlaceBidResponse {
  bid: PublicBid;
  lot: Lot;
  extended: boolean;
}

// "lot:bid" socket event
export interface LotBidEvent extends PlaceBidResponse {
  lotId: string;
  serverTime: string;
}

export type MyBidOutcome =
  | "WINNING"
  | "OUTBID"
  | "AWAITING_SETTLEMENT"
  | "WON"
  | "LOST"
  | "CANCELLED";

export interface MyBidItem {
  lot: Lot;
  myHighestBidCents: number;
  myBidCount: number;
  outcome: MyBidOutcome;
  receipt: { shareCode: string; amountCents: number } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  serverTime: string;
}

export interface Wallet {
  balanceCents: number;
  committedCents: number;
  availableCents: number;
  commitments: Array<{
    lotId: string;
    title: string;
    amountCents: number;
    endsAt: string;
  }>;
  recentEntries: Array<{
    id: string;
    type: "DEPOSIT" | "PURCHASE" | "SALE";
    amountCents: number;
    lotId: string | null;
    createdAt: string;
  }>;
}
