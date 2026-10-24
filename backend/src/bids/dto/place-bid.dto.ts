import { IsInt, Max, Min } from 'class-validator';
import { MAX_AMOUNT_CENTS } from '../../common/money.js';

const amountRule = {
  message: 'Informe um valor de lance válido, em centavos',
};

export class PlaceBidDto {
  // Range only; the real minimum depends on the lot and is checked in the service.
  @IsInt(amountRule)
  @Min(1, amountRule)
  @Max(MAX_AMOUNT_CENTS, amountRule)
  amountCents: number;
}
