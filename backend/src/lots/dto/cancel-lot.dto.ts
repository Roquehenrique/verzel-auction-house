import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelLotDto {
  // Required by the service when the lot already received bids.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MinLength(5, { message: 'O motivo deve ter pelo menos 5 caracteres' })
  @MaxLength(300, { message: 'O motivo deve ter no máximo 300 caracteres' })
  reason?: string;
}
