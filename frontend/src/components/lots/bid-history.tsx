import Link from "next/link";
import { formatBRL } from "@/lib/format";
import type { PublicBid } from "@/lib/types";

interface BidHistoryProps {
  lotId: string;
  bids: PublicBid[]; // newest first
  myPseudonym?: string | null;
}

const time = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function BidHistory({ lotId, bids, myPseudonym }: BidHistoryProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Histórico de lances</h2>
        <Link
          href={`/lotes/${lotId}/auditoria`}
          className="text-sm font-semibold text-purple-600 hover:underline"
        >
          Auditar histórico
        </Link>
      </div>

      {bids.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
          Nenhum lance ainda. Seja o primeiro!
        </p>
      ) : (
        <ol className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {bids.map((bid, index) => {
            const mine = myPseudonym === bid.bidderPseudonym;
            const leading = index === 0;
            return (
              <li
                key={bid.sequence}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                  leading ? "bg-lime-100" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    #{bid.sequence} · {bid.bidderPseudonym}
                    {mine && (
                      <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-semibold text-purple-600">
                        Você
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-xs text-muted" title={bid.hash}>
                    {time(bid.createdAt)} · hash {bid.hash.slice(0, 12)}…
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold">{formatBRL(bid.amountCents)}</p>
                  {leading && <p className="text-xs font-semibold text-lime-600">Lance líder</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
