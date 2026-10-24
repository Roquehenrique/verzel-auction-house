import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { DepositDto } from './dto/deposit.dto.js';
import { WalletService } from './wallet.service.js';

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  // Any logged-in user: bidders see their balance, auctioneers their sales.
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.wallet.getWallet(user.id);
  }

  // Auctioneers cannot bid, so only bidders deposit.
  @Roles('BIDDER')
  @Post('deposit')
  @HttpCode(200)
  deposit(@CurrentUser() user: AuthUser, @Body() dto: DepositDto) {
    return this.wallet.deposit(user.id, dto.amountCents);
  }
}
