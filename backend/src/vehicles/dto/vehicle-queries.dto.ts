import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class MakesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;
}

export class ModelsQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'Marca inválida' })
  @IsPositive({ message: 'Marca inválida' })
  makeId: number;

  // Range (1981..next year) is checked in the service, where "next year" is current.
  @Type(() => Number)
  @IsInt({ message: 'Ano inválido' })
  year: number;
}

export class ImagesQueryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Informe a marca' })
  @MaxLength(50)
  make: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Informe o modelo' })
  @MaxLength(80)
  model: string;

  @Type(() => Number)
  @IsInt({ message: 'Ano inválido' })
  year: number;
}
