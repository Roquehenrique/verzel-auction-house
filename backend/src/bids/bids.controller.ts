import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { BidsService } from './bids.service.js';
import { PlaceBidDto } from './dto/place-bid.dto.js';

const LotIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException('Lote não encontrado'),
});

@Controller('lots/:id')
export class BidsController {
  constructor(private readonly bids: BidsService) {}

  // Only bidders: auctioneers (including the lot owner) cannot bid.
  @Roles('BIDDER')
  @Post('bids')
  async placeBid(
    @CurrentUser() user: AuthUser,
    @Param('id', LotIdPipe) lotId: string,
    @Body() dto: PlaceBidDto,
  ) {
    const { previousLeaderId: _, ...result } = await this.bids.placeBid(
      user.id,
      lotId,
      dto.amountCents,
    );
    return result;
  }

  @Public()
  @Get('bids')
  list(@Param('id', LotIdPipe) lotId: string) {
    return this.bids.listBids(lotId);
  }

  @Roles('BIDDER')
  @Get('my-status')
  myStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', LotIdPipe) lotId: string,
  ) {
    return this.bids.myStatus(user.id, lotId);
  }
}
