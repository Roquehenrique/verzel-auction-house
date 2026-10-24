"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { LotImage } from "@/components/lots/lot-image";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, errorMessages } from "@/lib/api";
import { formatBRL, formatDateTime } from "@/lib/format";
import type { PublicKeyResponse, ReceiptResponse } from "@/lib/types";
import { verifyReceiptInBrowser } from "@/lib/verify";

export function ReceiptView({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const toast = useToast();

  const receipt = useQuery({
    queryKey: ["receipt", code],
    queryFn: () => api<ReceiptResponse>(`/receipts/${encodeURIComponent(code)}`),
  });
  const publicKey = useQuery({
    queryKey: ["audit-public-key"],
    queryFn: () => api<PublicKeyResponse>("/audit/public-key"),
    staleTime: Infinity,
  });
  const browserValid = useQuery({
    queryKey: ["receipt-browser", code, receipt.dataUpdatedAt],
    queryFn: () =>
      verifyReceiptInBrowser({
        lotId: receipt.data!.lot.id,
        bidCount: receipt.data!.bidCount,
        receipt: receipt.data!,
        publicKeyBase64: publicKey.data!.publicKeyBase64,
      }),
    enabled: receipt.isSuccess && publicKey.isSuccess,
    staleTime: Infinity,
  });

  if (receipt.isPending) return <PageLoading />;
  if (receipt.isError) {
    const notFound = receipt.error instanceof ApiError && receipt.error.status === 404;
    return (
      <div className="mx-auto max-w-lg py-10">
        <Alert
          tone={notFound ? "warning" : "error"}
          title={notFound ? "Comprovante não encontrado" : "Não foi possível carregar o comprovante"}
          messages={notFound ? ["Confira se o link foi copiado por completo."] : errorMessages(receipt.error)}
        />
      </div>
    );
  }

  const data = receipt.data;
  const valid = data.signatureValid && browserValid.data !== false;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.show({ tone: "success", title: "Link copiado" });
    } catch {
      toast.show({ tone: "info", title: "Copie o link", description: window.location.href });
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Card className="overflow-hidden">
        <div className="bg-navy-900 px-6 py-5 text-white">
          <div className="mb-3 h-1 w-12 rounded-full bg-teal-500" />
          <p className="text-xs uppercase tracking-widest text-white/70">Comprovante de arremate</p>
          <h1 className="mt-1 text-2xl font-bold">{data.lot.title}</h1>
        </div>

        <LotImage lotId={data.lot.id} hasImage={data.lot.hasImage} alt={data.lot.title} className="aspect-[16/8] w-full" />

        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Valor do arremate</p>
              <p className="font-heading text-3xl font-bold text-text">{formatBRL(data.amountCents)}</p>
            </div>
            <div
              role="status"
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                valid ? "bg-lime-100 text-text ring-1 ring-lime-500" : "bg-danger-bg text-danger ring-1 ring-danger/40"
              }`}
            >
              {valid ? "✓ Assinatura válida" : "✗ Assinatura inválida"}
              <span className="block text-xs font-normal">
                {browserValid.isPending
                  ? "conferindo no navegador…"
                  : valid
                    ? "conferida pelo servidor e no seu navegador"
                    : "o comprovante ou o histórico foi alterado"}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Item label="Arrematante" value={data.winnerPseudonym} />
            <Item label="Leiloeiro" value={data.lot.auctioneer.name} />
            <Item label="Veículo" value={`${data.lot.make} ${data.lot.model} ${data.lot.year}`} />
            <Item label="Lances no lote" value={String(data.bidCount)} />
            <Item label="Encerramento" value={formatDateTime(data.lot.endedAt)} />
            <Item label="Emitido em" value={formatDateTime(data.issuedAt)} />
          </dl>

          <div className="rounded-lg bg-surface-muted p-3 text-xs">
            <p className="font-semibold text-muted">Hash final do histórico de lances</p>
            <p className="break-all font-mono">{data.chainHeadHash}</p>
          </div>

          <p className="text-xs text-muted">
            O arrematante é identificado por um pseudônimo, sem dados pessoais. Este comprovante é assinado
            digitalmente e registra o último elo do histórico de lances: qualquer alteração posterior no histórico
            invalida a assinatura.
          </p>

          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={copyLink}>Copiar link</Button>
            <Link
              href={`/lotes/${data.lot.id}/auditoria`}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-muted"
            >
              Auditar histórico
            </Link>
            <Button variant="ghost" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
