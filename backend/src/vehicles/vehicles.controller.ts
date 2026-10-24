import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ImagesQueryDto, MakesQueryDto, ModelsQueryDto } from './dto/vehicle-queries.dto.js';
import { VehiclesService } from './vehicles.service.js';

// Catalog used by the auctioneer to build a lot. Every response has the shape
// { data, stale, fetchedAt }: stale=true means the external API is down and
// cached data is being shown.
@Roles('AUCTIONEER')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('makes')
  makes(@Query() query: MakesQueryDto) {
    return this.vehicles.getMakes(query.q);
  }

  @Get('models')
  models(@Query() query: ModelsQueryDto) {
    return this.vehicles.getModels(query.makeId, query.year);
  }

  @Get('images')
  images(@Query() query: ImagesQueryDto) {
    return this.vehicles.getImages(query.make, query.model, query.year);
  }
}
