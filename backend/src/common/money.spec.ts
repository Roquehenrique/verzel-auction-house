import { formatBRL } from './money.js';

describe('formatBRL', () => {
  it.each([
    [100, 'R$ 1,00'],
    [100_000, 'R$ 1.000,00'],
    [2_000_000_000, 'R$ 20.000.000,00'],
    [0, 'R$ 0,00'],
  ])('%i cents -> %s (regular space)', (cents, expected) => {
    expect(formatBRL(cents)).toBe(expected);
  });
});
