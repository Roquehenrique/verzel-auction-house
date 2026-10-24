import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { LotImageService } from './lot-image.service.js';
import { LotsController } from './lots.controller.js';
import { LotsService } from './lots.service.js';

@Module({
  imports: [VehiclesModule, RealtimeModule],
  controllers: [LotsController],
  providers: [LotsService, LotImageService],
  exports: [LotsService],
})
export class LotsModule {}
