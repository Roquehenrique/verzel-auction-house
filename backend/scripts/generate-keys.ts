import { generateKeyPairSync, randomBytes } from 'node:crypto';

// Prints the secrets used by the bid history (paste them into backend/.env or
// the deploy environment). Run with: npm run keys:generate
const { privateKey } = generateKeyPairSync('ed25519');
const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });

console.log(`BID_SIGNING_PRIVATE_KEY=${privateKeyDer.toString('base64')}`);
console.log(`PSEUDONYM_SECRET=${randomBytes(32).toString('base64url')}`);
