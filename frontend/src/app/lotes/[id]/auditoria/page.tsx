import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/spinner";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: "Auditoria do lote" };

// Public page (no login): anyone can check that a lot's history was not altered.
export default function AuditPage({ params }: PageProps<"/lotes/[id]/auditoria">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <AuditView params={params} />
    </Suspense>
  );
}
