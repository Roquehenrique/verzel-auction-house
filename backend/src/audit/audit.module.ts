import { Module } from '@nestjs/common';
import { BidsModule } from '../bids/bids.module.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [BidsModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
