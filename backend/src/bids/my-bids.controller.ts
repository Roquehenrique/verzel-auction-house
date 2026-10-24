import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { BidsService } from './bids.service.js';

@Controller('bids')
export class MyBidsController {
  constructor(private readonly bids: BidsService) {}

  // "Meus arremates": lots the bidder participated in and the won ones.
  @Roles('BIDDER')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.bids.myBids(user.id);
  }
}
