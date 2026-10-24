import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MAX_AMOUNT_CENTS } from '../common/money.js';
import { PrismaService } from '../prisma/prisma.service.js';

const RECENT_ENTRIES = 20;

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string) {
    const [wallet, commitments, entries] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      // Lots where this user's bid is holding money: leading and not settled yet
      // (an ended lot keeps the amount committed until settlement debits it).
      this.prisma.lot.findMany({
        where: { currentLeaderId: userId, settledAt: null, cancelledAt: null },
        select: { id: true, title: true, currentBidCents: true, endsAt: true },
        orderBy: { endsAt: 'asc' },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { userId },
        select: {
          id: true,
          type: true,
          amountCents: true,
          lotId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_ENTRIES,
      }),
    ]);
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    return {
      balanceCents: wallet.balanceCents,
      committedCents: wallet.committedCents,
      availableCents: wallet.balanceCents - wallet.committedCents,
      commitments: commitments.map((lot) => ({
        lotId: lot.id,
        title: lot.title,
        amountCents: lot.currentBidCents!,
        endsAt: lot.endsAt,
      })),
      recentEntries: entries,
    };
  }

  async deposit(userId: string, amountCents: number) {
    await this.prisma.$transaction(async (tx) => {
      // Single atomic UPDATE: concurrent deposits never overwrite each other,
      // and the balance cap is checked in the same statement.
      const { count } = await tx.wallet.updateMany({
        where: {
          userId,
          balanceCents: { lte: MAX_AMOUNT_CENTS - amountCents },
        },
        data: { balanceCents: { increment: amountCents } },
      });
      if (count === 0) {
        throw new BadRequestException(
          'Depósito recusado: o saldo total não pode passar de R$ 20.000.000,00',
        );
      }
      await tx.ledgerEntry.create({
        data: { userId, type: 'DEPOSIT', amountCents },
      });
    });
    return this.getWallet(userId);
  }
}
