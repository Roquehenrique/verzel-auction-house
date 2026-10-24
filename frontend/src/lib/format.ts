// The API works with integer cents; the UI shows and reads reais.

export function formatBRL(cents: number): string {
  return (cents / 100)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/ /g, " ");
}

// "1.234,56" | "1234,56" | "1234.56" | "1234" -> 123456 (cents). null if invalid.
export function parseReaisToCents(input: string): number | null {
  const cleaned = input.replace(/[R$\s]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  // Brazilian format uses "." for thousands and "," for decimals.
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatKm(km: number): string {
  return `${km.toLocaleString("pt-BR")} km`;
}
