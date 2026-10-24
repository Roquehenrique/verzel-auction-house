import { Module } from '@nestjs/common';
import { BidsModule } from '../bids/bids.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsService } from './receipts.service.js';
import { SettlementService } from './settlement.service.js';

@Module({
  imports: [BidsModule, RealtimeModule],
  controllers: [ReceiptsController],
  providers: [SettlementService, ReceiptsService],
  exports: [SettlementService],
})
export class SettlementModule {}
