import { execSync } from 'node:child_process';
import pg from 'pg';

// Helpers shared by the backend e2e tests and the Playwright (frontend e2e)
// preparation script.

export function databaseName(url: string): string {
  return new URL(url).pathname.slice(1);
}

// Creates the database if it does not exist yet (connects to "postgres").
export async function ensureDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  if (!/^[a-z0-9_]+$/i.test(name))
    throw new Error(`Invalid database name "${name}"`);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (rowCount === 0) {
      // Identifier cannot be a bind parameter; the name was validated above.
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
}

// Non-destructive: only applies pending migrations.
export function migrateDeploy(url: string): void {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
