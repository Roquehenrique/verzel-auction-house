// Environment used by the e2e tests. They run against a separate database so
// they never touch the development data (seed).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://leilao:leilao@localhost:5432/leilao_test';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'e2e-test-secret-with-at-least-32-characters',
  JWT_EXPIRES_IN_SECONDS: '3600',
  AUTH_RATE_LIMIT: '1000', // tests log in many times
};

// Safety net: the e2e tests truncate tables, so refuse anything that is not a test database.
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests against "${name}": the database name must end with "_test"`,
    );
  }
}
