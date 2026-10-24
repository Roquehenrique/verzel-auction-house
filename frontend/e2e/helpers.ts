import { expect, type Browser, type Page } from "@playwright/test";

export const API_URL = "http://localhost:3101/api";

// Demo accounts created by the seed (password Senha@123).
export const ACCOUNTS = {
  auctioneer: { button: "Leiloeiro", name: "Leiloeiro Demo", email: "leiloeiro@leilao.dev" },
  ana: { button: "Licitante Ana", name: "Ana Licitante", email: "ana@leilao.dev" },
  bruno: { button: "Licitante Bruno", name: "Bruno Licitante", email: "bruno@leilao.dev" },
} as const;
export type Account = keyof typeof ACCOUNTS;

export async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByRole("button", { name: ACCOUNTS[account].button }).click();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("header")).toContainText(ACCOUNTS[account].name);
}

// A separate browser context = a separate user session (like another person).
export async function newSession(browser: Browser, account: Account) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  return page;
}

// Lot ids from the public API (seeded data).
export async function lotIdByTitle(title: RegExp, status = "LIVE"): Promise<string> {
  const response = await fetch(`${API_URL}/lots?status=${status}&pageSize=50`);
  const body = (await response.json()) as { items: Array<{ id: string; title: string }> };
  const lot = body.items.find((item) => title.test(item.title));
  if (!lot) throw new Error(`Lot ${title} not found (status ${status})`);
  return lot.id;
}

// A brand-new bidder with its own balance, used for bids made "from outside"
// through the API. Using it instead of the seeded accounts keeps the test
// files independent (no balance/leadership leaking from one file to another).
export async function createBidder(depositCents = 100_000_000) {
  const json = { "Content-Type": "application/json" };
  const { accessToken } = (await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      name: "Licitante Externo",
      email: `externo-${crypto.randomUUID()}@teste.dev`,
      password: "Senha@123",
      role: "BIDDER",
    }),
  }).then((res) => res.json())) as { accessToken: string };
  const auth = { ...json, Authorization: `Bearer ${accessToken}` };
  await fetch(`${API_URL}/wallet/deposit`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ amountCents: depositCents }),
  });

  return {
    // Bids the current minimum of the lot; returns the HTTP status.
    async bidMinimum(lotId: string): Promise<number> {
      const lot = (await fetch(`${API_URL}/lots/${lotId}`).then((res) => res.json())) as {
        nextMinimumBidCents: number;
      };
      const response = await fetch(`${API_URL}/lots/${lotId}/bids`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ amountCents: lot.nextMinimumBidCents }),
      });
      return response.status;
    },
  };
}

// The live panel next to the lot picture (status, leader indicator, bid form).
export const bidPanel = (page: Page) => page.getByRole("complementary");
