import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/spinner";
import { LotRoom } from "./lot-room";

export const metadata: Metadata = { title: "Sala do lote" };

// With Cache Components the id is runtime data: the params promise is passed
// down and unwrapped inside Suspense (static shell + streamed content).
export default function LotPage({ params }: PageProps<"/lotes/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LotRoom params={params} />
    </Suspense>
  );
}
