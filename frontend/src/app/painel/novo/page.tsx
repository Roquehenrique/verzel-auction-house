import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { NewLotForm } from "./new-lot-form";

export const metadata: Metadata = { title: "Criar lote" };

export default function NewLotPage() {
  return (
    <RequireAuth role="AUCTIONEER">
      <NewLotForm />
    </RequireAuth>
  );
}
