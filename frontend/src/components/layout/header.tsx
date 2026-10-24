"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useSocket } from "@/components/realtime/socket-provider";
import { formatBRL } from "@/lib/format";
import { useWallet } from "@/lib/queries";
import type { Role } from "@/lib/types";

const links: Array<{ href: string; label: string; roles: Array<Role | "PUBLIC"> }> = [
  { href: "/", label: "Vitrine", roles: ["PUBLIC", "BIDDER", "AUCTIONEER"] },
  { href: "/meus-arremates", label: "Meus arremates", roles: ["BIDDER"] },
  { href: "/carteira", label: "Carteira", roles: ["BIDDER"] },
  { href: "/painel", label: "Painel do leiloeiro", roles: ["AUCTIONEER"] },
];

export function Header() {
  const { status, user, logout } = useAuth();
  const { connected } = useSocket();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wallet = useWallet();

  const role: Role | "PUBLIC" = user?.role ?? "PUBLIC";
  const visible = links.filter((link) => link.roles.includes(role));
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const navLinks = visible.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      onClick={() => setOpen(false)}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive(link.href)
          ? "bg-navy-700 text-white"
          : "text-white/80 hover:bg-navy-800 hover:text-white"
      }`}
    >
      {link.label}
    </Link>
  ));

  return (
    <header className="bg-navy-900 text-white">
      <div className="h-1 w-full bg-teal-500" />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-lime-500 font-heading text-lg font-bold text-navy-900">
            CL
          </span>
          <span className="font-heading text-lg font-bold">
            Casa de <span className="text-lime-500">Leilões</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">{navLinks}</nav>

        <div className="hidden items-center gap-3 md:flex">
          <span
            title={connected ? "Tempo real conectado" : "Tempo real desconectado"}
            className={`size-2 rounded-full ${connected ? "bg-lime-500" : "bg-white/30"}`}
          />
          {status === "authenticated" && user ? (
            <>
              {user.role === "BIDDER" && wallet.data && (
                <Link
                  href="/carteira"
                  className="rounded-md bg-navy-800 px-3 py-1.5 text-xs"
                  title="Saldo disponível para lances"
                >
                  Disponível{" "}
                  <strong className="text-lime-500">
                    {formatBRL(wallet.data.availableCents)}
                  </strong>
                </Link>
              )}
              <span className="text-sm text-white/80">{user.name}</span>
              <button
                onClick={() => {
                  logout();
                  router.push("/");
                }}
                className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-navy-800"
              >
                Sair
              </button>
            </>
          ) : status === "anonymous" ? (
            <>
              <Link href="/login" className="text-sm font-medium hover:text-lime-500">
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className="rounded-md bg-lime-500 px-3 py-1.5 text-sm font-semibold text-navy-900 hover:bg-lime-600"
              >
                Criar conta
              </Link>
            </>
          ) : null}
        </div>

        <button
          className="rounded-md p-2 md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Abrir menu"
        >
          <span className="block h-0.5 w-5 bg-white" />
          <span className="mt-1 block h-0.5 w-5 bg-white" />
          <span className="mt-1 block h-0.5 w-5 bg-white" />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 border-t border-white/10 px-4 py-3 md:hidden">
          {navLinks}
          {status === "authenticated" && user ? (
            <button
              onClick={() => {
                setOpen(false);
                logout();
                router.push("/");
              }}
              className="rounded-md px-3 py-2 text-left text-sm text-white/80 hover:bg-navy-800"
            >
              Sair ({user.name})
            </button>
          ) : (
            <>
              <Link href="/login" onClick={() => setOpen(false)} className="px-3 py-2 text-sm">
                Entrar
              </Link>
              <Link href="/cadastro" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-lime-500">
                Criar conta
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
