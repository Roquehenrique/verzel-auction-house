import { UnprocessableEntityException } from '@nestjs/common';

// Every refused bid has a machine-readable code (for the UI) and a clear message.
export type BidRejectionCode =
  | 'LOT_NOT_STARTED'
  | 'LOT_ENDED'
  | 'LOT_CANCELLED'
  | 'ALREADY_WINNING'
  | 'BELOW_MINIMUM'
  | 'INSUFFICIENT_BALANCE';

export class BidRejectedException extends UnprocessableEntityException {
  constructor(
    readonly code: BidRejectionCode,
    message: string,
  ) {
    super({
      statusCode: 422,
      error: 'Unprocessable Entity',
      code,
      message,
    });
  }
}
