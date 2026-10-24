import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { BidSignerService } from './bid-signer.service.js';
import { BidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [BidsController],
  providers: [BidsService, BidSignerService],
  exports: [BidsService, BidSignerService],
})
export class BidsModule {}
