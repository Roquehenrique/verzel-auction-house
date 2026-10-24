import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { databaseName, ensureDatabase, migrateDeploy } from './database.js';

// Prepares the database used by the Playwright tests (frontend/e2e):
// creates it, applies the migrations, runs the demo seed and pre-fills the
// vehicle catalog cache so lot creation does not depend on NHTSA/Wikipedia.
//
// Run with: npm run e2e:prepare  (E2E_DATABASE_URL overrides the default)

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://leilao:leilao@localhost:5432/leilao_e2e';

// The seed wipes the database: never run it against anything but *_e2e.
if (!databaseName(E2E_DATABASE_URL).endsWith('_e2e')) {
  console.error(
    'Refusing to prepare a database whose name does not end with "_e2e"',
  );
  process.exit(1);
}

const HOUR = 60 * 60 * 1000;
const SUPRA_IMAGE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/2020_Toyota_GR_Supra_%28United_States%29.png/960px-2020_Toyota_GR_Supra_%28United_States%29.png';

const catalogFixtures = [
  { key: 'nhtsa:makes', payload: [{ id: 448, name: 'Toyota' }] },
  {
    key: 'nhtsa:models:448:2020',
    payload: [
      { id: 2208, name: 'Corolla' },
      { id: 3647, name: 'Supra' },
    ],
  },
  {
    key: 'wikipedia:images:2020:toyota:supra',
    payload: [
      {
        url: SUPRA_IMAGE,
        title: 'Toyota GR Supra',
        pageUrl: 'https://en.wikipedia.org/wiki/Toyota_GR_Supra',
      },
    ],
  },
];

async function main() {
  await ensureDatabase(E2E_DATABASE_URL);
  migrateDeploy(E2E_DATABASE_URL);

  execSync('npx prisma db seed', {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });

  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    for (const { key, payload } of catalogFixtures) {
      await client.query(
        `INSERT INTO external_api_cache (key, payload, fetched_at, expires_at)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE
         SET payload = EXCLUDED.payload, fetched_at = now(), expires_at = EXCLUDED.expires_at`,
        [key, JSON.stringify(payload), new Date(Date.now() + 24 * HOUR)],
      );
    }
  } finally {
    await client.end();
  }
  console.log(`E2E database ready: ${databaseName(E2E_DATABASE_URL)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
