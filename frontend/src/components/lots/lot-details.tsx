import { formatBRL, formatDateTime, formatKm } from "@/lib/format";
import type { Lot } from "@/lib/types";

// Vehicle attributes and auction rules of a lot.
export function LotDetails({ lot }: { lot: Lot }) {
  const vehicle: Array<[string, string | undefined]> = [
    ["Marca", lot.make],
    ["Modelo", lot.model],
    ["Ano", String(lot.year)],
    ["Quilometragem", lot.attributes.mileageKm !== undefined ? formatKm(lot.attributes.mileageKm) : undefined],
    ["Cor", lot.attributes.color],
    ["Combustível", lot.attributes.fuel],
    ["Câmbio", lot.attributes.transmission],
    ["Condição", lot.attributes.condition],
  ];
  const rules: Array<[string, string]> = [
    ["Lance inicial", formatBRL(lot.startingBidCents)],
    ["Incremento mínimo", formatBRL(lot.minIncrementCents)],
    ["Início", formatDateTime(lot.startsAt)],
    ["Fim", formatDateTime(lot.endsAt)],
    ...(lot.extended
      ? ([["Fim original", formatDateTime(lot.originalEndsAt)]] as Array<[string, string]>)
      : []),
    ["Leiloeiro", lot.auctioneer.name],
  ];

  return (
    <div className="flex flex-col gap-5">
      {lot.description && <p className="text-sm leading-relaxed">{lot.description}</p>}
      <DefinitionList title="Veículo" items={vehicle} />
      <DefinitionList title="Regras do lote" items={rules} />
      <p className="text-xs text-muted">
        Lance nos últimos 2 minutos prorroga o fim para 2 minutos após o lance.
        {lot.externalSource === "nhtsa" && " Dados do veículo: NHTSA vPIC; imagem: Wikimedia Commons."}
      </p>
    </div>
  );
}

function DefinitionList({
  title,
  items,
}: {
  title: string;
  items: Array<[string, string | undefined]>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {items
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
