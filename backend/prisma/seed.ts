import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { hashPassword } from '../src/auth/password.js';
import { BidSignerService } from '../src/bids/bid-signer.service.js';
import { BidsService } from '../src/bids/bids.service.js';
import { LotImageService } from '../src/lots/lot-image.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SettlementService } from '../src/settlement/settlement.service.js';

// Demo data: 1 auctioneer, 3 bidders with balance and lots in every state.
// All dates are relative to the moment the seed runs, so running it again
// "resets" the demo (live lots become live again). Live lots last weeks so a
// deployed demo still has live auctions when it is evaluated.
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

// The real services are used to place the demo bids, so they follow exactly the
// same rules (committed balance, hash chain, signature) as bids made in the app.
const config = new ConfigService(process.env);
const prisma = new PrismaService(config);
const signer = new BidSignerService(config);
const bidsService = new BidsService(prisma, signer);
const settlementService = new SettlementService(prisma, signer, config);
const images = new LotImageService();

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

  // Ana and Bruno are the accounts to try the app with. Carla only takes part
  // in some disputes, so there are lots where the demo accounts were outbid.
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
    {
      name: 'Carla Licitante',
      email: 'carla@leilao.dev',
      deposit: reais(1_500_000),
    },
  ];

  const bidderIds: string[] = [];
  for (const bidder of bidders) {
    const { id } = await prisma.user.create({
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
    bidderIds.push(id);
  }
  const [anaId, brunoId, carlaId] = bidderIds;

  const lots = [
    {
      // LIVE, ends in 28 days
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
      endsAt: new Date(now + 28 * DAY),
    },
    {
      // LIVE, ends in 25 days
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
      endsAt: new Date(now + 25 * DAY),
    },
    {
      // LIVE, ends in 21 days
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
      endsAt: new Date(now + 21 * DAY),
    },
    {
      // LIVE, ends in 10 days
      title: 'Chevrolet Camaro 2SS 2019',
      make: 'Chevrolet',
      model: 'Camaro',
      year: 2019,
      description: 'Sexta geração, motor V8 6.2, escapamento esportivo.',
      imageUrl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/2019_Chevrolet_Camaro_2SS_6.2L_front_3.16.19.jpg/960px-2019_Chevrolet_Camaro_2SS_6.2L_front_3.16.19.jpg',
      attributes: {
        mileageKm: 34_000,
        color: 'Preto',
        fuel: 'Gasolina',
        transmission: 'Automático',
      },
      startingBidCents: reais(320_000),
      minIncrementCents: reais(3_000),
      startsAt: new Date(now - 3 * HOUR),
      endsAt: new Date(now + 10 * DAY),
    },
    {
      // LIVE, ends in 12 days
      title: 'Honda Civic 2017',
      make: 'Honda',
      model: 'Civic',
      year: 2017,
      description: 'Décima geração, motor turbo, manual do proprietário.',
      imageUrl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/2017_Honda_Civic_SR_VTEC_1.0_Front.jpg/960px-2017_Honda_Civic_SR_VTEC_1.0_Front.jpg',
      attributes: {
        mileageKm: 61_000,
        color: 'Branco',
        fuel: 'Flex',
        transmission: 'Automático CVT',
      },
      startingBidCents: reais(95_000),
      minIncrementCents: reais(1_000),
      startsAt: new Date(now - 4 * HOUR),
      endsAt: new Date(now + 12 * DAY),
    },
    {
      // LIVE, ends in 15 days
      title: 'Jeep Wrangler Sahara Unlimited 2018',
      make: 'Jeep',
      model: 'Wrangler',
      year: 2018,
      description: 'Geração JL, 4x4, quatro portas e capota rígida.',
      imageUrl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/2018_Jeep_Wrangler_Sahara_Unlimited_Multijet_2.1_Front.jpg/960px-2018_Jeep_Wrangler_Sahara_Unlimited_Multijet_2.1_Front.jpg',
      attributes: {
        mileageKm: 48_000,
        color: 'Cinza',
        fuel: 'Diesel',
        transmission: 'Automático',
      },
      startingBidCents: reais(230_000),
      minIncrementCents: reais(2_000),
      startsAt: new Date(now - HOUR),
      endsAt: new Date(now + 15 * DAY),
    },
    {
      // LIVE, ends in 18 days
      title: 'Volkswagen Golf 1.4 TSI 2013',
      make: 'Volkswagen',
      model: 'Golf',
      year: 2013,
      description: 'Sétima geração, completo, todas as revisões em dia.',
      imageUrl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/59/2013_Volkswagen_Golf_SE_BlueMotion_Technology_1.4_Front.jpg/960px-2013_Volkswagen_Golf_SE_BlueMotion_Technology_1.4_Front.jpg',
      attributes: {
        mileageKm: 98_000,
        color: 'Prata',
        fuel: 'Gasolina',
        transmission: 'Manual',
      },
      startingBidCents: reais(60_000),
      minIncrementCents: reais(500),
      startsAt: new Date(now - 2 * HOUR),
      endsAt: new Date(now + 18 * DAY),
    },
    {
      // LIVE, ends in 23 days
      title: 'Toyota Corolla Hatch 2018',
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
      description: 'Versão hatch esportiva, multimídia e câmera de ré.',
      imageUrl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f1/2018_Toyota_Corolla_%28MZEA12R%29_Ascent_Sport_hatchback_%282018-11-02%29_01.jpg/960px-2018_Toyota_Corolla_%28MZEA12R%29_Ascent_Sport_hatchback_%282018-11-02%29_01.jpg',
      attributes: {
        mileageKm: 55_000,
        color: 'Branco',
        fuel: 'Flex',
        transmission: 'Automático CVT',
      },
      startingBidCents: reais(110_000),
      minIncrementCents: reais(1_000),
      startsAt: new Date(now - HOUR),
      endsAt: new Date(now + 23 * DAY),
    },
    {
      // LIVE, ends in 27 days
      title: 'BMW M3 Competition 2022',
      make: 'BMW',
      model: 'M3',
      year: 2022,
      description: 'Geração G80, 510 cv, pacote de fibra de carbono.',
      imageUrl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8a/BMW_M3_Competition_%28G80%29_IMG_4041.jpg/960px-BMW_M3_Competition_%28G80%29_IMG_4041.jpg',
      attributes: {
        mileageKm: 12_000,
        color: 'Verde',
        fuel: 'Gasolina',
        transmission: 'Automático',
      },
      startingBidCents: reais(720_000),
      minIncrementCents: reais(5_000),
      startsAt: new Date(now - 30 * 60 * 1000),
      endsAt: new Date(now + 27 * DAY),
    },
    {
      // SCHEDULED, starts in 3 days
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
      startsAt: new Date(now + 3 * DAY),
      endsAt: new Date(now + 30 * DAY),
    },
    {
      // SCHEDULED, starts in 1 day
      title: 'Nissan GT-R 2010',
      make: 'Nissan',
      model: 'GT-R',
      year: 2010,
      description: 'Geração R35, V6 biturbo, tração integral.',
      imageUrl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/2009-2010_Nissan_GT-R_%28R35%29_coupe_01.jpg/960px-2009-2010_Nissan_GT-R_%28R35%29_coupe_01.jpg',
      attributes: {
        mileageKm: 67_000,
        color: 'Prata',
        fuel: 'Gasolina',
        transmission: 'Automático',
      },
      startingBidCents: reais(450_000),
      minIncrementCents: reais(5_000),
      startsAt: new Date(now + DAY),
      endsAt: new Date(now + 22 * DAY),
    },
    {
      // SCHEDULED, starts in 5 days
      title: 'Mercedes-AMG SL 43 2023',
      make: 'Mercedes-Benz',
      model: 'SL',
      year: 2023,
      description: 'Roadster 2+2, capota de lona elétrica.',
      imageUrl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/Mercedes-AMG_SL_43_IMG_8050.jpg/960px-Mercedes-AMG_SL_43_IMG_8050.jpg',
      attributes: {
        mileageKm: 9_000,
        color: 'Branco',
        fuel: 'Gasolina',
        transmission: 'Automático',
      },
      startingBidCents: reais(900_000),
      minIncrementCents: reais(10_000),
      startsAt: new Date(now + 5 * DAY),
      endsAt: new Date(now + 29 * DAY),
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
    {
      // Starts LIVE, receives bids and is then closed and settled below, so a
      // won lot with its receipt exists right after the seed.
      title: 'Fiat Uno Attractive 2011',
      make: 'Fiat',
      model: 'Uno',
      year: 2011,
      description: 'Motor 1.4, completo, segundo dono.',
      imageUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/2011_Fiat_Uno_1.4_Attractive.jpg/960px-2011_Fiat_Uno_1.4_Attractive.jpg',
      attributes: {
        mileageKm: 88_000,
        color: 'Vermelho',
        fuel: 'Flex',
        transmission: 'Manual',
      },
      startingBidCents: reais(30_000),
      minIncrementCents: reais(1_000),
      startsAt: new Date(now - 2 * HOUR),
      endsAt: new Date(now + HOUR),
    },
  ];

  // A copy of each picture is stored, as for lots created in the app, so the
  // demo keeps its pictures if Wikimedia is down (best effort: on failure the
  // image endpoint redirects to the original URL). One at a time, with a retry,
  // because Wikimedia answers 429 to bursts of requests. Skipped by the e2e
  // tests (SEED_SKIP_IMAGES=true), which must not depend on Wikimedia.
  const skipImages = process.env.SEED_SKIP_IMAGES === 'true';
  const copies: Awaited<ReturnType<LotImageService['download']>>[] = [];
  for (const lot of lots) {
    if (skipImages) {
      copies.push(null);
      continue;
    }
    let copy = await images.download(lot.imageUrl);
    if (!copy) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      copy = await images.download(lot.imageUrl);
    }
    copies.push(copy);
  }

  const lotIds: Record<string, string> = {};
  for (const [index, lot] of lots.entries()) {
    const copy = copies[index];
    const { id } = await prisma.lot.create({
      data: {
        ...lot,
        auctioneerId: auctioneer.id,
        externalSource: 'seed',
        originalEndsAt: lot.endsAt,
        image: copy
          ? {
              create: {
                contentType: copy.contentType,
                data: copy.data,
                sourceUrl: lot.imageUrl,
              },
            }
          : undefined,
      },
    });
    lotIds[lot.model] = id;
  }

  // Live lots with an ongoing dispute. Opala, Golf, Corolla and M3 are left
  // without bids so the first bid can be tried out.
  const demoBids: Array<[lot: string, bidderId: string, reais: number]> = [
    ['911 Carrera', anaId, 650_000],
    ['911 Carrera', brunoId, 660_000],
    ['911 Carrera', anaId, 680_000], // Ana is winning
    ['Mustang', brunoId, 180_000],
    ['Mustang', anaId, 185_000],
    ['Mustang', brunoId, 190_000], // Bruno is winning
    ['Camaro', brunoId, 320_000],
    ['Camaro', carlaId, 330_000], // Carla is winning, Bruno was outbid
    ['Civic', anaId, 95_000],
    ['Civic', carlaId, 98_000], // Carla is winning, Ana was outbid
    ['Wrangler', carlaId, 230_000],
    ['Uno', brunoId, 30_000],
    ['Uno', anaId, 32_000], // Ana wins (lot closed below)
  ];
  for (const [lot, bidderId, value] of demoBids) {
    await bidsService.placeBid(bidderId, lotIds[lot], reais(value));
  }

  // Close the Uno now (after its bids) and settle it with the real service:
  // Ana is charged, the auctioneer is credited and the signed receipt is issued.
  const closedAt = new Date();
  await prisma.lot.update({
    where: { id: lotIds['Uno'] },
    data: { endsAt: closedAt, originalEndsAt: closedAt },
  });
  const receipt = await settlementService.settleLot(lotIds['Uno']);

  console.log('Seed completed:');
  console.log(`  auctioneer: ${auctioneer.email}`);
  console.log(`  bidders:    ${bidders.map((b) => b.email).join(', ')}`);
  console.log(`  password:   ${DEMO_PASSWORD} (all users)`);
  console.log(`  lots:       ${lots.length}`);
  console.log(
    `  pictures:   ${copies.filter(Boolean).length}/${lots.length} stored`,
  );
  console.log(`  bids:       ${demoBids.length}`);
  console.log(
    `  receipt:    /comprovante/${receipt?.shareCode} (Fiat Uno, Ana)`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
