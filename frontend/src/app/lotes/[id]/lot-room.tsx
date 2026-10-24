"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { BidForm } from "@/components/lots/bid-form";
import { BidHistory } from "@/components/lots/bid-history";
import { Countdown } from "@/components/lots/countdown";
import { LotDetails } from "@/components/lots/lot-details";
import { LotImage } from "@/components/lots/lot-image";
import { useSocketEvent, useSocketRoom } from "@/components/realtime/socket-provider";
import { Alert } from "@/components/ui/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, errorMessages } from "@/lib/api";
import { syncServerTime } from "@/lib/clock";
import { formatBRL, formatDateTime } from "@/lib/format";
import { useWallet } from "@/lib/queries";
import type {
  BidsResponse,
  LotBidEvent,
  LotDetail,
  MyBidItem,
  MyLotStatus,
  PlaceBidResponse,
} from "@/lib/types";

export function LotRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const isBidder = user?.role === "BIDDER";

  const lot = useQuery({
    queryKey: ["lot", id],
    queryFn: async () => {
      const result = await api<LotDetail>(`/lots/${id}`);
      syncServerTime(result.serverTime);
      return result;
    },
  });
  const bids = useQuery({
    queryKey: ["lot-bids", id],
    queryFn: () => api<BidsResponse>(`/lots/${id}/bids`),
    enabled: lot.isSuccess,
  });
  const myStatus = useQuery({
    queryKey: ["lot-status", id],
    queryFn: () => api<MyLotStatus>(`/lots/${id}/my-status`),
    enabled: isBidder && lot.isSuccess,
  });
  const wallet = useWallet();

  const refreshAll = useCallback(() => {
    for (const key of ["lot", "lot-bids", "lot-status"]) {
      queryClient.invalidateQueries({ queryKey: [key, id] });
    }
  }, [queryClient, id]);

  // Applies a new bid (from our own POST or from the socket) to the cache.
  const applyBid = useCallback(
    ({ bid, lot: updated }: PlaceBidResponse) => {
      queryClient.setQueryData<LotDetail>(["lot", id], (old) =>
        old ? { ...old, ...updated } : old,
      );
      queryClient.setQueryData<BidsResponse>(["lot-bids", id], (old) => {
        if (!old || old.bids.some((b) => b.sequence === bid.sequence)) return old;
        const top = old.bids[0]?.sequence ?? 0;
        if (bid.sequence !== top + 1) {
          // A bid was missed (e.g. while reconnecting): reload the history.
          queryClient.invalidateQueries({ queryKey: ["lot-bids", id] });
          return old;
        }
        return { ...old, leaderPseudonym: bid.bidderPseudonym, bids: [bid, ...old.bids] };
      });
      queryClient.invalidateQueries({ queryKey: ["lot-status", id] });
    },
    [queryClient, id],
  );

  // Real time: join the lot room; after a reconnection reload everything,
  // since events sent while offline are not replayed.
  useSocketRoom(
    { event: "lot:join", payload: { lotId: id } },
    { event: "lot:leave", payload: { lotId: id } },
    refreshAll,
  );
  useSocketEvent<LotBidEvent>("lot:bid", (event) => {
    if (event.lotId !== id) return;
    syncServerTime(event.serverTime);
    applyBid(event);
    const isMine = myStatus.data?.pseudonym === event.bid.bidderPseudonym;
    if (event.extended && !isMine) {
      toast.show({
        tone: "info",
        title: "Lote prorrogado",
        description: "Novo lance nos últimos minutos: o fim foi estendido em 2 minutos.",
      });
    }
  });
  useSocketEvent<{ lotId: string }>("lot:ended", (event) => {
    if (event.lotId !== id) return;
    refreshAll();
    queryClient.invalidateQueries({ queryKey: ["my-bids"] });
  });
  useSocketEvent<{ lotId: string }>("lot:cancelled", (event) => {
    if (event.lotId === id) refreshAll();
  });

  // Receipt link for the winner (from "meus arremates").
  const ended = lot.data?.status === "ENDED";
  const iWon = ended && myStatus.data?.isLeader === true;
  const myBids = useQuery({
    queryKey: ["my-bids"],
    queryFn: () => api<MyBidItem[]>("/bids/mine"),
    enabled: iWon,
  });
  const receipt = myBids.data?.find((item) => item.lot.id === id)?.receipt ?? null;

  if (lot.isPending) return <PageLoading />;
  if (lot.isError) {
    const notFound = lot.error instanceof ApiError && lot.error.status === 404;
    return (
      <div className="mx-auto max-w-lg py-10">
        <Alert
          tone={notFound ? "warning" : "error"}
          title={notFound ? "Lote não encontrado" : "Não foi possível carregar o lote"}
          messages={notFound ? undefined : errorMessages(lot.error)}
        >
          <div className="mt-3 flex gap-2">
            {!notFound && (
              <Button size="sm" variant="outline" onClick={() => lot.refetch()}>
                Tentar novamente
              </Button>
            )}
            <Link href="/" className="font-semibold underline">
              Voltar para a vitrine
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  const data = lot.data;
  const leaderPseudonym = bids.data?.leaderPseudonym ?? null;

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-text">
          Vitrine
        </Link>{" "}
        / <span className="text-text">{data.title}</span>
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: picture, details and history */}
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <Card className="overflow-hidden">
            <LotImage
              lotId={data.id}
              hasImage={data.hasImage}
              alt={data.title}
              className="aspect-[16/9] w-full"
            />
            <div className="p-5">
              <LotDetails lot={data} />
            </div>
          </Card>
          <Card className="p-5">
            <BidHistory
              lotId={data.id}
              bids={bids.data?.bids ?? []}
              myPseudonym={myStatus.data?.pseudonym}
            />
          </Card>
        </div>

        {/* Right: live status and bidding (first on mobile) */}
        <aside className="order-1 flex flex-col gap-4 lg:sticky lg:top-6 lg:order-2 lg:self-start">
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} />
              {data.extended && data.status === "LIVE" && (
                <Badge tone="purple">Prorrogado</Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold leading-tight">{data.title}</h1>

            <div className="mt-4 flex items-start justify-between gap-4 rounded-lg bg-surface-muted p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">
                  {data.currentBidCents === null ? "Lance inicial" : "Lance atual"}
                </p>
                <p className="whitespace-nowrap font-heading text-2xl font-bold">
                  {formatBRL(data.currentBidCents ?? data.startingBidCents)}
                </p>
                <p className="text-xs text-muted">
                  {data.bidCount} {data.bidCount === 1 ? "lance" : "lances"}
                  {leaderPseudonym && ` · líder ${leaderPseudonym}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <TimeBox lot={data} onExpire={refreshAll} />
              </div>
            </div>

            {data.extended && data.status === "LIVE" && (
              <p className="mt-2 text-xs text-muted">
                Fim original: {formatDateTime(data.originalEndsAt)}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <BidPanel
              lot={data}
              authStatus={authStatus}
              isBidder={isBidder}
              isAuctioneer={user?.role === "AUCTIONEER"}
              myStatus={myStatus.data}
              availableCents={isBidder ? wallet.data?.availableCents : undefined}
              leaderPseudonym={leaderPseudonym}
              receiptCode={receipt?.shareCode}
              onPlaced={(response) => {
                applyBid(response);
                queryClient.invalidateQueries({ queryKey: ["wallet"] });
              }}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function TimeBox({ lot, onExpire }: { lot: LotDetail; onExpire: () => void }) {
  if (lot.status === "LIVE" || lot.status === "SCHEDULED") {
    const live = lot.status === "LIVE";
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-muted">
          {live ? "Termina em" : "Começa em"}
        </p>
        <Countdown
          target={live ? lot.endsAt : lot.startsAt}
          onExpire={onExpire}
          className="font-heading text-2xl font-bold"
        />
      </>
    );
  }
  return (
    <>
      <p className="text-xs uppercase tracking-wide text-muted">
        {lot.status === "CANCELLED" ? "Cancelado" : "Encerrado em"}
      </p>
      <p className="font-medium">{formatDateTime(lot.endsAt)}</p>
    </>
  );
}

interface BidPanelProps {
  lot: LotDetail;
  authStatus: "loading" | "authenticated" | "anonymous";
  isBidder: boolean;
  isAuctioneer: boolean;
  myStatus: MyLotStatus | undefined;
  availableCents: number | undefined;
  leaderPseudonym: string | null;
  receiptCode: string | undefined;
  onPlaced: (response: PlaceBidResponse) => void;
}

function BidPanel(props: BidPanelProps) {
  const { lot, myStatus } = props;

  if (lot.status === "CANCELLED") {
    return (
      <Alert
        tone="warning"
        title="Lote cancelado"
        messages={[
          lot.cancelReason ? `Motivo informado pelo leiloeiro: ${lot.cancelReason}` : "Este lote foi cancelado pelo leiloeiro.",
          ...(myStatus?.isLeader ? ["O valor que estava reservado para o seu lance voltou ao seu saldo disponível."] : []),
        ]}
      />
    );
  }

  if (lot.status === "ENDED") {
    if (lot.bidCount === 0) {
      return <Alert tone="info" title="Encerrado sem lances" messages={["Este lote terminou sem nenhum lance."]} />;
    }
    if (myStatus?.isLeader) {
      return (
        <Alert tone="success" title="Você arrematou este lote!">
          <p>Valor final: {formatBRL(lot.currentBidCents!)}.</p>
          {props.receiptCode ? (
            <Link href={`/comprovante/${props.receiptCode}`} className="mt-1 inline-block font-semibold underline">
              Ver comprovante
            </Link>
          ) : (
            <p className="mt-1 text-xs">O comprovante é gerado em instantes pela liquidação automática.</p>
          )}
        </Alert>
      );
    }
    return (
      <Alert tone="info" title="Lote encerrado">
        <p>
          Arrematado por <strong>{props.leaderPseudonym}</strong> por {formatBRL(lot.currentBidCents!)}.
        </p>
        {myStatus?.hasBid && <p className="mt-1">Seu maior lance foi {formatBRL(myStatus.myHighestBidCents!)}.</p>}
      </Alert>
    );
  }

  if (props.authStatus === "anonymous") {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-sm text-muted">Entre como licitante para dar lances neste lote.</p>
        <Link
          href={`/login?next=/lotes/${lot.id}`}
          className="rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700"
        >
          Entrar para dar lances
        </Link>
      </div>
    );
  }

  if (props.isAuctioneer) {
    return (
      <Alert tone="info" title="Modo leiloeiro" messages={["Leiloeiros acompanham os lotes, mas não podem dar lances."]} />
    );
  }

  if (!props.isBidder) return null;

  return (
    <div className="flex flex-col gap-4">
      <LeaderIndicator status={myStatus} lot={lot} />
      {lot.status === "SCHEDULED" ? (
        <Alert
          tone="info"
          title="Lances ainda não abertos"
          messages={[`Os lances começam em ${formatDateTime(lot.startsAt)}.`]}
        />
      ) : (
        <BidForm lot={lot} availableCents={props.availableCents} onPlaced={props.onPlaced} />
      )}
    </div>
  );
}

function LeaderIndicator({ status, lot }: { status: MyLotStatus | undefined; lot: LotDetail }) {
  if (!status || !status.hasBid) {
    return (
      <p className="text-sm text-muted">
        Você ainda não deu lances neste lote. Você aparecerá como{" "}
        <strong className="text-text">{status?.pseudonym ?? "um pseudônimo"}</strong>.
      </p>
    );
  }
  if (status.isLeader) {
    return (
      <div role="status" className="rounded-lg bg-lime-500 px-4 py-3 text-navy-950">
        <p className="font-heading text-lg font-bold">Você está ganhando!</p>
        <p className="text-sm">
          Seu lance de {formatBRL(status.myHighestBidCents!)} lidera
          {status.totalBidders > 1 && ` entre ${status.totalBidders} licitantes`}.
        </p>
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-lg bg-warning-bg px-4 py-3 text-warning ring-1 ring-warning/30">
      <p className="font-heading text-lg font-bold">Você foi superado!</p>
      <p className="text-sm">
        Sua posição: {status.position}º de {status.totalBidders}. Seu maior lance:{" "}
        {formatBRL(status.myHighestBidCents!)}. Para voltar a liderar, dê pelo menos{" "}
        <strong>{formatBRL(lot.nextMinimumBidCents)}</strong>.
      </p>
    </div>
  );
}
