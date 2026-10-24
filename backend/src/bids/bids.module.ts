import { Module } from '@nestjs/common';
import { BidSignerService } from './bid-signer.service.js';
import { BidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';

@Module({
  controllers: [BidsController],
  providers: [BidsService, BidSignerService],
  exports: [BidsService, BidSignerService],
})
export class BidsModule {}
