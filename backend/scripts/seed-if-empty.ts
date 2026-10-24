import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';

// Container start-up: loads the demo data only on an EMPTY database, so
// restarting the container (or redeploying) never wipes real data.
async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let users: number;
  try {
    const { rows } = await client.query<{ count: string }>(
      'SELECT count(*) FROM users',
    );
    users = Number(rows[0].count);
  } finally {
    await client.end();
  }

  if (users > 0) {
    console.log(`Database already has ${users} user(s): seed skipped.`);
    return;
  }
  console.log('Empty database: loading demo data...');
  execSync('npx prisma db seed', {
    // The database is empty, so the production reset guard can be lifted.
    env: { ...process.env, SEED_ALLOW_RESET: 'true' },
    stdio: 'inherit',
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
