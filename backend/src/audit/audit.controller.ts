import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { AuditService } from './audit.service.js';

const LotIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException('Lote não encontrado'),
});

// The audit is public: anyone, without login, can check a lot's history.
@Public()
@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('audit/public-key')
  publicKey() {
    return this.audit.publicKey();
  }

  @Get('lots/:id/audit')
  auditLot(@Param('id', LotIdPipe) lotId: string) {
    return this.audit.auditLot(lotId);
  }
}
