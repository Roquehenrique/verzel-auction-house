import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS } from '../../common/money.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Extra specs typed by the auctioneer (the external API only knows make/model/year).
export class VehicleAttributesDto {
  @IsOptional()
  @IsInt({ message: 'Quilometragem inválida' })
  @Min(0, { message: 'Quilometragem inválida' })
  @Max(2_000_000, { message: 'Quilometragem inválida' })
  mileageKm?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  color?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  fuel?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  transmission?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  condition?: string;
}

const amountRule = (field: string) => ({
  message: `${field} deve ser entre R$ 1,00 e R$ 20.000.000,00 (em centavos)`,
});

export class CreateLotDto {
  // Vehicle chosen in the catalog. Names are resolved on the server from these
  // ids, so the client cannot create a lot for a car that is not in the API.
  @IsInt({ message: 'Marca inválida' })
  @IsPositive({ message: 'Marca inválida' })
  makeId: number;

  @IsInt({ message: 'Modelo inválido' })
  @IsPositive({ message: 'Modelo inválido' })
  modelId: number;

  @IsInt({ message: 'Ano inválido' })
  year: number;

  // Must be one of the Wikimedia images returned by the catalog (checked in the service).
  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'URL de imagem inválida' },
  )
  imageUrl?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'O título deve ter pelo menos 3 caracteres' })
  @MaxLength(120, { message: 'O título deve ter no máximo 120 caracteres' })
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000, {
    message: 'A descrição deve ter no máximo 2000 caracteres',
  })
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VehicleAttributesDto)
  attributes?: VehicleAttributesDto;

  @IsInt(amountRule('O lance inicial'))
  @Min(MIN_AMOUNT_CENTS, amountRule('O lance inicial'))
  @Max(MAX_AMOUNT_CENTS, amountRule('O lance inicial'))
  startingBidCents: number;

  @IsInt(amountRule('O incremento mínimo'))
  @Min(MIN_AMOUNT_CENTS, amountRule('O incremento mínimo'))
  @Max(MAX_AMOUNT_CENTS, amountRule('O incremento mínimo'))
  minIncrementCents: number;

  @Type(() => Date)
  @IsDate({ message: 'Data de início inválida' })
  startsAt: Date;

  @Type(() => Date)
  @IsDate({ message: 'Data de fim inválida' })
  endsAt: Date;
}
