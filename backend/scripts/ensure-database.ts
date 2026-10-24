import 'dotenv/config';
import pg from 'pg';
import { ensureDatabase } from './database.js';

// Container start-up: creates DATABASE_URL's database when it does not exist
// (e.g. leilao_docker on the docker-compose PostgreSQL). On managed databases
// (deploy) it already exists and the user usually cannot create databases, so
// the target is tried first and creation is only attempted when missing.
const POSTGRES_UNKNOWN_DATABASE = '3D000';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.end();
    return; // already exists
  } catch (error) {
    if ((error as { code?: string }).code !== POSTGRES_UNKNOWN_DATABASE)
      throw error;
  }
  console.log('Database not found: creating it...');
  await ensureDatabase(url);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
