import { Injectable, NotFoundException } from '@nestjs/common';
import { BidSignerService } from '../bids/bid-signer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: BidSignerService,
  ) {}

  // Public receipt (shared by link). Identifies the winner only by pseudonym.
  async findByShareCode(shareCode: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { shareCode },
      include: {
        lot: {
          select: {
            id: true,
            title: true,
            make: true,
            model: true,
            year: true,
            imageUrl: true,
            endsAt: true,
            bidCount: true,
            auctioneer: { select: { name: true } },
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Comprovante não encontrado');

    const signatureValid = this.signer.verifyReceipt(
      {
        lotId: receipt.lotId,
        winnerPseudonym: receipt.winnerPseudonym,
        amountCents: receipt.amountCents,
        bidCount: receipt.lot.bidCount,
        chainHeadHash: receipt.chainHeadHash,
        issuedAt: receipt.issuedAt,
      },
      receipt.signature,
    );

    const { lot } = receipt;
    return {
      shareCode: receipt.shareCode,
      lot: {
        id: lot.id,
        title: lot.title,
        make: lot.make,
        model: lot.model,
        year: lot.year,
        hasImage: lot.imageUrl !== null,
        endedAt: lot.endsAt,
        auctioneer: { name: lot.auctioneer.name },
      },
      winnerPseudonym: receipt.winnerPseudonym,
      amountCents: receipt.amountCents,
      bidCount: lot.bidCount,
      chainHeadHash: receipt.chainHeadHash,
      issuedAt: receipt.issuedAt,
      signature: receipt.signature,
      // false means the receipt or the lot was changed after it was issued
      signatureValid,
    };
  }
}
