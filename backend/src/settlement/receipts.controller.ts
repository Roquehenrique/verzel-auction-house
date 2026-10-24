import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { ReceiptsService } from './receipts.service.js';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  // Public: the winner shares this link.
  @Public()
  @Get(':shareCode')
  findOne(@Param('shareCode') shareCode: string) {
    return this.receipts.findByShareCode(shareCode);
  }
}
