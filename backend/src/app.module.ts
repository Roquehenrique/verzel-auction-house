import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { BidsModule } from './bids/bids.module.js';
import { validateEnv } from './config/env.validation.js';
import { LotsModule } from './lots/lots.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettlementModule } from './settlement/settlement.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { WalletModule } from './wallet/wallet.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    VehiclesModule,
    LotsModule,
    WalletModule,
    BidsModule,
    SettlementModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
