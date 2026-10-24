import { ensureDatabase, migrateDeploy } from '../scripts/database.js';
import { assertTestDatabase, TEST_DATABASE_URL } from './test-env.js';

// Runs once before the e2e suite: creates the test database if needed and
// applies the migrations (non-destructive `migrate deploy`).
export default async function setup() {
  assertTestDatabase(TEST_DATABASE_URL);
  await ensureDatabase(TEST_DATABASE_URL);
  migrateDeploy(TEST_DATABASE_URL);
}
