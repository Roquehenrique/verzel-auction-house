import { execSync } from 'node:child_process';
import pg from 'pg';
import { assertTestDatabase, TEST_DATABASE_URL } from './test-env.js';

// Runs once before the e2e suite: creates the test database if needed and
// applies the migrations (non-destructive `migrate deploy`).
export default async function setup() {
  assertTestDatabase(TEST_DATABASE_URL);

  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (rowCount === 0) {
      // Identifier cannot be a bind parameter; dbName was validated above.
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
