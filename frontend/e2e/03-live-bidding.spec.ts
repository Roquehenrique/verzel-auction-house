import { expect, test } from "@playwright/test";
import { bidPanel, lotIdByTitle, newSession } from "./helpers";

// The core flow of the challenge: two bidders, each in their own browser
// session, disputing the same lot in real time.
test("dois licitantes disputam o mesmo lote ao vivo", async ({ browser }) => {
  const porscheId = await lotIdByTitle(/Porsche 911/);
  const ana = await newSession(browser, "ana");
  const bruno = await newSession(browser, "bruno");

  // Seed: Ana leads the Porsche with R$ 680.000,00.
  await ana.goto(`/lotes/${porscheId}`);
  await expect(bidPanel(ana).getByText("Você está ganhando!")).toBeVisible();

  await test.step("o líder não pode cobrir o próprio lance", async () => {
    await bidPanel(ana).getByRole("button", { name: "Dar lance" }).click();
    await expect(bidPanel(ana).getByText("Você já está ganhando este lote")).toBeVisible();
  });

  await bruno.goto(`/lotes/${porscheId}`);
  await expect(bidPanel(bruno).getByText("Você foi superado!")).toBeVisible();

  await test.step("lance abaixo do mínimo é recusado com o motivo", async () => {
    await bidPanel(bruno).getByLabel("Seu lance (R$)").fill("681.000,00");
    await bidPanel(bruno).getByRole("button", { name: "Dar lance" }).click();
    await expect(bidPanel(bruno)).toContainText("O lance precisa ser de pelo menos R$ 685.000,00");
  });

  await test.step("lance acima do saldo disponível é recusado", async () => {
    // Bruno: R$ 800.000 total - R$ 190.000 committed (Mustang) = R$ 610.000.
    await bidPanel(bruno).getByLabel("Seu lance (R$)").fill("700.000,00");
    await bidPanel(bruno).getByRole("button", { name: "Dar lance" }).click();
    await expect(bidPanel(bruno)).toContainText("Seu saldo disponível é R$ 610.000,00");
  });

  await test.step("depósito pela carteira e lance válido", async () => {
    await bruno.goto("/carteira");
    await bruno.getByRole("button", { name: "R$ 100.000,00" }).click();
    await bruno.getByRole("button", { name: "Depositar" }).click();
    await expect(bruno.getByText("Depósito realizado")).toBeVisible();

    await bruno.goto(`/lotes/${porscheId}`);
    await bidPanel(bruno).getByRole("button", { name: /^Mínimo/ }).click();
    await bidPanel(bruno).getByRole("button", { name: "Dar lance" }).click();
    await expect(bidPanel(bruno).getByText("Lance registrado!")).toBeVisible();
    await expect(bidPanel(bruno).getByText("Você está ganhando!")).toBeVisible();
  });

  await test.step("a tela da Ana muda sozinha para 'superado' (sem recarregar)", async () => {
    await expect(bidPanel(ana).getByText("Você foi superado!")).toBeVisible();
    await expect(bidPanel(ana)).toContainText("Sua posição: 2º de 2");
    await expect(bidPanel(ana)).toContainText("R$ 685.000,00");
    // Stale feedback from her earlier attempt is gone.
    await expect(bidPanel(ana).getByText("Você já está ganhando este lote")).toBeHidden();
    // Private notification and live history.
    await expect(ana.getByText("Você foi superado!").last()).toBeVisible();
    await expect(ana.locator("ol li").first()).toContainText("R$ 685.000,00");
    await expect(ana.locator("ol li").first()).toContainText("Lance líder");
  });

  await ana.context().close();
  await bruno.context().close();
});

test("visitante e leiloeiro veem a sala, mas não dão lances", async ({ browser, page }) => {
  const porscheId = await lotIdByTitle(/Porsche 911/);
  await page.goto(`/lotes/${porscheId}`);
  await expect(page.getByRole("link", { name: "Entrar para dar lances" })).toBeVisible();

  const auctioneer = await newSession(browser, "auctioneer");
  await auctioneer.goto(`/lotes/${porscheId}`);
  await expect(bidPanel(auctioneer).getByText("Modo leiloeiro")).toBeVisible();
  await expect(bidPanel(auctioneer).getByRole("button", { name: "Dar lance" })).toHaveCount(0);
  await auctioneer.context().close();
});
