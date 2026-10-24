// Money is always integer cents. Values are capped at R$ 20.000.000,00 so that
// "current bid + increment" can never overflow the database INTEGER column
// (max 2.147.483.647 cents).
export const MAX_AMOUNT_CENTS = 2_000_000_000;

// Minimum increment / starting bid: R$ 1,00.
export const MIN_AMOUNT_CENTS = 100;

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
