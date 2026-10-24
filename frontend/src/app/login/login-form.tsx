"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { homeFor, useAuth } from "@/components/auth/auth-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { errorMessages } from "@/lib/api";

const schema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
});
type FormValues = z.infer<typeof schema>;

// Seeded accounts (see README), to explore the app without signing up.
const demoAccounts = [
  { label: "Leiloeiro", email: "leiloeiro@leilao.dev" },
  { label: "Licitante Ana", email: "ana@leilao.dev" },
  { label: "Licitante Bruno", email: "bruno@leilao.dev" },
];
const DEMO_PASSWORD = "Senha@123";

// Only same-site paths are accepted, so ?next= cannot send users elsewhere
// ("//evil.com" and "/\evil.com" are treated by browsers as other domains).
function safeNext(next: string | null): string | null {
  return next && /^\/(?![/\\])/.test(next) ? next : null;
}

export function LoginForm() {
  const { login, status, user } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  // Already logged in (or just logged in): go to the requested page or home.
  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(next ?? homeFor(user.role));
    }
  }, [status, user, next, router]);
  const [error, setError] = useState<string[] | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await login(values.email, values.password); // the effect redirects
    } catch (err) {
      setError(errorMessages(err));
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-3xl font-bold">Entrar</h1>
      <p className="mb-6 text-muted">
        Acesse sua conta para dar lances ou gerenciar seus lotes.
      </p>

      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {error && <Alert tone="error" messages={error} />}

          <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
          </Field>

          <Field label="Senha" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>

          <Button type="submit" loading={isSubmitting} className="mt-2">
            Entrar
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          Não tem conta?{" "}
          <Link href="/cadastro" className="font-semibold text-purple-600 hover:underline">
            Cadastre-se
          </Link>
        </p>
      </Card>

      <Card tone="muted" className="mt-6 p-4">
        <p className="text-sm font-semibold">Contas de demonstração</p>
        <p className="mb-3 text-xs text-muted">
          Senha de todas: <code>{DEMO_PASSWORD}</code>
        </p>
        <div className="flex flex-wrap gap-2">
          {demoAccounts.map((account) => (
            <Button
              key={account.email}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setValue("email", account.email);
                setValue("password", DEMO_PASSWORD);
              }}
            >
              {account.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
