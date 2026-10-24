"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { api, ApiError, errorMessages } from "@/lib/api";
import { formatBRL, parseReaisToCents } from "@/lib/format";
import type { Lot, PlaceBidResponse } from "@/lib/types";

// Title shown above the server message for each refusal code.
const rejectionTitles: Record<string, string> = {
  BELOW_MINIMUM: "Lance abaixo do mínimo",
  INSUFFICIENT_BALANCE: "Saldo insuficiente",
  ALREADY_WINNING: "Você já está ganhando",
  LOT_NOT_STARTED: "Lote ainda não iniciado",
  LOT_ENDED: "Lote encerrado",
  LOT_CANCELLED: "Lote cancelado",
};

// "R$ 685.000,00" -> "685.000,00" (the input shows reais without the symbol)
const toInput = (cents: number) => formatBRL(cents).replace("R$ ", "");

interface BidFormProps {
  lot: Lot;
  availableCents: number | undefined;
  onPlaced: (response: PlaceBidResponse) => void;
}

// The business rules (minimum, balance, "already winning", lot status) are
// decided by the API only; the form shows the exact message it returns.
export function BidForm({ lot, availableCents, onPlaced }: BidFormProps) {
  // null = follow the current minimum (updates when someone else bids).
  const [typed, setTyped] = useState<string | null>(null);
  const [formatError, setFormatError] = useState<string | null>(null);
  // Number of bids when the last attempt was made: feedback about an attempt
  // is hidden once the lot changes (e.g. "você já está ganhando" after being
  // outbid would be stale and contradictory).
  const [attemptBidCount, setAttemptBidCount] = useState<number | null>(null);
  const value = typed ?? toInput(lot.nextMinimumBidCents);
  const amountCents = parseReaisToCents(value);

  const mutation = useMutation({
    mutationFn: (amount: number) =>
      api<PlaceBidResponse>(`/lots/${lot.id}/bids`, {
        method: "POST",
        body: { amountCents: amount },
      }),
    onSuccess: (response) => {
      setTyped(null);
      onPlaced(response);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormatError(null);
    mutation.reset();
    setAttemptBidCount(lot.bidCount);
    if (amountCents === null || amountCents <= 0) {
      setFormatError("Informe um valor válido, por exemplo 685.000,00");
      return;
    }
    mutation.mutate(amountCents);
  };

  const quick = [
    { label: "Mínimo", cents: lot.nextMinimumBidCents },
    { label: "+1 incremento", cents: lot.nextMinimumBidCents + lot.minIncrementCents },
    { label: "+5 incrementos", cents: lot.nextMinimumBidCents + 5 * lot.minIncrementCents },
  ];

  const error = attemptBidCount === lot.bidCount ? mutation.error : null;
  // Our own accepted bid stays visible until someone else bids.
  const accepted =
    mutation.isSuccess && mutation.data.bid.sequence === lot.bidCount ? mutation.data : null;
  const code = error instanceof ApiError ? error.code : undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor="bid-amount" className="font-medium">
          Seu lance (R$)
        </label>
        <span className="text-muted">
          Mínimo: <strong className="text-text">{formatBRL(lot.nextMinimumBidCents)}</strong>
        </span>
      </div>

      <div className="flex gap-2">
        <input
          id="bid-amount"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => setTyped(event.target.value)}
          aria-invalid={!!formatError || !!error}
          className={`${inputClass} h-12 font-heading text-lg font-semibold`}
        />
        <Button type="submit" variant="accent" size="lg" loading={mutation.isPending}>
          Dar lance
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {quick.map((option) => (
          <Button
            key={option.label}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setTyped(toInput(option.cents))}
          >
            {option.label} · {formatBRL(option.cents)}
          </Button>
        ))}
      </div>

      {availableCents !== undefined && (
        <p className="text-xs text-muted">
          Saldo disponível para lances: <strong>{formatBRL(availableCents)}</strong>
          {" · "}
          <Link href="/carteira" className="text-purple-600 hover:underline">
            Depositar
          </Link>
        </p>
      )}

      {formatError && <Alert tone="error" messages={[formatError]} />}

      {error && (
        <Alert
          tone="error"
          title={code ? rejectionTitles[code] : "Lance não registrado"}
          messages={errorMessages(error)}
        >
          {code === "INSUFFICIENT_BALANCE" && (
            <Link href="/carteira" className="mt-1 inline-block font-semibold underline">
              Ir para a carteira
            </Link>
          )}
        </Alert>
      )}

      {accepted && (
        <Alert tone="success" title="Lance registrado!">
          <p>
            Seu lance de {formatBRL(accepted.bid.amountCents)} foi aceito.
            {accepted.extended && " O fim do lote foi prorrogado em 2 minutos."}
          </p>
        </Alert>
      )}
    </form>
  );
}
