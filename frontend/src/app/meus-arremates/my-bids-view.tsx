"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LotImage } from "@/components/lots/lot-image";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, errorMessages } from "@/lib/api";
import { formatBRL, formatDateTime } from "@/lib/format";
import type { MyBidItem, MyBidOutcome } from "@/lib/types";

const outcomes: Record<
  MyBidOutcome,
  { label: string; tone: "live" | "danger" | "success" | "ended" | "purple" | "scheduled" }
> = {
  WINNING: { label: "Ganhando", tone: "live" },
  OUTBID: { label: "Superado", tone: "danger" },
  AWAITING_SETTLEMENT: { label: "Arrematado · processando", tone: "scheduled" },
  WON: { label: "Arrematado", tone: "success" },
  LOST: { label: "Não arrematado", tone: "ended" },
  CANCELLED: { label: "Cancelado", tone: "ended" },
};

const sections: Array<{ title: string; outcomes: MyBidOutcome[]; empty: string }> = [
  { title: "Em andamento", outcomes: ["WINNING", "OUTBID"], empty: "Você não está disputando nenhum lote ao vivo." },
  { title: "Arrematados", outcomes: ["WON", "AWAITING_SETTLEMENT"], empty: "Você ainda não arrematou nenhum lote." },
  { title: "Encerrados", outcomes: ["LOST", "CANCELLED"], empty: "Nenhum lote encerrado." },
];

export function MyBidsView() {
  // Refreshed by the "user:outbid" / "user:won" socket events (SocketProvider).
  const myBids = useQuery({
    queryKey: ["my-bids"],
    queryFn: () => api<MyBidItem[]>("/bids/mine"),
  });

  if (myBids.isPending) return <PageLoading />;
  if (myBids.isError) {
    return (
      <Alert tone="error" title="Não foi possível carregar seus lances" messages={errorMessages(myBids.error)}>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => myBids.refetch()}>
          Tentar novamente
        </Button>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Meus arremates</h1>
        <p className="text-muted">Lotes em que você deu lances e os que você arrematou.</p>
      </div>

      {myBids.data.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted">Você ainda não deu nenhum lance.</p>
          <Link href="/" className="mt-3 inline-block font-semibold text-purple-600 hover:underline">
            Ver lotes ao vivo
          </Link>
        </Card>
      ) : (
        sections.map((section) => {
          const items = myBids.data.filter((item) => section.outcomes.includes(item.outcome));
          return (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">
                {section.title} <span className="text-base font-normal text-muted">({items.length})</span>
              </h2>
              {items.length === 0 ? (
                <p className="text-sm text-muted">{section.empty}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <MyBidRow key={item.lot.id} item={item} />
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function MyBidRow({ item }: { item: MyBidItem }) {
  const toast = useToast();
  const { lot, outcome, receipt } = item;
  const { label, tone } = outcomes[outcome];
  const finished = lot.status === "ENDED" || lot.status === "CANCELLED";

  const copyLink = async (shareCode: string) => {
    const url = `${window.location.origin}/comprovante/${shareCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ tone: "success", title: "Link copiado", description: "Compartilhe o comprovante com quem quiser." });
    } catch {
      toast.show({ tone: "info", title: "Copie o link", description: url });
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <Link href={`/lotes/${lot.id}`} className="shrink-0">
        <LotImage lotId={lot.id} hasImage={lot.hasImage} alt={lot.title} className="aspect-[16/10] w-full rounded-lg sm:w-40" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{label}</Badge>
          <span className="text-xs text-muted">
            {finished ? "Encerrado em" : "Termina em"} {formatDateTime(lot.endsAt)}
          </span>
        </div>
        <Link href={`/lotes/${lot.id}`} className="line-clamp-1 text-lg font-semibold hover:text-purple-600">
          {lot.title}
        </Link>
        <p className="text-sm text-muted">
          Seu maior lance: <strong className="text-text">{formatBRL(item.myHighestBidCents)}</strong>
          {" · "}
          {item.myBidCount} {item.myBidCount === 1 ? "lance seu" : "lances seus"}
          {lot.currentBidCents !== null && (
            <>
              {" · "}
              {finished ? "Valor final" : "Lance atual"}: <strong className="text-text">{formatBRL(lot.currentBidCents)}</strong>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
        {receipt ? (
          <>
            <Link
              href={`/comprovante/${receipt.shareCode}`}
              className="rounded-lg bg-navy-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-navy-700"
            >
              Ver comprovante
            </Link>
            <Button variant="outline" size="md" onClick={() => copyLink(receipt.shareCode)}>
              Copiar link
            </Button>
          </>
        ) : outcome === "OUTBID" ? (
          <Link
            href={`/lotes/${lot.id}`}
            className="rounded-lg bg-lime-500 px-4 py-2 text-center text-sm font-semibold text-navy-950 hover:bg-lime-600"
          >
            Cobrir lance
          </Link>
        ) : outcome === "WINNING" ? (
          <Link href={`/lotes/${lot.id}`} className="rounded-lg border border-border px-4 py-2 text-center text-sm font-semibold hover:bg-surface-muted">
            Acompanhar
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
