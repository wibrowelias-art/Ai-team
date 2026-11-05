import { describe, expect, it } from "vitest";
import { buildingBand, buildingSpan, floorBase, roomRect, worldHeight } from "@/game/building";
import { BUILDING_W, BUILDING_X, COLUMNS, SHAFT, WORLD_W } from "@/game/constants";
import { mulberry32, newGameState } from "@/game/sim";
import { nightFactor, rainAmount, skyColors, weatherFor } from "@/render/atmosphere";
import { clampCamera, initialCamera } from "@/render/camera";
import { groundLine, laneY, tunnelY } from "@/render/scene";

describe("bigger world geometry", () => {
  it("puts 4 rooms and the shaft inside the building, with city on both sides", () => {
    expect(BUILDING_X).toBeGreaterThan(150);
    expect(WORLD_W - (BUILDING_X + BUILDING_W)).toBe(BUILDING_X);
    expect(COLUMNS[0].x).toBeGreaterThanOrEqual(BUILDING_X);
    expect(COLUMNS[3].x + COLUMNS[3].w).toBeLessThanOrEqual(BUILDING_X + BUILDING_W);
    expect(SHAFT.x).toBe(COLUMNS[1].x + COLUMNS[1].w);
    expect(COLUMNS[2].x).toBe(SHAFT.x + SHAFT.w);
  });

  it("street, lanes and subway sit below the bottom floor", () => {
    const g = newGameState("T", "pink", mulberry32(1));
    const gy = groundLine(g.building.floors);
    expect(gy).toBeGreaterThanOrEqual(floorBase(g.building.floors - 1));
    const [l0, l1] = laneY(3);
    expect(l0).toBeGreaterThan(gy);
    expect(l1).toBeGreaterThan(l0);
    expect(tunnelY(3).y1).toBeLessThan(worldHeight(3));
    for (const r of g.building.rooms) expect(roomRect(r).y + roomRect(r).h).toBeLessThanOrEqual(gy);
  });
});

describe("time of day", () => {
  it("is night at midnight, day at noon, and in between at dusk", () => {
    expect(nightFactor(0)).toBe(1);
    expect(nightFactor(12 * 60)).toBe(0);
    const dusk = nightFactor(19 * 60);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    expect(nightFactor(24 * 60 + 12 * 60)).toBe(0); // day 2 noon
  });

  it("changes sky color smoothly", () => {
    for (let m = 0; m < 1440; m += 5) {
      const a = skyColors(m);
      const b = skyColors(m + 5);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a.top[i] - b.top[i])).toBeLessThanOrEqual(14);
        expect(Math.abs(a.bottom[i] - b.bottom[i])).toBeLessThanOrEqual(14);
      }
    }
    expect(skyColors(12 * 60).bottom[2]).toBeGreaterThan(skyColors(0).bottom[2]);
  });

  it("weather is fixed per day and varied across days", () => {
    expect(weatherFor(5)).toBe(weatherFor(5));
    const kinds = new Set(Array.from({ length: 60 }, (_, d) => weatherFor(d + 1)));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(rainAmount("storm")).toBeGreaterThan(rainAmount("rain"));
    expect(rainAmount("clear")).toBe(0);
  });
});

describe("camera in a world smaller than the view", () => {
  const world = { w: WORLD_W, h: worldHeight(3) };

  it("lets the world sit anywhere inside a tall view instead of locking it to the center", () => {
    const view = { w: 390, h: 1600 };
    const a = clampCamera({ x: 380, y: 100, zoom: 1.3 }, view, world);
    const b = clampCamera({ x: 380, y: 300, zoom: 1.3 }, view, world);
    expect(a.y).not.toBe(b.y);
    // but never lets it scroll off screen
    const off = clampCamera({ x: 380, y: -9999, zoom: 1.3 }, view, world);
    expect(off.y).toBeGreaterThanOrEqual(world.h - view.h / 2 / 1.3 - 0.001);
  });

  it("frames the tower between the HUD and the bottom bar", () => {
    const view = { w: 390, h: 844 };
    const insets = { top: 44, bottom: 56 };
    const cam = initialCamera(view, world, buildingBand(3), buildingSpan(), insets);
    const band = buildingBand(3);
    const top = (band.y0 - cam.y) * cam.zoom + view.h / 2;
    const bottom = (band.y1 - cam.y) * cam.zoom + view.h / 2;
    expect(top).toBeGreaterThanOrEqual(insets.top - 1);
    expect(bottom).toBeLessThanOrEqual(view.h - insets.bottom + 1);
    // centered within the visible area
    expect(Math.abs((top + bottom) / 2 - (insets.top + view.h - insets.bottom) / 2)).toBeLessThan(2);
  });
});
