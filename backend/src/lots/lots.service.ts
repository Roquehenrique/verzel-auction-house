import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuctionEventsService } from '../realtime/auction-events.service.js';
import { VehiclesService } from '../vehicles/vehicles.service.js';
import { CreateLotDto, VehicleAttributesDto } from './dto/create-lot.dto.js';
import { ListLotsDto } from './dto/list-lots.dto.js';
import { LotImageService } from './lot-image.service.js';
import {
  getLotStatus,
  statusWhere,
  type ShowcaseStatus,
} from './lot-status.js';
import { toPublicLot } from './lot.mapper.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const LOT_DURATION = { min: 5 * MINUTE, max: 30 * DAY };
export const MAX_START_AHEAD_MS = 90 * DAY;
// A form submitted with "start now" reaches the server a few seconds later.
const START_TOLERANCE_MS = MINUTE;

const ORDER_BY: Record<ShowcaseStatus, Prisma.LotOrderByWithRelationInput[]> = {
  LIVE: [{ endsAt: 'asc' }, { id: 'asc' }], // ending soonest first
  SCHEDULED: [{ startsAt: 'asc' }, { id: 'asc' }], // starting soonest first
  ENDED: [{ endsAt: 'desc' }, { id: 'asc' }], // most recently ended first
};

const withAuctioneer = { auctioneer: { select: { name: true } } } as const;

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly images: LotImageService,
    private readonly events: AuctionEventsService,
  ) {}

  async create(auctioneerId: string, dto: CreateLotDto) {
    const now = new Date();
    validateSchedule(dto.startsAt, dto.endsAt, now);
    if (dto.imageUrl) this.images.assertAllowedUrl(dto.imageUrl);

    const vehicle = await this.resolveVehicle(
      dto.makeId,
      dto.modelId,
      dto.year,
    );
    const image = dto.imageUrl
      ? await this.images.download(dto.imageUrl)
      : null;

    const lot = await this.prisma.lot.create({
      data: {
        auctioneerId,
        title: dto.title ?? `${vehicle.make} ${vehicle.model} ${dto.year}`,
        make: vehicle.make,
        model: vehicle.model,
        year: dto.year,
        description: dto.description,
        imageUrl: dto.imageUrl,
        attributes: toAttributesJson(dto.attributes),
        externalSource: 'nhtsa',
        externalId: String(dto.modelId),
        startingBidCents: dto.startingBidCents,
        minIncrementCents: dto.minIncrementCents,
        // "start now" submitted a few seconds late starts exactly now
        startsAt: dto.startsAt < now ? now : dto.startsAt,
        endsAt: dto.endsAt,
        originalEndsAt: dto.endsAt,
        image: image
          ? {
              create: {
                contentType: image.contentType,
                data: image.data,
                sourceUrl: dto.imageUrl!,
              },
            }
          : undefined,
      },
      include: withAuctioneer,
    });
    return toPublicLot(lot);
  }

  async list(query: ListLotsDto) {
    const now = new Date();
    const filters: Prisma.LotWhereInput[] = [statusWhere(query.status, now)];
    if (query.q) {
      filters.push({
        OR: ['title', 'make', 'model'].map((field) => ({
          [field]: { contains: query.q, mode: 'insensitive' },
        })),
      });
    }
    if (query.make)
      filters.push({ make: { equals: query.make, mode: 'insensitive' } });
    const where: Prisma.LotWhereInput = { AND: filters };

    const [lots, total] = await Promise.all([
      this.prisma.lot.findMany({
        where,
        include: withAuctioneer,
        orderBy: ORDER_BY[query.status],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.lot.count({ where }),
    ]);

    return {
      items: lots.map((lot) => toPublicLot(lot, now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      serverTime: now, // lets the client sync its countdown with the server clock
    };
  }

  // Distinct makes of the lots visible in the showcase (not cancelled).
  async listMakes(): Promise<string[]> {
    const rows = await this.prisma.lot.findMany({
      where: { cancelledAt: null },
      distinct: ['make'],
      select: { make: true },
      orderBy: { make: 'asc' },
    });
    return rows.map((row) => row.make);
  }

  async findOne(id: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
      include: withAuctioneer,
    });
    if (!lot) throw new NotFoundException('Lote não encontrado');
    const now = new Date();
    return { ...toPublicLot(lot, now), serverTime: now };
  }

  async getImage(id: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
      select: {
        imageUrl: true,
        image: { select: { contentType: true, data: true } },
      },
    });
    if (!lot) throw new NotFoundException('Lote não encontrado');
    return lot;
  }

  // Auctioneer panel: own lots (including cancelled) with the result of each one.
  async findMine(auctioneerId: string) {
    const now = new Date();
    const [lots, sales] = await Promise.all([
      this.prisma.lot.findMany({
        where: { auctioneerId },
        include: withAuctioneer,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { userId: auctioneerId, type: 'SALE' },
        _sum: { amountCents: true },
      }),
    ]);

    const items = lots.map((lot) => {
      const publicLot = toPublicLot(lot, now);
      return { ...publicLot, result: lotResult(publicLot.status, lot) };
    });

    return {
      items,
      summary: {
        totalReceivedCents: sales._sum.amountCents ?? 0,
        soldCount: items.filter((item) => item.result === 'SOLD').length,
        liveCount: items.filter((item) => item.status === 'LIVE').length,
        scheduledCount: items.filter((item) => item.status === 'SCHEDULED')
          .length,
      },
      serverTime: now,
    };
  }

  async cancel(auctioneerId: string, lotId: string) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      // Locks the lot row: a bid arriving at the same time waits for this
      // transaction (and vice versa), so a cancelled lot can never get a bid.
      await tx.$queryRaw`SELECT id FROM lots WHERE id = ${lotId}::uuid FOR UPDATE`;
      const lot = await tx.lot.findUnique({
        where: { id: lotId },
        include: withAuctioneer,
      });

      if (!lot) throw new NotFoundException('Lote não encontrado');
      if (lot.auctioneerId !== auctioneerId) {
        throw new ForbiddenException(
          'Você só pode cancelar os seus próprios lotes',
        );
      }
      const now = new Date();
      const status = getLotStatus(lot, now);
      if (status === 'CANCELLED')
        throw new ConflictException('Este lote já foi cancelado');
      if (status === 'ENDED')
        throw new ConflictException('Um lote encerrado não pode ser cancelado');
      if (lot.bidCount > 0) {
        throw new ConflictException(
          'Não é possível cancelar um lote que já recebeu lances',
        );
      }

      const updated = await tx.lot.update({
        where: { id: lotId },
        data: { cancelledAt: now },
        include: withAuctioneer,
      });
      return toPublicLot(updated, now);
    });
    this.events.lotCancelled(lotId); // after the commit
    return cancelled;
  }

  // Names come from the catalog (not from the client) so the lot always matches the API.
  private async resolveVehicle(makeId: number, modelId: number, year: number) {
    const [makes, models] = await Promise.all([
      this.vehicles.getMakes(),
      this.vehicles.getModels(makeId, year),
    ]);
    const make = makes.data.find((item) => item.id === makeId);
    const model = models.data.find((item) => item.id === modelId);
    if (!make || !model) {
      throw new BadRequestException(
        'Veículo não encontrado no catálogo para o ano informado',
      );
    }
    return { make: make.name, model: model.name };
  }
}

export function validateSchedule(
  startsAt: Date,
  endsAt: Date,
  now: Date,
): void {
  if (startsAt.getTime() < now.getTime() - START_TOLERANCE_MS) {
    throw new BadRequestException('A data de início não pode estar no passado');
  }
  if (startsAt.getTime() > now.getTime() + MAX_START_AHEAD_MS) {
    throw new BadRequestException(
      'A data de início deve ser em no máximo 90 dias',
    );
  }
  const duration =
    endsAt.getTime() - Math.max(startsAt.getTime(), now.getTime());
  if (duration < LOT_DURATION.min) {
    throw new BadRequestException('O lote deve durar pelo menos 5 minutos');
  }
  if (duration > LOT_DURATION.max) {
    throw new BadRequestException('O lote deve durar no máximo 30 dias');
  }
}

// Plain JSON object with only the attributes that were filled in.
function toAttributesJson(
  attributes?: VehicleAttributesDto,
): Prisma.InputJsonObject {
  if (!attributes) return {};
  const { mileageKm, color, fuel, transmission, condition } = attributes;
  return Object.fromEntries(
    Object.entries({ mileageKm, color, fuel, transmission, condition }).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
}

type LotResult = 'CANCELLED' | 'SOLD' | 'UNSOLD' | 'AWAITING_SETTLEMENT' | null;

function lotResult(
  status: ReturnType<typeof getLotStatus>,
  lot: { settledAt: Date | null; bidCount: number },
): LotResult {
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status !== 'ENDED') return null; // still running
  if (!lot.settledAt) return 'AWAITING_SETTLEMENT';
  return lot.bidCount > 0 ? 'SOLD' : 'UNSOLD';
}
