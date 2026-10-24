"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { PageLoading } from "@/components/ui/spinner";
import type { Role } from "@/lib/types";
import { useAuth } from "./auth-provider";

const roleLabel: Record<Role, string> = {
  AUCTIONEER: "leiloeiros",
  BIDDER: "licitantes",
};

// Client-side guard for private pages. The API enforces the same rules; this
// only gives the user a proper redirect/message instead of empty errors.
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status !== "authenticated" || !user) return <PageLoading />;

  if (role && user.role !== role) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Alert tone="warning" title="Acesso restrito">
          <p>Esta página é apenas para {roleLabel[role]}.</p>
          <Link href="/" className="mt-2 inline-block font-semibold underline">
            Voltar para a vitrine
          </Link>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
