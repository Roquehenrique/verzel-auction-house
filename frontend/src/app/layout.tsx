import type { Metadata } from "next";
import { Inter, Rubik } from "next/font/google";
import { Header } from "@/components/layout/header";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Casa de Leilões", template: "%s | Casa de Leilões" },
  description:
    "Leilões de carros ao vivo, com histórico de lances auditável e à prova de adulteração.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${rubik.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
          <footer className="border-t border-border py-6 text-center text-xs text-muted">
            Casa de Leilões — projeto de avaliação técnica. Dados de veículos:
            NHTSA vPIC e Wikipedia.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
