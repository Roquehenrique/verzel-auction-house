"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageLoading, Spinner } from "@/components/ui/spinner";
import { api, ApiError, errorMessages } from "@/lib/api";
import { formatBRL, formatDateTime } from "@/lib/format";
import type { AuditCheckGroup, AuditResponse, PublicKeyResponse } from "@/lib/types";
import { verifyInBrowser, type BidCheck } from "@/lib/verify";

const groupLabels: Record<AuditCheckGroup, string> = {
  chain: "Corrente de hashes e assinaturas",
  bidders: "Autoria dos lances",
  lotState: "Estado do lote",
  rules: "Regras de lance",
  receipt: "Comprovante",
};

const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

export function AuditView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // Always fresh: an audit must reflect the database right now.
  const audit = useQuery({
    queryKey: ["audit", id],
    queryFn: () => api<AuditResponse>(`/lots/${id}/audit`),
    staleTime: 0,
  });
  const publicKey = useQuery({
    queryKey: ["audit-public-key"],
    queryFn: () => api<PublicKeyResponse>("/audit/public-key"),
    staleTime: Infinity,
  });
  // Independent check computed in this browser (SHA-256 + Ed25519).
  const browser = useQuery({
    queryKey: ["audit-browser", id, audit.dataUpdatedAt],
    queryFn: () =>
      verifyInBrowser({
        lotId: audit.data!.lot.id,
        bids: audit.data!.bids,
        lotBidCount: audit.data!.lot.bidCount,
        lotLastBidHash: audit.data!.lot.lastBidHash,
        receipt: audit.data!.receipt,
        publicKeyBase64: publicKey.data!.publicKeyBase64,
      }),
    enabled: audit.isSuccess && publicKey.isSuccess,
    staleTime: Infinity,
  });

  if (audit.isPending) return <PageLoading />;
  if (audit.isError) {
    const notFound = audit.error instanceof ApiError && audit.error.status === 404;
    return (
      <Alert tone={notFound ? "warning" : "error"} title={notFound ? "Lote não encontrado" : "Não foi possível carregar a auditoria"} messages={notFound ? undefined : errorMessages(audit.error)}>
        <Link href="/" className="mt-2 inline-block font-semibold underline">
          Voltar para a vitrine
        </Link>
      </Alert>
    );
  }

  const { lot, bids, receipt, verification } = audit.data;
  const checksBySequence = new Map(browser.data?.bids.map((check) => [check.sequence, check]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav className="text-sm text-muted">
          <Link href={`/lotes/${lot.id}`} className="hover:text-text">
            ← Voltar para o lote
          </Link>
        </nav>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">Auditoria do lote</h1>
          <StatusBadge status={lot.status} />
        </div>
        <p className="text-muted">
          {lot.title} · {bids.length} {bids.length === 1 ? "lance" : "lances"} · verificado em{" "}
          {formatDateTime(verification.checkedAt)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Verdict
          title="Verificação do servidor"
          intact={verification.intact}
          description={
            verification.intact
              ? "Corrente, assinaturas, autoria, estado do lote, regras de lance e comprovante conferem."
              : "Foram encontradas inconsistências no histórico:"
          }
        >
          {!verification.intact && (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {verification.issues.map((issue, index) => (
                <li key={index}>
                  <strong>{groupLabels[issue.check]}</strong>
                  {issue.sequence !== null && ` · lance #${issue.sequence}`}: {issue.problem}
                </li>
              ))}
            </ul>
          )}
        </Verdict>

        {browser.isPending || publicKey.isPending ? (
          <Card className="flex items-center gap-3 p-5 text-muted">
            <Spinner className="size-5" /> Verificando no seu navegador…
          </Card>
        ) : browser.isError || publicKey.isError ? (
          <Alert tone="error" title="Não foi possível verificar no navegador" messages={errorMessages(browser.error ?? publicKey.error)} />
        ) : (
          <Verdict
            title="Verificação independente no seu navegador"
            intact={browser.data.intact}
            description={
              browser.data.intact
                ? `${bids.length} ${bids.length === 1 ? "lance conferido" : "lances conferidos"}: hashes SHA-256 recalculados aqui, corrente encadeada e assinaturas Ed25519 válidas para a chave pública do servidor.`
                : "O histórico recebido não confere com os hashes e assinaturas:"
            }
          >
            {!browser.data.intact && (
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
                {browser.data.bids.flatMap((check) => problems(check)).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
                {!browser.data.lotStateOk && <li>O estado do lote não corresponde ao último lance.</li>}
                {browser.data.receiptOk === false && <li>O comprovante não confere com a assinatura ou com o histórico.</li>}
              </ul>
            )}
          </Verdict>
        )}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-lg font-semibold">Histórico completo</h2>
        {bids.length === 0 ? (
          <p className="text-sm text-muted">Este lote não recebeu lances.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {bids.map((bid) => {
              const check = checksBySequence.get(bid.sequence);
              return (
                <li key={`${bid.sequence}-${bid.hash}`} className="flex flex-col gap-2 py-3 text-sm md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      #{bid.sequence} · {bid.bidderPseudonym} · {formatBRL(bid.amountCents)}
                    </p>
                    <p className="text-xs text-muted">{formatDateTime(bid.createdAt)}</p>
                    <p className="break-all font-mono text-xs text-muted" title={`anterior: ${bid.prevHash}\nhash: ${bid.hash}`}>
                      anterior {short(bid.prevHash)} → hash {short(bid.hash)}
                    </p>
                  </div>
                  {check && (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <CheckChip ok={check.sequenceOk && check.linkOk} label="Encadeado" />
                      <CheckChip ok={check.hashOk} label="Hash" />
                      <CheckChip ok={check.signatureOk} label="Assinatura" />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {receipt && (
          <p className="mt-4 rounded-lg bg-surface-muted p-3 text-sm">
            Comprovante: {receipt.winnerPseudonym} arrematou por {formatBRL(receipt.amountCents)} em{" "}
            {formatDateTime(receipt.issuedAt)}. Hash final registrado: <span className="font-mono">{short(receipt.chainHeadHash)}</span>
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5 text-sm">
        <h2 className="text-lg font-semibold">Como funciona</h2>
        <p>
          Cada lance guarda o <strong>hash SHA-256</strong> dos seus dados somado ao hash do lance anterior,
          formando uma corrente: alterar, apagar ou inserir qualquer lance quebra todos os hashes seguintes.
          Cada hash também é <strong>assinado (Ed25519)</strong> com uma chave privada que fica fora do banco de
          dados, então nem quem tem acesso ao banco consegue refazer a corrente.
        </p>
        <p>
          Esta página confere a corrente e as assinaturas <strong>no seu navegador</strong>, usando apenas a chave
          pública abaixo, sem depender do veredito do servidor. A autoria (pseudônimo × licitante) e as regras de
          lance são conferidas apenas pelo servidor, pois usam dados privados.
        </p>
        {publicKey.data && (
          <details>
            <summary className="cursor-pointer font-semibold text-purple-600">Chave pública e formato dos hashes</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-navy-900 p-3 text-xs text-white">{`${publicKey.data.publicKeyPem}
hash do lance = SHA-256("${publicKey.data.bidHash.format}")
primeiro lance: prevHash = ${publicKey.data.bidHash.genesisPrevHash.slice(0, 16)}…`}</pre>
          </details>
        )}
        <div>
          <Button size="sm" variant="outline" onClick={() => audit.refetch()} loading={audit.isFetching}>
            Verificar novamente
          </Button>
        </div>
      </Card>
    </div>
  );
}

function problems(check: BidCheck): string[] {
  const list: string[] = [];
  if (!check.sequenceOk) list.push(`Lance #${check.sequence}: numeração fora de ordem (lance removido ou inserido).`);
  if (!check.linkOk) list.push(`Lance #${check.sequence}: não aponta para o lance anterior.`);
  if (!check.hashOk) list.push(`Lance #${check.sequence}: dados alterados (hash não confere).`);
  if (!check.signatureOk) list.push(`Lance #${check.sequence}: assinatura inválida.`);
  return list;
}

function Verdict({
  title,
  intact,
  description,
  children,
}: {
  title: string;
  intact: boolean;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={`rounded-xl border-2 p-5 ${intact ? "border-lime-500 bg-lime-100" : "border-danger bg-danger-bg"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className={`mt-1 font-heading text-2xl font-bold ${intact ? "text-text" : "text-danger"}`}>
        {intact ? "✓ Histórico íntegro" : "✗ Histórico adulterado"}
      </p>
      <p className="mt-1 text-sm">{description}</p>
      {children}
    </div>
  );
}

function CheckChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
      }`}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}
