import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('verifies the correct password', async () => {
    const stored = await hashPassword('Senha@123');
    await expect(verifyPassword('Senha@123', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('Senha@123');
    await expect(verifyPassword('senha@123', stored)).resolves.toBe(false);
  });

  it('uses a random salt (same password, different hashes)', async () => {
    const [a, b] = await Promise.all([hashPassword('x'), hashPassword('x')]);
    expect(a).not.toBe(b);
  });

  it('rejects a malformed stored value', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
  });
});
