import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { WalletView } from "./wallet-view";

export const metadata: Metadata = { title: "Carteira" };

export default function WalletPage() {
  return (
    <RequireAuth role="BIDDER">
      <WalletView />
    </RequireAuth>
  );
}
