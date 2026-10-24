"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { homeFor, useAuth } from "@/components/auth/auth-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { errorMessages } from "@/lib/api";

// Same rules as the API (backend/src/auth/dto/register.dto.ts).
const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "O nome deve ter pelo menos 2 caracteres")
      .max(100, "O nome deve ter no máximo 100 caracteres"),
    email: z.email("Informe um e-mail válido"),
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres")
      .max(128, "A senha deve ter no máximo 128 caracteres"),
    confirmPassword: z.string(),
    role: z.enum(["BIDDER", "AUCTIONEER"]),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem",
  });
type FormValues = z.infer<typeof schema>;

const roles = [
  {
    value: "BIDDER" as const,
    title: "Licitante",
    description: "Deposita saldo, dá lances e arremata carros.",
  },
  {
    value: "AUCTIONEER" as const,
    title: "Leiloeiro",
    description: "Cria e gerencia os próprios lotes. Não dá lances.",
  },
];

export function RegisterForm() {
  const { register: signUp, status, user } = useAuth();
  const router = useRouter();

  // Already logged in (or just signed up): go to the role's home page.
  useEffect(() => {
    if (status === "authenticated" && user) router.replace(homeFor(user.role));
  }, [status, user, router]);
  const [error, setError] = useState<string[] | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: "BIDDER" },
  });
  const selectedRole = useWatch({ control, name: "role" });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      // confirmPassword is only checked here, the API does not receive it.
      await signUp({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
      }); // the effect redirects
    } catch (err) {
      setError(errorMessages(err));
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-3xl font-bold">Criar conta</h1>
      <p className="mb-6 text-muted">Escolha como você quer participar dos leilões.</p>

      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {error && <Alert tone="error" messages={error} />}

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Perfil</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {roles.map((role) => (
                <label
                  key={role.value}
                  className={`cursor-pointer rounded-lg border-2 p-3 transition-colors ${
                    selectedRole === role.value
                      ? "border-lime-500 bg-lime-100"
                      : "border-border hover:border-teal-500"
                  }`}
                >
                  <input
                    type="radio"
                    value={role.value}
                    className="sr-only"
                    {...register("role")}
                  />
                  <span className="block font-heading font-semibold">{role.title}</span>
                  <span className="text-xs text-muted">{role.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Nome" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
          </Field>

          <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
          </Field>

          <Field
            label="Senha"
            htmlFor="password"
            error={errors.password?.message}
            hint="Mínimo de 8 caracteres"
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>

          <Field
            label="Confirmar senha"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
          </Field>

          <Button type="submit" loading={isSubmitting} className="mt-2">
            Criar conta
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          Já tem conta?{" "}
          <Link href="/login" className="font-semibold text-purple-600 hover:underline">
            Entrar
          </Link>
        </p>
      </Card>
    </div>
  );
}
