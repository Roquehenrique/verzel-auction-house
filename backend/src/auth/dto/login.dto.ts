import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email: string;

  @IsString({ message: 'Informe a senha' })
  @MaxLength(128, { message: 'Senha inválida' })
  password: string;
}
