import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/spinner";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    // LoginForm reads ?next= with useSearchParams, which requires Suspense.
    <Suspense fallback={<PageLoading />}>
      <LoginForm />
    </Suspense>
  );
}
