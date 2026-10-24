import { expect, test } from "@playwright/test";
import { lotIdByTitle, newSession } from "./helpers";

// Tampering scenarios (changing the database directly) are covered by the
// backend e2e tests (backend/test/audit.e2e-spec.ts); here the public pages
// and the in-browser verification are checked.

test("auditoria pública confere o histórico no servidor e no navegador", async ({ page }) => {
  const porscheId = await lotIdByTitle(/Porsche 911/);
  await page.goto(`/lotes/${porscheId}/auditoria`); // no login

  const server = page.getByRole("status").filter({ hasText: "Verificação do servidor" });
  const browserCheck = page.getByRole("status").filter({ hasText: "Verificação independente no seu navegador" });
  await expect(server).toContainText("✓ Histórico íntegro");
  await expect(browserCheck).toContainText("✓ Histórico íntegro");

  const rows = page.locator("ol li");
  await expect(rows.first()).toContainText("#1");
  for (const label of ["Encadeado", "Hash", "Assinatura"]) {
    await expect(rows.first()).toContainText(`✓ ${label}`);
  }
  // No personal data on a public page.
  await expect(page.locator("main")).not.toContainText("Ana Licitante");
  await expect(page.locator("main")).not.toContainText("@leilao.dev");
});

test("comprovante abre por link para qualquer pessoa, com assinatura válida", async ({ browser }) => {
  const ana = await newSession(browser, "ana");
  await ana.goto("/meus-arremates");
  await ana.getByRole("link", { name: "Ver comprovante" }).click();
  await expect(ana).toHaveURL(/\/comprovante\/[\w-]+$/);
  const receiptUrl = ana.url();
  await ana.context().close();

  // Someone else, without login, opens the shared link.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(receiptUrl);
  await expect(visitor.getByRole("heading", { name: "Fiat Uno Attractive 2011" })).toBeVisible();
  await expect(visitor.getByText("R$ 32.000,00")).toBeVisible();
  await expect(visitor.getByText("✓ Assinatura válida")).toBeVisible();
  await expect(visitor.getByText("conferida pelo servidor e no seu navegador")).toBeVisible();
  await expect(visitor.locator("main")).toContainText(/Licitante #[0-9A-F]{6}/);
  await expect(visitor.locator("main")).not.toContainText("Ana");
  await visitor.context().close();
});
