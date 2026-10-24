"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useState } from "react";
import { LotImage } from "@/components/lots/lot-image";
import { useSocketEvent, useSocketRoom } from "@/components/realtime/socket-provider";
import { Alert } from "@/components/ui/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass } from "@/components/ui/field";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, errorMessages } from "@/lib/api";
import { formatBRL, formatDateTime } from "@/lib/format";
import type { Lot, LotResult, MyLotsResponse } from "@/lib/types";

type PanelLot = MyLotsResponse["items"][number];

export function PanelView() {
  const queryClient = useQueryClient();
  const myLots = useQuery({
    queryKey: ["my-lots"],
    queryFn: () => api<MyLotsResponse>("/lots/mine"),
  });

  // Real time: bids, endings and cancellations change the panel. The showcase
  // room carries those events for every lot.
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["my-lots"] }),
    [queryClient],
  );
  useSocketRoom({ event: "showcase:join" }, { event: "showcase:leave" }, refresh);
  useSocketEvent("showcase:update", refresh);
  useSocketEvent("lot:ended", refresh);
  useSocketEvent("lot:cancelled", refresh);

  if (myLots.isPending) return <PageLoading />;
  if (myLots.isError) {
    return (
      <Alert tone="error" title="Não foi possível carregar seus lotes" messages={errorMessages(myLots.error)}>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => myLots.refetch()}>
          Tentar novamente
        </Button>
      </Alert>
    );
  }

  const { items, summary } = myLots.data;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Painel do leiloeiro</h1>
          <p className="text-muted">Seus lotes, resultados e valores recebidos.</p>
        </div>
        <Link
          href="/painel/novo"
          className="rounded-lg bg-lime-500 px-5 py-2.5 text-center text-sm font-semibold text-navy-950 hover:bg-lime-600"
        >
          + Criar lote
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="col-span-2 rounded-xl border border-lime-500 bg-navy-900 p-5 text-white shadow-sm lg:col-span-1">
          <p className="text-xs uppercase tracking-wide text-white/70">Total recebido</p>
          <p className="mt-1 font-heading text-2xl font-bold text-lime-500">{formatBRL(summary.totalReceivedCents)}</p>
        </div>
        <Stat label="Ao vivo" value={summary.liveCount} />
        <Stat label="Agendados" value={summary.scheduledCount} />
        <Stat label="Arrematados" value={summary.soldCount} />
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted">Você ainda não criou nenhum lote.</p>
          <Link href="/painel/novo" className="mt-3 inline-block font-semibold text-purple-600 hover:underline">
            Criar o primeiro lote
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((lot) => (
            <PanelRow key={lot.id} lot={lot} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold">{value}</p>
    </Card>
  );
}

const results: Record<Exclude<LotResult, null>, { label: string; tone: "success" | "ended" | "scheduled" | "danger" }> = {
  SOLD: { label: "Arrematado", tone: "success" },
  UNSOLD: { label: "Sem lances", tone: "ended" },
  AWAITING_SETTLEMENT: { label: "Aguardando liquidação", tone: "scheduled" },
  CANCELLED: { label: "Cancelado", tone: "danger" },
};

// Same rule as the API: lots that have not ended. With bids, a reason is
// required and the leader's committed amount is refunded.
const canCancel = (lot: Lot) => lot.status === "LIVE" || lot.status === "SCHEDULED";
const MIN_REASON = 5;

function PanelRow({ lot }: { lot: PanelLot }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const hasBids = lot.bidCount > 0;
  const reasonMissing = hasBids && reason.trim().length < MIN_REASON;

  const cancel = useMutation({
    mutationFn: () =>
      api<Lot>(`/lots/${lot.id}/cancel`, {
        method: "POST",
        body: reason.trim() ? { reason: reason.trim() } : {},
      }),
    onSuccess: () => {
      setConfirming(false);
      setReason("");
      toast.show({
        tone: "info",
        title: "Lote cancelado",
        description: hasBids
          ? `${lot.title} saiu da vitrine. O valor reservado do líder foi liberado.`
          : `${lot.title} saiu da vitrine.`,
      });
      queryClient.invalidateQueries({ queryKey: ["my-lots"] });
      queryClient.invalidateQueries({ queryKey: ["lots"] });
    },
    onError: () => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["my-lots"] }); // e.g. a bid arrived meanwhile
    },
  });

  // The status badge already says "Cancelado"; avoid repeating it.
  const result = lot.result && lot.result !== "CANCELLED" ? results[lot.result] : null;

  return (
    <Card className="flex flex-col gap-4 p-4 md:flex-row md:flex-wrap md:items-center">
      <Link href={`/lotes/${lot.id}`} className="shrink-0">
        <LotImage lotId={lot.id} hasImage={lot.hasImage} alt={lot.title} className="aspect-[16/10] w-full rounded-lg md:w-36" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={lot.status} />
          {result && <Badge tone={result.tone}>{result.label}</Badge>}
          {lot.extended && lot.status === "LIVE" && <Badge tone="purple">Prorrogado</Badge>}
        </div>
        <Link href={`/lotes/${lot.id}`} className="line-clamp-1 text-lg font-semibold hover:text-purple-600">
          {lot.title}
        </Link>
        <p className="text-sm text-muted">
          {lot.status === "SCHEDULED" ? "Começa" : "Início"} {formatDateTime(lot.startsAt)} · Fim {formatDateTime(lot.endsAt)}
        </p>
        <p className="text-sm">
          {lot.result === "SOLD" ? (
            <>
              Arrematado por <strong>{formatBRL(lot.currentBidCents!)}</strong>
            </>
          ) : lot.currentBidCents !== null ? (
            <>
              Lance atual <strong>{formatBRL(lot.currentBidCents)}</strong>
            </>
          ) : (
            <>
              Lance inicial <strong>{formatBRL(lot.startingBidCents)}</strong>
            </>
          )}
          <span className="text-muted">
            {" · "}
            {lot.bidCount} {lot.bidCount === 1 ? "lance" : "lances"}
          </span>
        </p>
        {cancel.isError && <Alert tone="error" messages={errorMessages(cancel.error)} />}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-stretch">
        <Link
          href={`/lotes/${lot.id}`}
          className="rounded-lg border border-border px-4 py-2 text-center text-sm font-semibold hover:bg-surface-muted"
        >
          Ver sala
        </Link>
        {canCancel(lot) && !confirming && (
          <Button size="md" variant="danger-outline" onClick={() => setConfirming(true)}>
            Cancelar lote
          </Button>
        )}
      </div>

      {confirming && (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-danger/30 bg-danger-bg p-4 md:basis-full">
          <p className="text-sm font-semibold text-danger">Cancelar “{lot.title}”?</p>
          {hasBids ? (
            <>
              <p className="text-sm">
                O lote tem {lot.bidCount} {lot.bidCount === 1 ? "lance" : "lances"}. O valor reservado do líder
                ({formatBRL(lot.currentBidCents!)}) volta ao saldo disponível dele e os licitantes serão avisados.
              </p>
              <label htmlFor={`reason-${lot.id}`} className="text-sm font-medium">
                Motivo do cancelamento (obrigatório)
              </label>
              <textarea
                id={`reason-${lot.id}`}
                rows={2}
                maxLength={300}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex.: veículo retirado pelo proprietário"
                className={`${inputClass} h-auto py-2`}
              />
            </>
          ) : (
            <p className="text-sm">O lote ainda não recebeu lances e sairá da vitrine.</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={cancel.isPending}
              disabled={reasonMissing}
              onClick={() => cancel.mutate()}
            >
              Confirmar cancelamento
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
