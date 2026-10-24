import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { LotImageService } from './lot-image.service.js';
import { LotsController } from './lots.controller.js';
import { LotsService } from './lots.service.js';

@Module({
  imports: [VehiclesModule],
  controllers: [LotsController],
  providers: [LotsService, LotImageService],
  exports: [LotsService],
})
export class LotsModule {}
