import { Injectable } from '@nestjs/common';
import type { PublicLot } from '../lots/lot.mapper.js';
import {
  lotRoom,
  RealtimeGateway,
  SHOWCASE_ROOM,
  userRoom,
} from './realtime.gateway.js';

interface PublicBid {
  sequence: number;
  bidderPseudonym: string;
  amountCents: number;
  createdAt: Date;
  hash: string;
}

// Publishes auction events to the connected clients. Called only AFTER the
// database transaction committed, so nobody is told about a change that was
// rolled back.
@Injectable()
export class AuctionEventsService {
  constructor(private readonly gateway: RealtimeGateway) {}

  // The server is undefined when the app runs without the WebSocket layer
  // (e.g. scripts); events are then simply skipped.
  private get server() {
    return this.gateway.server as RealtimeGateway['server'] | undefined;
  }

  bidPlaced(event: {
    bid: PublicBid;
    lot: PublicLot;
    extended: boolean;
    bidderId: string;
    previousLeaderId: string | null;
  }) {
    const server = this.server;
    if (!server) return;
    const { bid, lot } = event;
    const serverTime = new Date();

    server.to(lotRoom(lot.id)).emit('lot:bid', {
      lotId: lot.id,
      bid,
      lot,
      extended: event.extended,
      serverTime,
    });

    server.to(SHOWCASE_ROOM).emit('showcase:update', {
      lotId: lot.id,
      currentBidCents: lot.currentBidCents,
      nextMinimumBidCents: lot.nextMinimumBidCents,
      bidCount: lot.bidCount,
      endsAt: lot.endsAt,
      serverTime,
    });

    // Private notifications: the committed balance of both users changed.
    server.to(userRoom(event.bidderId)).emit('wallet:updated', {});
    if (event.previousLeaderId && event.previousLeaderId !== event.bidderId) {
      server.to(userRoom(event.previousLeaderId)).emit('user:outbid', {
        lotId: lot.id,
        title: lot.title,
        currentBidCents: lot.currentBidCents,
        nextMinimumBidCents: lot.nextMinimumBidCents,
        endsAt: lot.endsAt,
      });
      server.to(userRoom(event.previousLeaderId)).emit('wallet:updated', {});
    }
  }

  lotCancelled(event: {
    lotId: string;
    title: string;
    reason: string | null;
    refund: { userId: string; amountCents: number } | null;
  }) {
    const server = this.server;
    if (!server) return;
    server
      .to(lotRoom(event.lotId))
      .to(SHOWCASE_ROOM)
      .emit('lot:cancelled', { lotId: event.lotId, reason: event.reason });

    // The leader's reserved amount was released: tell them privately.
    if (event.refund) {
      server.to(userRoom(event.refund.userId)).emit('user:lot-cancelled', {
        lotId: event.lotId,
        title: event.title,
        reason: event.reason,
        refundedCents: event.refund.amountCents,
      });
      server.to(userRoom(event.refund.userId)).emit('wallet:updated', {});
    }
  }

  lotEnded(event: {
    lotId: string;
    title: string;
    auctioneerId: string;
    sold: boolean;
    winnerId: string | null;
    winnerPseudonym: string | null;
    amountCents: number | null;
    shareCode: string | null;
  }) {
    const server = this.server;
    if (!server) return;

    // Public: no user ids, only the winner's pseudonym.
    server.to(lotRoom(event.lotId)).to(SHOWCASE_ROOM).emit('lot:ended', {
      lotId: event.lotId,
      sold: event.sold,
      winnerPseudonym: event.winnerPseudonym,
      finalPriceCents: event.amountCents,
    });

    if (event.sold && event.winnerId) {
      server.to(userRoom(event.winnerId)).emit('user:won', {
        lotId: event.lotId,
        title: event.title,
        amountCents: event.amountCents,
        shareCode: event.shareCode,
      });
      server
        .to(userRoom(event.winnerId))
        .to(userRoom(event.auctioneerId))
        .emit('wallet:updated', {});
    }
  }
}
