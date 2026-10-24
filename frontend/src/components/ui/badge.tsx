import type { ReactNode } from "react";
import type { LotStatus } from "@/lib/types";

const tones = {
  live: "bg-lime-100 text-navy-900 ring-lime-500/40",
  scheduled: "bg-teal-100 text-navy-900 ring-teal-500/40",
  ended: "bg-surface-muted text-muted ring-border",
  danger: "bg-danger-bg text-danger ring-danger/30",
  purple: "bg-purple-100 text-purple-600 ring-purple-600/30",
  success: "bg-success-bg text-success ring-success/30",
};

export function Badge({
  tone,
  children,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const statusBadge: Record<LotStatus, { tone: keyof typeof tones; label: string }> =
  {
    LIVE: { tone: "live", label: "Ao vivo" },
    SCHEDULED: { tone: "scheduled", label: "Agendado" },
    ENDED: { tone: "ended", label: "Encerrado" },
    CANCELLED: { tone: "danger", label: "Cancelado" },
  };

export function StatusBadge({ status }: { status: LotStatus }) {
  const { tone, label } = statusBadge[status];
  return (
    <Badge tone={tone}>
      {status === "LIVE" && (
        <span className="size-1.5 animate-pulse rounded-full bg-lime-600" />
      )}
      {label}
    </Badge>
  );
}
