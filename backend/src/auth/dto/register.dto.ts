import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @Transform(trim)
  @IsString({ message: 'Informe o nome' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'O nome deve ter no máximo 100 caracteres' })
  name: string;

  // Normalized so "Ana@Leilao.dev " and "ana@leilao.dev" are the same account.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  @MaxLength(254, { message: 'E-mail muito longo' })
  email: string;

  @IsString({ message: 'Informe a senha' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  @MaxLength(128, { message: 'A senha deve ter no máximo 128 caracteres' })
  password: string;

  @IsIn(Object.values(Role), {
    message:
      'Perfil inválido: use AUCTIONEER (leiloeiro) ou BIDDER (licitante)',
  })
  role: Role;
}
