import { expect, test } from "@playwright/test";
import { bidPanel, login } from "./helpers";

test.describe("Painel do leiloeiro", () => {
  test("mostra o total recebido e o resultado dos lotes", async ({ page }) => {
    await login(page, "auctioneer");
    await expect(page.getByText("Total recebido").locator("..")).toContainText("R$ 32.000,00");
    const uno = page.locator("main div.rounded-xl", { hasText: "Fiat Uno" }).first();
    await expect(uno).toContainText("Arrematado por R$ 32.000,00");
  });

  // The vehicle catalog is served from the cache pre-filled by e2e:prepare
  // (Toyota / 2020 / Supra), so this test does not depend on NHTSA/Wikipedia.
  test("cria um lote a partir do catálogo", async ({ page }) => {
    await login(page, "auctioneer");
    await page.getByRole("link", { name: "+ Criar lote" }).click();

    await page.getByRole("button", { name: "Publicar lote" }).click();
    await expect(page.getByText("Escolha a marca, o ano e o modelo")).toBeVisible();

    await page.getByLabel("Marca").selectOption({ label: "Toyota" });
    await page.getByLabel("Ano").selectOption("2020");
    await page.getByLabel("Modelo").selectOption({ label: "Supra" });
    await page.getByRole("button", { name: "Toyota GR Supra" }).click();
    await page.getByLabel("Quilometragem (km)").fill("21.000");
    await page.getByLabel("Combustível").selectOption("Gasolina");
    await page.getByLabel("Lance inicial (R$)").fill("350.000,00");
    await page.getByLabel("Incremento mínimo (R$)").fill("3.500,00");
    await page.getByRole("button", { name: "Publicar lote" }).click();

    await expect(page).toHaveURL(/\/lotes\/[0-9a-f-]{36}$/);
    const panel = bidPanel(page);
    await expect(panel).toContainText("Toyota Supra 2020");
    await expect(panel).toContainText("Ao vivo");
    await expect(panel).toContainText("R$ 350.000,00");
  });

  test("cancela um lote sem lances e ele some da vitrine em tempo real", async ({ browser, page }) => {
    // A visitor watching the scheduled tab.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto("/?status=SCHEDULED");
    await expect(visitor.getByRole("heading", { name: "Toyota GR Supra 2020" })).toBeVisible();

    await login(page, "auctioneer");
    const row = page.locator("main div.rounded-xl", { hasText: "Toyota GR Supra 2020" }).first();
    await row.getByRole("button", { name: "Cancelar lote" }).click();
    await row.getByRole("button", { name: "Sim" }).click();
    await expect(page.getByText("Lote cancelado").first()).toBeVisible();

    await expect(visitor.getByRole("heading", { name: "Toyota GR Supra 2020" })).toBeHidden();
    await visitor.context().close();
  });

  test("lotes com lances não podem ser cancelados", async ({ page }) => {
    await login(page, "auctioneer");
    const porsche = page.locator("main div.rounded-xl", { hasText: "Porsche 911" }).first();
    await expect(porsche).toBeVisible();
    await expect(porsche.getByRole("button", { name: "Cancelar lote" })).toHaveCount(0);
  });
});
