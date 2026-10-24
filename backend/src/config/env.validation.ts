import { parsePrivateKey } from '../bids/bid-signer.service.js';

// Validates the environment once at startup, so a missing variable stops the API
// immediately instead of failing later in the middle of a request.
export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];

  if (!config.DATABASE_URL) errors.push('DATABASE_URL is required');

  const jwtSecret = config.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    errors.push('JWT_SECRET is required and must have at least 32 characters');
  } else if (
    config.NODE_ENV === 'production' &&
    jwtSecret.startsWith('troque-este-segredo')
  ) {
    errors.push('JWT_SECRET still has the placeholder value from .env.example');
  }

  // Secrets of the tamper-evident bid history (generate with `npm run keys:generate`).
  const signingKey = config.BID_SIGNING_PRIVATE_KEY;
  if (typeof signingKey !== 'string' || signingKey === '') {
    errors.push(
      'BID_SIGNING_PRIVATE_KEY is required (run: npm run keys:generate)',
    );
  } else {
    try {
      parsePrivateKey(signingKey);
    } catch {
      errors.push(
        'BID_SIGNING_PRIVATE_KEY must be a base64 PKCS#8 Ed25519 key (run: npm run keys:generate)',
      );
    }
  }

  const pseudonymSecret = config.PSEUDONYM_SECRET;
  if (typeof pseudonymSecret !== 'string' || pseudonymSecret.length < 32) {
    errors.push(
      'PSEUDONYM_SECRET is required and must have at least 32 characters (run: npm run keys:generate)',
    );
  }

  for (const key of ['JWT_EXPIRES_IN_SECONDS', 'AUTH_RATE_LIMIT']) {
    const value = config[key];
    if (value !== undefined && !(Number(value) > 0)) {
      errors.push(`${key} must be a positive number`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}
