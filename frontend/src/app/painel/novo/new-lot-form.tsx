"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, inputClass } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, errorMessages } from "@/lib/api";
import { formatBRL, parseReaisToCents } from "@/lib/format";
import type { Cached, Lot, VehicleImage, VehicleMake, VehicleModel } from "@/lib/types";

// Same rules as the API (backend/src/lots).
const MIN_YEAR = 1981; // NHTSA has no data before the VIN era
const MAX_AMOUNT_CENTS = 2_000_000_000;
const MIN_AMOUNT_CENTS = 100;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const FUELS = ["Gasolina", "Etanol", "Flex", "Diesel", "Elétrico", "Híbrido"];
const TRANSMISSIONS = ["Manual", "Automático", "Automatizado", "CVT"];

// Wikimedia thumbnails accept other widths in the URL: the picker loads a
// light 330px preview, the lot keeps the 960px picture.
function previewUrl(url: string): string {
  return url.replace(/\/960px-/, "/330px-");
}

// <input type="datetime-local"> works with local time without seconds.
function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * MINUTE);
  return local.toISOString().slice(0, 16);
}

const money = (label: string) =>
  z.string().refine(
    (value) => {
      const cents = parseReaisToCents(value);
      return cents !== null && cents >= MIN_AMOUNT_CENTS && cents <= MAX_AMOUNT_CENTS;
    },
    { message: `${label} deve ser entre R$ 1,00 e R$ 20.000.000,00` },
  );

const schema = z
  .object({
    title: z.string().trim().max(120, "Máximo de 120 caracteres"),
    description: z.string().trim().max(2000, "Máximo de 2000 caracteres"),
    mileageKm: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d+$/.test(v.replace(/\./g, "")) && Number(v.replace(/\./g, "")) <= 2_000_000), {
        message: "Quilometragem inválida",
      }),
    color: z.string().trim().max(30),
    fuel: z.string(),
    transmission: z.string(),
    condition: z.string().trim().max(60),
    startingBid: money("O lance inicial"),
    minIncrement: money("O incremento mínimo"),
    startMode: z.enum(["now", "scheduled"]),
    startsAt: z.string(),
    endsAt: z.string().min(1, "Informe a data de fim"),
  })
  .superRefine((values, ctx) => {
    if (values.title && values.title.length < 3) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Mínimo de 3 caracteres" });
    }
    const now = Date.now();
    let start = now;
    if (values.startMode === "scheduled") {
      start = new Date(values.startsAt).getTime();
      if (!values.startsAt || Number.isNaN(start)) {
        ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Informe a data de início" });
        return;
      }
      if (start < now - MINUTE) {
        ctx.addIssue({ code: "custom", path: ["startsAt"], message: "A data de início não pode estar no passado" });
      }
      if (start > now + 90 * DAY) {
        ctx.addIssue({ code: "custom", path: ["startsAt"], message: "A data de início deve ser em no máximo 90 dias" });
      }
    }
    const end = new Date(values.endsAt).getTime();
    if (Number.isNaN(end)) return;
    const duration = end - Math.max(start, now);
    if (duration < 5 * MINUTE) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O lote deve durar pelo menos 5 minutos" });
    } else if (duration > 30 * DAY) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O lote deve durar no máximo 30 dias" });
    }
  });
type FormValues = z.infer<typeof schema>;

export function NewLotForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  // Vehicle chosen in the catalog (dependent selects: make + year -> model -> photo).
  const [makeId, setMakeId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  // undefined = not chosen yet, null = "no photo"
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined);
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  const [years] = useState(() => {
    const max = new Date().getFullYear() + 1;
    return Array.from({ length: max - MIN_YEAR + 1 }, (_, index) => max - index);
  });
  const [defaults] = useState<FormValues>(() => ({
    title: "",
    description: "",
    mileageKm: "",
    color: "",
    fuel: "",
    transmission: "",
    condition: "",
    startingBid: "",
    minIncrement: "",
    startMode: "now",
    startsAt: toLocalInput(new Date(Date.now() + 60 * MINUTE)),
    endsAt: toLocalInput(new Date(Date.now() + DAY)),
  }));

  const makes = useQuery({
    queryKey: ["vehicles", "makes"],
    queryFn: () => api<Cached<VehicleMake[]>>("/vehicles/makes"),
    staleTime: 10 * MINUTE,
  });
  const models = useQuery({
    queryKey: ["vehicles", "models", makeId, year],
    queryFn: () => api<Cached<VehicleModel[]>>(`/vehicles/models?makeId=${makeId}&year=${year}`),
    enabled: makeId !== null && year !== null,
    staleTime: 10 * MINUTE,
  });
  const make = makes.data?.data.find((item) => item.id === makeId);
  const model = models.data?.data.find((item) => item.id === modelId);
  const images = useQuery({
    queryKey: ["vehicles", "images", make?.name, model?.name, year],
    queryFn: () =>
      api<Cached<VehicleImage[]>>(
        `/vehicles/images?${new URLSearchParams({ make: make!.name, model: model!.name, year: String(year) })}`,
      ),
    enabled: !!make && !!model && year !== null,
    staleTime: 10 * MINUTE,
  });
  const stale = [makes.data, models.data, images.data].some((result) => result?.stale);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const startMode = useWatch({ control, name: "startMode" });
  const startingBid = useWatch({ control, name: "startingBid" });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Lot>("/lots", { method: "POST", body }),
    onSuccess: (lot) => {
      queryClient.invalidateQueries({ queryKey: ["my-lots"] });
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      queryClient.invalidateQueries({ queryKey: ["lot-makes"] });
      toast.show({ tone: "success", title: "Lote criado", description: lot.title });
      router.push(`/lotes/${lot.id}`);
    },
  });

  // The vehicle is outside react-hook-form, so it is checked on every submit
  // attempt (also when other fields are invalid) to show all problems at once.
  const checkVehicle = (): boolean => {
    if (makeId === null || year === null || modelId === null) {
      setVehicleError("Escolha a marca, o ano e o modelo do veículo no catálogo.");
      return false;
    }
    if (imageUrl === undefined) {
      setVehicleError("Escolha uma foto ou a opção \"Sem foto\".");
      return false;
    }
    setVehicleError(null);
    return true;
  };

  const onSubmit = (values: FormValues) => {
    if (!checkVehicle()) return;
    const attributes = Object.fromEntries(
      Object.entries({
        mileageKm: values.mileageKm ? Number(values.mileageKm.replace(/\./g, "")) : undefined,
        color: values.color || undefined,
        fuel: values.fuel || undefined,
        transmission: values.transmission || undefined,
        condition: values.condition || undefined,
      }).filter(([, value]) => value !== undefined),
    );
    create.mutate({
      makeId,
      modelId,
      year,
      ...(imageUrl && { imageUrl }),
      ...(values.title && { title: values.title }),
      ...(values.description && { description: values.description }),
      attributes,
      startingBidCents: parseReaisToCents(values.startingBid),
      minIncrementCents: parseReaisToCents(values.minIncrement),
      startsAt: values.startMode === "now" ? new Date().toISOString() : new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
    });
  };

  const startingCents = parseReaisToCents(startingBid ?? "");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/painel" className="text-sm text-muted hover:text-text">
          ← Painel
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Criar lote</h1>
        <p className="text-muted">
          Escolha o carro no catálogo público (NHTSA), a foto (Wikipedia) e as regras do leilão.
        </p>
      </div>

      {stale && (
        <Alert
          tone="warning"
          title="Catálogo em modo de contingência"
          messages={["A API externa está indisponível; os dados exibidos vêm do cache e podem estar desatualizados."]}
        />
      )}

      <form onSubmit={handleSubmit(onSubmit, checkVehicle)} className="flex flex-col gap-6" noValidate>
        <Section number={1} title="Veículo">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Marca" htmlFor="make">
              <select
                id="make"
                className={inputClass}
                value={makeId ?? ""}
                disabled={makes.isPending}
                onChange={(event) => {
                  setMakeId(event.target.value ? Number(event.target.value) : null);
                  setModelId(null);
                  setImageUrl(undefined);
                }}
              >
                <option value="">{makes.isPending ? "Carregando..." : "Selecione"}</option>
                {makes.data?.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ano" htmlFor="year">
              <select
                id="year"
                className={inputClass}
                value={year ?? ""}
                onChange={(event) => {
                  setYear(event.target.value ? Number(event.target.value) : null);
                  setModelId(null);
                  setImageUrl(undefined);
                }}
              >
                <option value="">Selecione</option>
                {years.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modelo" htmlFor="model">
              <select
                id="model"
                className={inputClass}
                value={modelId ?? ""}
                disabled={!models.data || models.data.data.length === 0}
                onChange={(event) => {
                  setModelId(event.target.value ? Number(event.target.value) : null);
                  setImageUrl(undefined);
                }}
              >
                <option value="">
                  {makeId === null || year === null ? "Escolha marca e ano" : models.isFetching ? "Carregando..." : "Selecione"}
                </option>
                {models.data?.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {makes.isError && <Alert tone="error" messages={errorMessages(makes.error)} />}
          {models.isError && <Alert tone="error" messages={errorMessages(models.error)} />}
          {models.data && models.data.data.length === 0 && (
            <Alert
              tone="info"
              messages={["Nenhum modelo de carro encontrado para essa marca e ano. A NHTSA cobre principalmente o mercado americano."]}
            />
          )}
        </Section>

        <Section number={2} title="Foto">
          {!model ? (
            <p className="text-sm text-muted">Escolha o modelo para ver as fotos sugeridas.</p>
          ) : images.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="size-4" /> Buscando fotos na Wikipedia...
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {images.isError && <Alert tone="warning" messages={errorMessages(images.error)} />}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.data?.data.map((image) => (
                  <ImageOption
                    key={image.url}
                    selected={imageUrl === image.url}
                    onSelect={() => setImageUrl(image.url)}
                    label={image.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl(image.url)}
                      alt={image.title}
                      className="aspect-[16/10] w-full bg-surface-muted object-cover"
                    />
                  </ImageOption>
                ))}
                <ImageOption selected={imageUrl === null} onSelect={() => setImageUrl(null)} label="Sem foto">
                  <div className="flex aspect-[16/10] w-full items-center justify-center bg-surface-muted text-sm text-muted">
                    Sem foto
                  </div>
                </ImageOption>
              </div>
              <p className="text-xs text-muted">
                Fotos do Wikimedia Commons. A imagem principal do artigo nem sempre é do ano exato; escolha a que melhor representa o carro.
              </p>
            </div>
          )}
        </Section>

        <Section number={3} title="Detalhes">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Título (opcional)"
              htmlFor="title"
              error={errors.title?.message}
              hint={make && model && year ? `Padrão: ${make.name} ${model.name} ${year}` : undefined}
            >
              <Input id="title" aria-invalid={!!errors.title} {...register("title")} />
            </Field>
            <Field label="Quilometragem (km)" htmlFor="mileageKm" error={errors.mileageKm?.message}>
              <Input id="mileageKm" inputMode="numeric" aria-invalid={!!errors.mileageKm} {...register("mileageKm")} />
            </Field>
            <Field label="Cor" htmlFor="color" error={errors.color?.message}>
              <Input id="color" {...register("color")} />
            </Field>
            <Field label="Combustível" htmlFor="fuel">
              <select id="fuel" className={inputClass} {...register("fuel")}>
                <option value="">Não informado</option>
                {FUELS.map((fuel) => (
                  <option key={fuel}>{fuel}</option>
                ))}
              </select>
            </Field>
            <Field label="Câmbio" htmlFor="transmission">
              <select id="transmission" className={inputClass} {...register("transmission")}>
                <option value="">Não informado</option>
                {TRANSMISSIONS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Condição" htmlFor="condition" error={errors.condition?.message}>
              <Input id="condition" placeholder="Ex.: único dono, revisado" {...register("condition")} />
            </Field>
          </div>
          <Field label="Descrição (opcional)" htmlFor="description" error={errors.description?.message}>
            <textarea id="description" rows={3} className={`${inputClass} h-auto py-2`} {...register("description")} />
          </Field>
        </Section>

        <Section number={4} title="Regras do leilão">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lance inicial (R$)" htmlFor="startingBid" error={errors.startingBid?.message}>
              <Input id="startingBid" inputMode="decimal" placeholder="Ex.: 150.000,00" aria-invalid={!!errors.startingBid} {...register("startingBid")} />
            </Field>
            <Field
              label="Incremento mínimo (R$)"
              htmlFor="minIncrement"
              error={errors.minIncrement?.message}
              hint={startingCents ? `Sugestão: 1% do lance inicial (${formatBRL(Math.max(100, Math.round(startingCents / 100)))})` : undefined}
            >
              <Input id="minIncrement" inputMode="decimal" placeholder="Ex.: 1.000,00" aria-invalid={!!errors.minIncrement} {...register("minIncrement")} />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Início</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="now" {...register("startMode")} /> Começar agora
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="scheduled" {...register("startMode")} /> Agendar
            </label>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            {startMode === "scheduled" && (
              <Field label="Data e hora de início" htmlFor="startsAt" error={errors.startsAt?.message}>
                <Input id="startsAt" type="datetime-local" aria-invalid={!!errors.startsAt} {...register("startsAt")} />
              </Field>
            )}
            <Field
              label="Data e hora de fim"
              htmlFor="endsAt"
              error={errors.endsAt?.message}
              hint="Duração de 5 minutos a 30 dias. Lances nos últimos 2 minutos prorrogam o fim."
            >
              <Input id="endsAt" type="datetime-local" aria-invalid={!!errors.endsAt} {...register("endsAt")} />
            </Field>
          </div>
        </Section>

        {vehicleError && <Alert tone="error" messages={[vehicleError]} />}
        {create.isError && <Alert tone="error" title="Não foi possível criar o lote" messages={errorMessages(create.error)} />}

        <div className="flex justify-end gap-3">
          <Link href="/painel" className="rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-surface-muted">
            Cancelar
          </Link>
          <Button type="submit" variant="accent" size="lg" loading={create.isPending}>
            Publicar lote
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="flex items-center gap-3 text-lg font-semibold">
        <span className="grid size-7 place-items-center rounded-full bg-purple-600 text-sm text-white">{number}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function ImageOption({
  selected,
  onSelect,
  label,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={label}
      className={`overflow-hidden rounded-lg border-2 text-left transition ${
        selected ? "border-lime-500 ring-2 ring-lime-500/40" : "border-border hover:border-teal-500"
      }`}
    >
      {children}
      <span className="block truncate px-2 py-1 text-xs text-muted">{label}</span>
    </button>
  );
}
