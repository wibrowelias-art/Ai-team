import { expect, test, type Page } from "@playwright/test";

async function startGame(page: Page) {
  // Every test gets a fresh browser context, so storage starts empty.
  await page.goto("/");
  await expect(page.getByTestId("intro")).toBeVisible();
  await page.getByTestId("company-name").fill("Smoke Labs");
  await page.getByTestId("theme-purple").click();
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("game-canvas")).toBeVisible();
}

async function box(page: Page, testId: string) {
  const b = await page.getByTestId(testId).boundingBox();
  if (!b) throw new Error(`no box for ${testId}`);
  return b;
}

test("mobile: intro, HUD, clock ticks, panels fit under the HUD", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await startGame(page);
  await expect(page.getByTestId("hud-cash")).toContainText("$5,000");

  const clock1 = await page.getByTestId("hud-clock").innerText();
  await page.getByTestId("speed-5").click();
  await page.waitForTimeout(1500);
  const clock2 = await page.getByTestId("hud-clock").innerText();
  expect(clock2).not.toBe(clock1);

  const hud = await box(page, "hud");
  for (const nav of ["crew", "treasury", "factory", "build", "log"]) {
    await page.getByTestId(`nav-${nav}`).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    const pb = await panel.boundingBox();
    expect(pb).not.toBeNull();
    expect(pb!.y).toBeGreaterThanOrEqual(hud.y + hud.height - 1);
    expect(pb!.x).toBeGreaterThanOrEqual(0);
    expect(pb!.x + pb!.width).toBeLessThanOrEqual(390 + 1);
    await page.getByTestId("panel-close").click();
    await expect(panel).toHaveCount(0);
  }

  expect(errors).toEqual([]);
});

test("mobile: crew list opens a worker profile and the save survives a reload", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("nav-crew").click();
  await page.getByTestId("crew-bunc").click();
  await expect(page.getByTestId("panel-worker")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Shop Executor");
  await page.getByTestId("panel-close").click();

  // Force a save via a visibility change, then reload.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId("game-canvas")).toBeVisible();
  await expect(page.getByTestId("intro")).toHaveCount(0);
});

test("mobile: a $200 bonus to Bunc lowers cash by $200 and Bunc texts thanks within 3s", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("speed-0").click(); // freeze the economy so cash only moves by the bonus
  const before = await page.getByTestId("hud-cash").innerText();
  await page.getByTestId("nav-crew").click();
  await page.getByTestId("crew-bunc").click();
  await page.getByTestId("bonus-200").click();
  await expect(page.getByTestId("toast-message").first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId("toast-message").first()).toContainText("Bunc");
  const after = await page.getByTestId("hud-cash").innerText();
  const n = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));
  expect(n(before) - n(after)).toBe(200);
  await expect(page.getByTestId("worker-messages")).toBeVisible();
});

test("mobile: Treasury, Revenue Bay and Factory show the economy", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("nav-treasury").click();
  await expect(page.getByTestId("treasury-content")).toBeVisible();
  await expect(page.getByTestId("budget-shop")).toBeVisible();
  await page.getByTestId("panel-close").click();

  await page.getByTestId("hud-revenue").click();
  await expect(page.getByTestId("revenue-content")).toBeVisible();
  await expect(page.getByRole("img", { name: "Last 30 days" })).toBeVisible();
  await page.getByTestId("panel-close").click();

  await page.getByTestId("nav-factory").click();
  await expect(page.getByTestId("factory-content")).toBeVisible();
  await expect(page.getByTestId("factory-content")).toContainText("HQ Logo Tee");
});

test("mobile: coming back after 2 hours shows a summary and the simulated cash", async ({ page }) => {
  await startGame(page);
  // Close the tab (it saves on the way out), then come back in a new tab whose clock is 2 hours ahead.
  const later = await page.context().newPage();
  await page.close({ runBeforeUnload: true });
  await later.addInitScript(() => {
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + 2 * 60 * 60 * 1000;
  });
  page = later;
  await page.goto("/");
  await expect(page.getByTestId("away-modal")).toBeVisible();
  const delta = await page.getByTestId("away-cash").innerText();
  await page.getByTestId("away-continue").click();
  const cash = await page.getByTestId("hud-cash").innerText();
  const n = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));
  // HUD cash may be compact ($12.3K), so compare loosely.
  expect(Math.abs(5000 + n(delta) - n(cash) * (cash.includes("K") ? 1000 : 1))).toBeLessThan(cash.includes("K") ? 100 : 2);
});

// ---- AI features. The test server runs with AI_DISABLED=1, so these exercise the scripted fallback,
// which must satisfy the same acceptance criteria as the live model.

async function openChat(page: Page, id: string) {
  await page.getByTestId("nav-crew").click();
  await page.getByTestId(`crew-${id}`).click();
  await page.getByTestId("worker-chat").click();
  await expect(page.getByTestId("panel-chat")).toBeVisible();
}

async function chatSay(page: Page, text: string): Promise<string> {
  const before = await page.getByTestId("chat-worker-msg").count();
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-worker-msg")).toHaveCount(before + 1, { timeout: 15_000 }).catch(() => undefined);
  await expect(page.getByTestId("chat-typing")).toHaveCount(0, { timeout: 15_000 });
  return (await page.getByTestId("chat-worker-msg").last().innerText()).trim();
}

test("mobile: Dennis remembers the boss's favorite color 5 messages later", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("speed-0").click();
  await openChat(page, "dennis");
  await chatSay(page, "my favorite color is green");
  for (const t of ["how's it going?", "any ideas for the shop?", "cool", "keep it up"]) await chatSay(page, t);
  const answer = await chatSay(page, "what's my favorite color?");
  expect(answer.toLowerCase()).toContain("green");
});

test("mobile: telling Luke to work on the shop sends him to the Factory", async ({ page }) => {
  await startGame(page);
  await openChat(page, "luke");
  await chatSay(page, "go work on the shop");
  await page.getByTestId("panel-close").click();
  await page.getByTestId("nav-crew").click();
  await expect(page.getByTestId("crew-luke")).toContainText(/Factory/);
});

test("mobile: a meeting about 'next product' has 3+ speakers and applies a decision", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("nav-crew").click();
  await page.getByTestId("open-meeting").click();
  await page.getByTestId("meeting-topic").fill("next product");
  await page.getByTestId("meeting-start").click();
  await expect(page.getByTestId("meeting-decisions")).toBeVisible({ timeout: 40_000 });
  const speakers = await page.getByTestId("meeting-line").evaluateAll((els) => els.map((e) => e.querySelector("span")?.textContent ?? ""));
  expect(new Set(speakers.filter(Boolean)).size).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("meeting-decisions").locator("li", { hasText: "✓" }).first()).toBeVisible();
});

test("mobile: tapping a room on the canvas opens its panel", async ({ page }) => {
  await startGame(page);
  const canvas = await box(page, "game-canvas");
  // Tap the middle of the building's middle floor, left room (Revenue Bay).
  await page.mouse.click(canvas.x + canvas.width * 0.18, canvas.y + canvas.height * 0.5);
  await expect(page.getByRole("dialog")).toBeVisible();
});
