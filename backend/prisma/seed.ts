import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth/password.js';

// Demo data: 1 auctioneer, 2 bidders with balance and lots in every state.
// All dates are relative to the moment the seed runs, so running it again
// "resets" the demo (live lots become live again).
//
// WARNING: the seed deletes all existing data first.

const DEMO_PASSWORD = 'Senha@123';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const reais = (value: number) => value * 100; // converts R$ to cents

if (
  process.env.NODE_ENV === 'production' &&
  process.env.SEED_ALLOW_RESET !== 'true'
) {
  console.error(
    'Refusing to reset a production database. Set SEED_ALLOW_RESET=true to proceed.',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const now = Date.now();

  await prisma.$executeRaw`TRUNCATE TABLE receipts, bids, ledger_entries, lot_images, lots, wallets, users`;

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const auctioneer = await prisma.user.create({
    data: {
      name: 'Leiloeiro Demo',
      email: 'leiloeiro@leilao.dev',
      passwordHash,
      role: 'AUCTIONEER',
      wallet: { create: {} },
    },
  });

  const bidders = [
    {
      name: 'Ana Licitante',
      email: 'ana@leilao.dev',
      deposit: reais(1_000_000),
    },
    {
      name: 'Bruno Licitante',
      email: 'bruno@leilao.dev',
      deposit: reais(800_000),
    },
  ];

  for (const bidder of bidders) {
    await prisma.user.create({
      data: {
        name: bidder.name,
        email: bidder.email,
        passwordHash,
        role: 'BIDDER',
        wallet: { create: { balanceCents: bidder.deposit } },
        ledgerEntries: {
          create: { type: 'DEPOSIT', amountCents: bidder.deposit },
        },
      },
    });
  }

  const lots = [
    {
      // LIVE, ends in 7 days
      title: 'Porsche 911 Carrera Cabriolet 2025',
      make: 'Porsche',
      model: '911 Carrera',
      year: 2025,
      description:
        'Geração 992, conversível, único dono e revisões na concessionária.',
      imageUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/2025_Porsche_992_Carrera_convertible_DSC_7026.jpg/960px-2025_Porsche_992_Carrera_convertible_DSC_7026.jpg',
      attributes: {
        mileageKm: 8_500,
        color: 'Prata',
        fuel: 'Gasolina',
        transmission: 'Automático PDK',
      },
      startingBidCents: reais(650_000),
      minIncrementCents: reais(5_000),
      startsAt: new Date(now - HOUR),
      endsAt: new Date(now + 7 * DAY),
    },
    {
      // LIVE, ends in 2 days
      title: 'Ford Mustang Hardtop 1965',
      make: 'Ford',
      model: 'Mustang',
      year: 1965,
      description: 'Primeira geração, restaurado, motor V8 289.',
      imageUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/1965_Ford_Mustang_2D_Hardtop_Front.jpg/960px-1965_Ford_Mustang_2D_Hardtop_Front.jpg',
      attributes: {
        mileageKm: 92_000,
        color: 'Vermelho',
        fuel: 'Gasolina',
        transmission: 'Manual',
      },
      startingBidCents: reais(180_000),
      minIncrementCents: reais(2_000),
      startsAt: new Date(now - 2 * HOUR),
      endsAt: new Date(now + 2 * DAY),
    },
    {
      // LIVE, ends in 1 day
      title: 'Chevrolet Opala De Luxo 1978',
      make: 'Chevrolet',
      model: 'Opala',
      year: 1978,
      description: 'Sedã 4 portas, placa preta, documentação em dia.',
      imageUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/1978_Chevrolet_Opala_Deluxe_4dr.jpg/960px-1978_Chevrolet_Opala_Deluxe_4dr.jpg',
      attributes: {
        mileageKm: 120_000,
        color: 'Bege',
        fuel: 'Gasolina',
        transmission: 'Manual',
      },
      startingBidCents: reais(45_000),
      minIncrementCents: reais(500),
      startsAt: new Date(now - 30 * 60 * 1000),
      endsAt: new Date(now + DAY),
    },
    {
      // SCHEDULED, starts in 1 day
      title: 'Toyota GR Supra 2020',
      make: 'Toyota',
      model: 'GR Supra',
      year: 2020,
      description: 'Quinta geração, 3.0 turbo, 340 cv.',
      imageUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/2020_Toyota_GR_Supra_%28United_States%29.png/960px-2020_Toyota_GR_Supra_%28United_States%29.png',
      attributes: {
        mileageKm: 21_000,
        color: 'Vermelho',
        fuel: 'Gasolina',
        transmission: 'Automático',
      },
      startingBidCents: reais(380_000),
      minIncrementCents: reais(3_000),
      startsAt: new Date(now + DAY),
      endsAt: new Date(now + 8 * DAY),
    },
    {
      // ENDED with no bids: settlement closes it without a winner
      title: 'Volkswagen Fusca 1966',
      make: 'Volkswagen',
      model: 'Fusca',
      year: 1966,
      description: 'Original de fábrica, motor 1300.',
      imageUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/VW_K%C3%A4fer_Baujahr_1966.jpg/960px-VW_K%C3%A4fer_Baujahr_1966.jpg',
      attributes: {
        mileageKm: 150_000,
        color: 'Azul',
        fuel: 'Gasolina',
        transmission: 'Manual',
      },
      startingBidCents: reais(35_000),
      minIncrementCents: reais(500),
      startsAt: new Date(now - 3 * DAY),
      endsAt: new Date(now - DAY),
    },
  ];

  for (const lot of lots) {
    await prisma.lot.create({
      data: {
        ...lot,
        auctioneerId: auctioneer.id,
        externalSource: 'seed',
        originalEndsAt: lot.endsAt,
      },
    });
  }

  console.log('Seed completed:');
  console.log(`  auctioneer: ${auctioneer.email}`);
  console.log(`  bidders:    ${bidders.map((b) => b.email).join(', ')}`);
  console.log(`  password:   ${DEMO_PASSWORD} (all users)`);
  console.log(`  lots:       ${lots.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
