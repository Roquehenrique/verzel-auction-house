import { Module } from '@nestjs/common';
import { AuctionEventsService } from './auction-events.service.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Module({
  providers: [RealtimeGateway, AuctionEventsService],
  exports: [AuctionEventsService],
})
export class RealtimeModule {}
