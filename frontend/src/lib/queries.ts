"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { api } from "./api";
import type { Wallet } from "./types";

// Shared query: the header, the wallet page and the bid form read the same
// cache, refreshed by the "wallet:updated" socket event.
export function useWallet() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wallet"],
    queryFn: () => api<Wallet>("/wallet"),
    enabled: user !== null,
  });
}
