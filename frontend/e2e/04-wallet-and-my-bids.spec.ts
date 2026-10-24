import { expect, test } from "@playwright/test";
import { bidPanel, createBidder, lotIdByTitle, newSession } from "./helpers";

test("o saldo comprometido volta ao disponível quando o licitante é superado", async ({ browser }) => {
  const mustangId = await lotIdByTitle(/Mustang/);
  const ana = await newSession(browser, "ana");

  // Ana takes the lead on the Mustang (commits the amount).
  await ana.goto(`/lotes/${mustangId}`);
  await bidPanel(ana).getByRole("button", { name: /^Mínimo/ }).click();
  await bidPanel(ana).getByRole("button", { name: "Dar lance" }).click();
  await expect(bidPanel(ana).getByText("Você está ganhando!")).toBeVisible();

  await ana.goto("/carteira");
  const commitments = ana.locator("ul").first();
  await expect(commitments).toContainText("Ford Mustang Hardtop 1965");
  await expect(ana.getByText("Comprometido", { exact: true }).locator("..")).not.toContainText("R$ 0,00");

  // Another bidder outbids her while she looks at her wallet.
  const outsider = await createBidder();
  expect(await outsider.bidMinimum(mustangId)).toBe(201);

  // Ana's wallet updates without reloading.
  await expect(ana.getByText("Nenhum valor comprometido no momento.")).toBeVisible();
  await expect(ana.getByText("Comprometido", { exact: true }).locator("..")).toContainText("R$ 0,00");
  await expect(ana.getByText("Você foi superado!")).toBeVisible();

  await ana.context().close();
});

test("meus arremates separa disputas, arremates e mostra o comprovante", async ({ browser }) => {
  const ana = await newSession(browser, "ana");
  await ana.goto("/meus-arremates");

  const inProgress = ana.locator("section", { has: ana.getByRole("heading", { name: /Em andamento/ }) });
  const won = ana.locator("section", { has: ana.getByRole("heading", { name: /Arrematados/ }) });

  await expect(inProgress).toContainText("Porsche 911 Carrera Cabriolet 2025");
  await expect(inProgress).toContainText("Superado");
  await expect(won).toContainText("Fiat Uno Attractive 2011");
  await expect(won.getByRole("link", { name: "Ver comprovante" })).toBeVisible();
  await ana.context().close();
});
