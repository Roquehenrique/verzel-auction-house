"use client";

import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatBRL, formatDateTime, formatKm } from "@/lib/format";
import type { Lot } from "@/lib/types";
import { Countdown } from "./countdown";
import { LotImage } from "./lot-image";

interface LotCardProps {
  lot: Lot;
  onTimeReached?: () => void;
}

export function LotCard({ lot, onTimeReached }: LotCardProps) {
  const details = [
    String(lot.year),
    lot.attributes.mileageKm !== undefined && formatKm(lot.attributes.mileageKm),
    lot.attributes.fuel,
  ].filter(Boolean);

  return (
    <Link
      href={`/lotes/${lot.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md"
    >
      <div className="relative">
        <LotImage
          lotId={lot.id}
          hasImage={lot.hasImage}
          alt={lot.title}
          className="aspect-[16/10] w-full"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          <StatusBadge status={lot.status} />
          {lot.extended && lot.status === "LIVE" && <Badge tone="purple">Prorrogado</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold group-hover:text-purple-600">
            {lot.title}
          </h3>
          <p className="text-sm text-muted">{details.join(" · ")}</p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <Price lot={lot} />
          <div className="text-right text-sm">
            <TimeInfo lot={lot} onTimeReached={onTimeReached} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function Price({ lot }: { lot: Lot }) {
  const hasBids = lot.currentBidCents !== null;

  if (lot.status === "ENDED" && !hasBids) {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Resultado</p>
        <p className="font-heading text-lg font-semibold text-muted">Sem lances</p>
        <p className="text-xs text-muted">Inicial: {formatBRL(lot.startingBidCents)}</p>
      </div>
    );
  }

  const label =
    lot.status === "ENDED" ? "Lance vencedor" : hasBids ? "Lance atual" : "Lance inicial";
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-heading text-xl font-bold text-text">
        {formatBRL(lot.currentBidCents ?? lot.startingBidCents)}
      </p>
      <p className="text-xs text-muted">
        {lot.bidCount} {lot.bidCount === 1 ? "lance" : "lances"}
      </p>
    </div>
  );
}

function TimeInfo({ lot, onTimeReached }: LotCardProps) {
  if (lot.status === "LIVE") {
    return (
      <>
        <p className="text-xs text-muted">Termina em</p>
        <Countdown target={lot.endsAt} onExpire={onTimeReached} className="font-semibold" />
      </>
    );
  }
  if (lot.status === "SCHEDULED") {
    return (
      <>
        <p className="text-xs text-muted">Começa em</p>
        <Countdown target={lot.startsAt} onExpire={onTimeReached} className="font-semibold" />
      </>
    );
  }
  return (
    <>
      <p className="text-xs text-muted">Encerrado em</p>
      <p className="font-medium">{formatDateTime(lot.endsAt)}</p>
    </>
  );
}

export function LotCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="aspect-[16/10] w-full animate-pulse bg-surface-muted" />
      <div className="flex flex-col gap-3 p-4">
        <div className="h-5 w-3/4 animate-pulse rounded bg-surface-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-muted" />
        <div className="h-8 w-1/3 animate-pulse rounded bg-surface-muted" />
      </div>
    </div>
  );
}
