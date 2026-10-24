import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/spinner";
import { ReceiptView } from "./receipt-view";

export const metadata: Metadata = { title: "Comprovante de arremate" };

// Public, shareable page (no login, no personal data).
export default function ReceiptPage({ params }: PageProps<"/comprovante/[code]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ReceiptView params={params} />
    </Suspense>
  );
}
