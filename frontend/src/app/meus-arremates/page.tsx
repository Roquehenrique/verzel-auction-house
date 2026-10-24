import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { MyBidsView } from "./my-bids-view";

export const metadata: Metadata = { title: "Meus arremates" };

export default function MyBidsPage() {
  return (
    <RequireAuth role="BIDDER">
      <MyBidsView />
    </RequireAuth>
  );
}
