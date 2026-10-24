import { Card } from "@/components/ui/card";

// The showcase (lots grouped by status) is implemented in the next step.
export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-navy-900 px-6 py-10 text-white sm:px-10">
        <div className="mb-4 h-1 w-14 rounded-full bg-teal-500" />
        <h1 className="text-3xl font-bold sm:text-4xl">
          Leilões de carros <span className="text-lime-500">ao vivo</span>
        </h1>
        <p className="mt-3 max-w-xl text-white/80">
          Dê lances em tempo real e acompanhe cada disputa com um histórico
          auditável e à prova de adulteração.
        </p>
      </section>
      <Card className="p-6 text-muted">Vitrine de lotes em construção.</Card>
    </div>
  );
}
