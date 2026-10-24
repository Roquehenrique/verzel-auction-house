import { IsInt, Max, Min } from 'class-validator';
import { MIN_AMOUNT_CENTS } from '../../common/money.js';

export const MAX_DEPOSIT_CENTS = 500_000_000; // R$ 5.000.000,00 per deposit

const amountRule = {
  message: 'O depósito deve ser entre R$ 1,00 e R$ 5.000.000,00 (em centavos)',
};

export class DepositDto {
  @IsInt(amountRule)
  @Min(MIN_AMOUNT_CENTS, amountRule)
  @Max(MAX_DEPOSIT_CENTS, amountRule)
  amountCents: number;
}
