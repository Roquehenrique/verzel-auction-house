import { validateEnv } from './env.validation.js';

const valid = {
  DATABASE_URL: 'postgresql://localhost/db',
  JWT_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a valid environment', () => {
    expect(validateEnv(valid)).toEqual(valid);
  });

  it('requires DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('requires a JWT_SECRET with at least 32 characters', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejects the .env.example placeholder secret in production', () => {
    const placeholder = 'troque-este-segredo-por-um-valor-aleatorio-longo';
    expect(() =>
      validateEnv({
        ...valid,
        JWT_SECRET: placeholder,
        NODE_ENV: 'production',
      }),
    ).toThrow(/placeholder/);
    expect(() =>
      validateEnv({ ...valid, JWT_SECRET: placeholder }),
    ).not.toThrow();
  });

  it('rejects non-positive numeric settings', () => {
    expect(() => validateEnv({ ...valid, AUTH_RATE_LIMIT: '0' })).toThrow(
      /AUTH_RATE_LIMIT/,
    );
    expect(() =>
      validateEnv({ ...valid, JWT_EXPIRES_IN_SECONDS: 'abc' }),
    ).toThrow(/JWT_EXPIRES_IN_SECONDS/);
  });
});
