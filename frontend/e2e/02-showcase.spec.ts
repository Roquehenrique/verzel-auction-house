import { expect, test } from "@playwright/test";
import { createBidder, lotIdByTitle } from "./helpers";

test.describe("Vitrine", () => {
  test("separa lotes ao vivo, agendados e encerrados", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tablist");
    await expect(tabs.getByRole("tab", { name: /Ao vivo/ })).toContainText("3");
    await expect(tabs.getByRole("tab", { name: /Agendados/ })).toContainText("1");
    await expect(tabs.getByRole("tab", { name: /Encerrados/ })).toContainText("2");

    await expect(page.getByRole("heading", { name: /Porsche 911/ })).toBeVisible();
    await tabs.getByRole("tab", { name: /Agendados/ }).click();
    await expect(page).toHaveURL(/status=SCHEDULED/);
    await expect(page.getByRole("heading", { name: /Toyota GR Supra/ })).toBeVisible();
    await tabs.getByRole("tab", { name: /Encerrados/ }).click();
    await expect(page.getByRole("heading", { name: /Fiat Uno/ })).toBeVisible();
  });

  test("busca por texto e filtra por marca", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Buscar lotes").fill("mustang");
    await expect(page).toHaveURL(/q=mustang/);
    await expect(page.locator("main h3")).toHaveText(["Ford Mustang Hardtop 1965"]);

    await page.getByLabel("Buscar lotes").fill("");
    await page.getByLabel("Filtrar por marca").selectOption("Porsche");
    await expect(page.locator("main h3")).toHaveText(["Porsche 911 Carrera Cabriolet 2025"]);

    await page.getByLabel("Buscar lotes").fill("ferrari");
    await expect(page.getByText("Nenhum lote encontrado com esses filtros.")).toBeVisible();
  });

  test("atualiza o card em tempo real quando chega um lance", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("a", { hasText: "Chevrolet Opala" });
    await expect(card).toContainText("0 lances");

    // Another bidder bids through the API while the page stays open.
    const outsider = await createBidder();
    expect(await outsider.bidMinimum(await lotIdByTitle(/Opala/))).toBe(201);

    await expect(card).toContainText("1 lance");
    await expect(card).toContainText("Lance atual");
  });
});
