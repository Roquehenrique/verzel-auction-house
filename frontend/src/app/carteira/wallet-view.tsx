"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass } from "@/components/ui/field";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, errorMessages } from "@/lib/api";
import { formatBRL, formatDateTime, parseReaisToCents } from "@/lib/format";
import { useWallet } from "@/lib/queries";
import type { Wallet } from "@/lib/types";

// Same limits as the API (backend/src/wallet/dto/deposit.dto.ts).
const MIN_DEPOSIT_CENTS = 100;
const MAX_DEPOSIT_CENTS = 500_000_000;
const QUICK_DEPOSITS = [1_000_000, 5_000_000, 10_000_000]; // R$ 10k, 50k, 100k

const entryLabels: Record<Wallet["recentEntries"][number]["type"], { label: string; sign: 1 | -1 }> = {
  DEPOSIT: { label: "Depósito", sign: 1 },
  PURCHASE: { label: "Arremate (pagamento)", sign: -1 },
  SALE: { label: "Venda (recebimento)", sign: 1 },
};

export function WalletView() {
  const wallet = useWallet();

  if (wallet.isPending) return <PageLoading />;
  if (wallet.isError) {
    return (
      <Alert tone="error" title="Não foi possível carregar a carteira" messages={errorMessages(wallet.error)}>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => wallet.refetch()}>
          Tentar novamente
        </Button>
      </Alert>
    );
  }

  const data = wallet.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Carteira</h1>
        <p className="text-muted">
          Saldo simulado para dar lances. O valor dos lotes em que você lidera fica comprometido.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Saldo total" value={data.balanceCents} />
        <Stat
          label="Comprometido"
          value={data.committedCents}
          hint="Reservado nos lotes em que você está ganhando"
        />
        <Stat label="Disponível para lances" value={data.availableCents} highlight />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold">Depósito simulado</h2>
          <DepositForm />
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-lg font-semibold">Saldo comprometido</h2>
          <p className="mb-4 text-sm text-muted">
            Volta ao disponível assim que alguém cobrir seu lance. Ao arrematar, é debitado.
          </p>
          {data.commitments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
              Nenhum valor comprometido no momento.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {data.commitments.map((item) => (
                <li key={item.lotId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/lotes/${item.lotId}`} className="line-clamp-1 font-medium hover:text-purple-600">
                      {item.title}
                    </Link>
                    <p className="text-xs text-muted">Termina em {formatDateTime(item.endsAt)}</p>
                  </div>
                  <span className="font-heading font-bold">{formatBRL(item.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">Extrato</h2>
        {data.recentEntries.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma movimentação ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.recentEntries.map((entry) => {
              const { label, sign } = entryLabels[entry.type];
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {label}
                      {entry.lotId && (
                        <Link href={`/lotes/${entry.lotId}`} className="ml-2 text-xs font-normal text-purple-600 hover:underline">
                          ver lote
                        </Link>
                      )}
                    </p>
                    <p className="text-xs text-muted">{formatDateTime(entry.createdAt)}</p>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap font-semibold ${
                      sign > 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {sign > 0 ? "+" : "−"} {formatBRL(entry.amountCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  highlight = false,
}: {
  label: string;
  value: number;
  hint?: string;
  highlight?: boolean;
}) {
  // Own container instead of <Card>: the highlighted variant needs another
  // background, and two conflicting bg-* classes would depend on CSS order.
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        highlight ? "border-lime-500 bg-navy-900 text-white" : "border-border bg-surface"
      }`}
    >
      <p className={`text-xs uppercase tracking-wide ${highlight ? "text-white/70" : "text-muted"}`}>{label}</p>
      <p className={`mt-1 font-heading text-2xl font-bold ${highlight ? "text-lime-500" : ""}`}>
        {formatBRL(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function DepositForm() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [formatError, setFormatError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (amountCents: number) =>
      api<Wallet>("/wallet/deposit", { method: "POST", body: { amountCents } }),
    onSuccess: (wallet, amountCents) => {
      queryClient.setQueryData(["wallet"], wallet);
      setValue("");
      toast.show({ tone: "success", title: "Depósito realizado", description: `${formatBRL(amountCents)} adicionados ao seu saldo.` });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormatError(null);
    mutation.reset();
    const cents = parseReaisToCents(value);
    if (cents === null || cents < MIN_DEPOSIT_CENTS || cents > MAX_DEPOSIT_CENTS) {
      setFormatError("O depósito deve ser entre R$ 1,00 e R$ 5.000.000,00");
      return;
    }
    mutation.mutate(cents);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label htmlFor="deposit-amount" className="text-sm font-medium">
        Valor (R$)
      </label>
      <div className="flex gap-2">
        <input
          id="deposit-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Ex.: 50.000,00"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={!!formatError}
          className={inputClass}
        />
        <Button type="submit" loading={mutation.isPending}>
          Depositar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_DEPOSITS.map((cents) => (
          <Button
            key={cents}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setValue(formatBRL(cents).replace("R$ ", ""))}
          >
            {formatBRL(cents)}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted">Depósito fictício, sem dinheiro real. Limite de R$ 5.000.000,00 por depósito.</p>
      {formatError && <Alert tone="error" messages={[formatError]} />}
      {mutation.isError && <Alert tone="error" messages={errorMessages(mutation.error)} />}
    </form>
  );
}
