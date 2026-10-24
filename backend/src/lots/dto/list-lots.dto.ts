import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SHOWCASE_STATUSES, type ShowcaseStatus } from '../lot-status.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListLotsDto {
  @IsOptional()
  @IsIn(SHOWCASE_STATUSES, {
    message: 'Status inválido: use LIVE, SCHEDULED ou ENDED',
  })
  status: ShowcaseStatus = 'LIVE';

  // Free text search on title, make and model.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  make?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 12;
}
