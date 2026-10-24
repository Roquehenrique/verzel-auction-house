import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CancelLotDto } from './dto/cancel-lot.dto.js';
import { CreateLotDto } from './dto/create-lot.dto.js';
import { ListLotsDto } from './dto/list-lots.dto.js';
import { LotsService } from './lots.service.js';

// An invalid id is reported as "not found" instead of a validation error.
const LotIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException('Lote não encontrado'),
});

@Controller('lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Roles('AUCTIONEER')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLotDto) {
    return this.lots.create(user.id, dto);
  }

  // Showcase: public, never lists cancelled lots.
  @Public()
  @Get()
  list(@Query() query: ListLotsDto) {
    return this.lots.list(query);
  }

  // Makes present in the showcase, for the filter. Declared before ":id".
  @Public()
  @Get('makes')
  makes() {
    return this.lots.listMakes();
  }

  // Declared before ":id" so "mine" is not taken as a lot id.
  @Roles('AUCTIONEER')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.lots.findMine(user.id);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', LotIdPipe) id: string) {
    return this.lots.findOne(id);
  }

  // Serves the stored copy of the picture; falls back to the original URL.
  @Public()
  @Get(':id/image')
  async image(@Param('id', LotIdPipe) id: string, @Res() res: Response) {
    const lot = await this.lots.getImage(id);
    if (lot.image) {
      res
        .set('Content-Type', lot.image.contentType)
        .set('Cache-Control', 'public, max-age=86400')
        .send(Buffer.from(lot.image.data));
      return;
    }
    if (lot.imageUrl) {
      res.redirect(302, lot.imageUrl);
      return;
    }
    throw new NotFoundException('Este lote não tem imagem');
  }

  @Roles('AUCTIONEER')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', LotIdPipe) id: string,
    @Body() dto: CancelLotDto,
  ) {
    return this.lots.cancel(user.id, id, dto.reason);
  }
}
