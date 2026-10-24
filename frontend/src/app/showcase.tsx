"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LotCard, LotCardSkeleton } from "@/components/lots/lot-card";
import { useSocketEvent, useSocketRoom } from "@/components/realtime/socket-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { api, errorMessages } from "@/lib/api";
import { syncServerTime } from "@/lib/clock";
import type { Lot, Paginated } from "@/lib/types";

type Tab = "LIVE" | "SCHEDULED" | "ENDED";

const tabs: Array<{ value: Tab; label: string; empty: string }> = [
  { value: "LIVE", label: "Ao vivo", empty: "Nenhum lote ao vivo no momento." },
  { value: "SCHEDULED", label: "Agendados", empty: "Nenhum lote agendado." },
  { value: "ENDED", label: "Encerrados", empty: "Nenhum lote encerrado." },
];

const PAGE_SIZE = 9;

interface Filters {
  status: Tab;
  q: string;
  make: string;
  page: number;
}

function toQuery({ status, q, make, page }: Filters, pageSize = PAGE_SIZE) {
  const params = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
  if (q) params.set("q", q);
  if (make) params.set("make", make);
  return params.toString();
}

async function fetchLots(filters: Filters, pageSize?: number) {
  const result = await api<Paginated<Lot>>(`/lots?${toQuery(filters, pageSize)}`);
  syncServerTime(result.serverTime);
  return result;
}

interface ShowcaseUpdate {
  lotId: string;
  currentBidCents: number;
  nextMinimumBidCents: number;
  bidCount: number;
  endsAt: string;
  serverTime: string;
}

export function Showcase() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // The filters live in the URL: shareable, and the back button works.
  const filters: Filters = {
    status: (tabs.some((t) => t.value === searchParams.get("status"))
      ? searchParams.get("status")
      : "LIVE") as Tab,
    q: searchParams.get("q") ?? "",
    make: searchParams.get("make") ?? "",
    page: Math.max(1, Number(searchParams.get("page")) || 1),
  };

  // Tabs and pagination create history entries (the back button returns to
  // them); typing in the search box and the make filter only replace the URL.
  const setFilters = useCallback(
    (changes: Partial<Filters>, { push = false } = {}) => {
      // Reads the URL at call time, not the one captured at render: the
      // debounced search may fire after another filter changed the URL.
      const params = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(changes)) {
        if (value === "" || value === undefined) params.delete(key);
        else params.set(key, String(value));
      }
      // Any filter change goes back to the first page.
      if (!("page" in changes)) params.delete("page");
      const url = `${pathname}?${params}`;
      if (push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router, pathname],
  );

  // Debounced search: the URL (and the request) changes 300 ms after typing
  // stops. Driven by typing only, so the back button is never overridden.
  const [search, setSearch] = useState(filters.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Back/forward changed ?q=: show it in the box ("adjusting state while
  // rendering" pattern from the React docs, no extra effect/render cycle).
  const [urlQ, setUrlQ] = useState(filters.q);
  if (filters.q !== urlQ) {
    setUrlQ(filters.q);
    if (filters.q !== search.trim()) setSearch(filters.q);
  }
  const onSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilters({ q: value.trim() }), 300);
  };
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const lots = useQuery({
    queryKey: ["lots", filters],
    queryFn: () => fetchLots(filters),
    placeholderData: keepPreviousData,
  });

  // Number of lots per tab, with the same search/make filters.
  const counts = useQuery({
    queryKey: ["lots-count", filters.q, filters.make],
    queryFn: async () => {
      const results = await Promise.all(
        tabs.map((tab) => fetchLots({ ...filters, status: tab.value, page: 1 }, 1)),
      );
      return Object.fromEntries(
        tabs.map((tab, index) => [tab.value, results[index].total]),
      ) as Record<Tab, number>;
    },
  });

  const makes = useQuery({
    queryKey: ["lot-makes"],
    queryFn: () => api<string[]>("/lots/makes"),
    staleTime: 60_000,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["lots"] });
    queryClient.invalidateQueries({ queryKey: ["lots-count"] });
  }, [queryClient]);

  // Real time: live card updates; lots that change tab trigger a reload.
  useSocketRoom({ event: "showcase:join" }, { event: "showcase:leave" }, refresh);
  useSocketEvent<ShowcaseUpdate>("showcase:update", (event) => {
    syncServerTime(event.serverTime);
    queryClient.setQueriesData<Paginated<Lot>>({ queryKey: ["lots"] }, (old) =>
      old && {
        ...old,
        items: old.items.map((lot) =>
          lot.id === event.lotId
            ? {
                ...lot,
                currentBidCents: event.currentBidCents,
                nextMinimumBidCents: event.nextMinimumBidCents,
                bidCount: event.bidCount,
                endsAt: event.endsAt,
                extended: new Date(event.endsAt) > new Date(lot.originalEndsAt),
              }
            : lot,
        ),
      },
    );
  });
  useSocketEvent("lot:cancelled", refresh);
  useSocketEvent("lot:ended", refresh);

  const totalPages = lots.data ? Math.max(1, Math.ceil(lots.data.total / PAGE_SIZE)) : 1;
  const activeTab = tabs.find((tab) => tab.value === filters.status)!;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Situação dos lotes" className="flex w-full gap-1 overflow-x-auto rounded-lg bg-surface-muted p-1 md:w-auto">
          {tabs.map((tab) => {
            const selected = tab.value === filters.status;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={selected}
                onClick={() => setFilters({ status: tab.value }, { push: true })}
                className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-semibold transition-colors md:flex-none md:gap-2 md:px-4 ${
                  selected ? "bg-navy-900 text-white shadow" : "text-muted hover:text-text"
                }`}
              >
                {tab.label}
                {counts.data && (
                  <span
                    className={`rounded-full px-2 text-xs ${
                      selected ? "bg-lime-500 text-navy-900" : "bg-border text-text"
                    }`}
                  >
                    {counts.data[tab.value]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por título, marca ou modelo"
            aria-label="Buscar lotes"
            className={`${inputClass} sm:w-72`}
          />
          <select
            value={filters.make}
            onChange={(event) => setFilters({ make: event.target.value })}
            aria-label="Filtrar por marca"
            className={`${inputClass} sm:w-44`}
          >
            <option value="">Todas as marcas</option>
            {makes.data?.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </div>
      </div>

      {lots.isError ? (
        <Alert tone="error" title="Não foi possível carregar os lotes" messages={errorMessages(lots.error)}>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => lots.refetch()}>
            Tentar novamente
          </Button>
        </Alert>
      ) : lots.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <LotCardSkeleton key={index} />
          ))}
        </div>
      ) : lots.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-muted">
          {filters.q || filters.make ? "Nenhum lote encontrado com esses filtros." : activeTab.empty}
        </div>
      ) : (
        <div
          className={`grid gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${
            lots.isPlaceholderData ? "opacity-60" : ""
          }`}
        >
          {lots.data.items.map((lot) => (
            // When a countdown reaches zero the lot changes tab: reload.
            <LotCard key={lot.id} lot={lot} onTimeReached={refresh} />
          ))}
        </div>
      )}

      {lots.data && totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Paginação">
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page <= 1}
            onClick={() => setFilters({ page: filters.page - 1 }, { push: true })}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted">
            Página {filters.page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page >= totalPages}
            onClick={() => setFilters({ page: filters.page + 1 }, { push: true })}
          >
            Próxima
          </Button>
        </nav>
      )}
    </section>
  );
}
