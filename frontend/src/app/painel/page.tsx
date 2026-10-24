import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { PanelView } from "./panel-view";

export const metadata: Metadata = { title: "Painel do leiloeiro" };

export default function PanelPage() {
  return (
    <RequireAuth role="AUCTIONEER">
      <PanelView />
    </RequireAuth>
  );
}
