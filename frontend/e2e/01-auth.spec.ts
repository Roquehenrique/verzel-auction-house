import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Autenticação", () => {
  test("cadastro de um novo licitante entra direto na vitrine", async ({ page }) => {
    const email = `novo-${Date.now()}@teste.dev`;
    await page.goto("/cadastro");
    await page.getByLabel("Nome").fill("Carla Teste");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("Senha@123");
    await page.getByLabel("Confirmar senha").fill("Senha@123");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.locator("header")).toContainText("Carla Teste");
    await expect(page.locator("header")).toContainText("Disponível R$ 0,00");
  });

  test("cadastro valida os campos e senhas diferentes", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByLabel("Senha", { exact: true }).fill("123");
    await page.getByLabel("Confirmar senha").fill("456");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByText("O nome deve ter pelo menos 2 caracteres")).toBeVisible();
    await expect(page.getByText("A senha deve ter pelo menos 8 caracteres")).toBeVisible();
    await expect(page.getByText("As senhas não conferem")).toBeVisible();
  });

  test("login com senha errada mostra a mensagem da API", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("ana@leilao.dev");
    await page.getByLabel("Senha").fill("errada123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("E-mail ou senha inválidos")).toBeVisible();
  });

  test("página privada leva ao login e volta para ela depois", async ({ page }) => {
    await page.goto("/carteira");
    await expect(page).toHaveURL(/\/login\?next=%2Fcarteira/);
    await page.getByRole("button", { name: "Licitante Ana" }).click();
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL("/carteira");
    await expect(page.getByRole("heading", { name: "Carteira" })).toBeVisible();
  });

  test("leiloeiro vai para o painel e não acessa páginas de licitante", async ({ page }) => {
    await login(page, "auctioneer");
    await expect(page).toHaveURL("/painel");
    await page.goto("/carteira");
    await expect(page.getByText("Acesso restrito")).toBeVisible();
  });

  test("sair encerra a sessão", async ({ page }) => {
    await login(page, "bruno");
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page.locator("header").getByRole("link", { name: "Entrar" })).toBeVisible();
  });
});
