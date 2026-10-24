import { Module } from '@nestjs/common';
import { ExternalCacheService } from '../external/external-cache.service.js';
import { NhtsaClient } from './nhtsa.client.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';
import { WikipediaClient } from './wikipedia.client.js';

@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService, NhtsaClient, WikipediaClient, ExternalCacheService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
