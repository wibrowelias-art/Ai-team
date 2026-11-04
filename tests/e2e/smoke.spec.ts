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

test("mobile: tapping a room on the canvas opens its panel", async ({ page }) => {
  await startGame(page);
  const canvas = await box(page, "game-canvas");
  // Tap the middle of the building's middle floor, left room (Revenue Bay).
  await page.mouse.click(canvas.x + canvas.width * 0.18, canvas.y + canvas.height * 0.5);
  await expect(page.getByRole("dialog")).toBeVisible();
});
