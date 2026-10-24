import { generateKeyPairSync } from 'node:crypto';
import { validateEnv } from './env.validation.js';

const ed25519 = generateKeyPairSync('ed25519')
  .privateKey.export({ format: 'der', type: 'pkcs8' })
  .toString('base64');

const valid = {
  DATABASE_URL: 'postgresql://localhost/db',
  JWT_SECRET: 'a'.repeat(32),
  BID_SIGNING_PRIVATE_KEY: ed25519,
  PSEUDONYM_SECRET: 'p'.repeat(32),
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

  it('requires a valid Ed25519 signing key for the bid history', () => {
    expect(() =>
      validateEnv({ ...valid, BID_SIGNING_PRIVATE_KEY: undefined }),
    ).toThrow(/BID_SIGNING_PRIVATE_KEY is required/);
    expect(() =>
      validateEnv({ ...valid, BID_SIGNING_PRIVATE_KEY: 'bm90LWEta2V5' }),
    ).toThrow(/must be a base64 PKCS#8 Ed25519 key/);

    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 })
      .privateKey.export({ format: 'der', type: 'pkcs8' })
      .toString('base64');
    expect(() =>
      validateEnv({ ...valid, BID_SIGNING_PRIVATE_KEY: rsa }),
    ).toThrow(/Ed25519/);
  });

  it('requires a PSEUDONYM_SECRET with at least 32 characters', () => {
    expect(() => validateEnv({ ...valid, PSEUDONYM_SECRET: 'short' })).toThrow(
      /PSEUDONYM_SECRET/,
    );
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
