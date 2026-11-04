import { describe, expect, it } from "vitest";
import { buildingBand, findRoom, floorBase, hitRoom, initialBuilding, roomAt, roomRect, ROOM_DEFS, spotX, worldHeight } from "@/game/building";
import { COLUMNS, FLOOR_H, SHAFT_CENTER_X, WORLD_W } from "@/game/constants";
import { planRoute, routeLength } from "@/game/pathfinding";
import { clockOf, dayOf, formatDuration, formatMoney, minutesToNextCycle } from "@/game/time";
import { clampCamera, initialCamera, MAX_ZOOM, minZoom, panBy, screenToWorld, worldToScreen, zoomAt } from "@/render/camera";
import { GLYPH_H, hasGlyph, textWidth } from "@/render/font";
import { composeFrame, FRAME_H, FRAME_NAMES, FRAME_W } from "@/render/sprites";
import { CREW_SEEDS } from "@/game/crew";

describe("pathfinding", () => {
  it("walks directly on the same floor", () => {
    expect(planRoute({ floor: 1, x: 20 }, { floor: 1, x: 150 })).toEqual([{ kind: "walk", x: 150 }]);
  });

  it("returns an empty route when already there", () => {
    expect(planRoute({ floor: 0, x: 40 }, { floor: 0, x: 40 })).toEqual([]);
  });

  it("walks to the elevator, rides, and walks out across floors", () => {
    const r = planRoute({ floor: 0, x: 20 }, { floor: 2, x: 140 });
    expect(r).toEqual([
      { kind: "walk", x: SHAFT_CENTER_X },
      { kind: "ride", toFloor: 2 },
      { kind: "walk", x: 140 },
    ]);
  });

  it("skips the walk legs when starting or ending at the shaft", () => {
    expect(planRoute({ floor: 2, x: SHAFT_CENTER_X }, { floor: 0, x: SHAFT_CENTER_X })).toEqual([{ kind: "ride", toFloor: 0 }]);
  });

  it("picks the cheapest shaft when there are several", () => {
    const r = planRoute({ floor: 0, x: 200 }, { floor: 1, x: 210 }, [20, 190]);
    expect(r[0]).toEqual({ kind: "walk", x: 190 });
  });

  it("measures route length", () => {
    const from = { floor: 0, x: 20 };
    const r = planRoute(from, { floor: 2, x: 140 });
    expect(routeLength(from, r, FLOOR_H)).toBe(Math.abs(SHAFT_CENTER_X - 20) + 2 * FLOOR_H + Math.abs(140 - SHAFT_CENTER_X));
  });
});

describe("building", () => {
  const b = initialBuilding();

  it("starts with 3 floors and the 7 core rooms unlocked", () => {
    expect(b.floors).toBe(3);
    const unlocked = b.rooms.filter((r) => !r.locked).map((r) => r.type).sort();
    expect(unlocked).toEqual(["CHILL", "COMMAND", "FACTORY", "REVENUE_BAY", "SERVER_ROOM", "TREASURY", "WAR_ROOM"]);
  });

  it("keeps rooms inside the world and not overlapping the shaft", () => {
    for (const r of b.rooms) {
      const rect = roomRect(r);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(WORLD_W);
      expect(rect.x + rect.w <= SHAFT_CENTER_X - 5 || rect.x >= SHAFT_CENTER_X + 5).toBe(true);
    }
  });

  it("puts every spot inside its room", () => {
    for (const r of b.rooms) {
      const rect = roomRect(r);
      ROOM_DEFS[r.type].spots.forEach((_, i) => {
        const x = spotX(r, i);
        expect(x).toBeGreaterThanOrEqual(rect.x);
        expect(x).toBeLessThan(rect.x + rect.w);
      });
    }
  });

  it("hit tests rooms by world point", () => {
    const chill = findRoom(b, "chill")!;
    const rect = roomRect(chill);
    expect(hitRoom(b, rect.x + 5, rect.y + 5)?.id).toBe("chill");
    expect(roomAt(b, chill.floor, rect.x + 1)?.id).toBe("chill");
    expect(hitRoom(b, SHAFT_CENTER_X, rect.y + 5)).toBeUndefined();
  });

  it("has a building band inside the world", () => {
    const band = buildingBand(3);
    expect(band.y0).toBeGreaterThan(0);
    expect(band.y1).toBeLessThan(worldHeight(3));
    expect(floorBase(2)).toBeLessThan(band.y1);
  });

  it("columns do not overlap", () => {
    for (let i = 1; i < COLUMNS.length; i++) expect(COLUMNS[i].x).toBeGreaterThanOrEqual(COLUMNS[i - 1].x + COLUMNS[i - 1].w);
  });
});

describe("time", () => {
  it("formats day and clock", () => {
    expect(dayOf(0)).toBe(1);
    expect(dayOf(1440)).toBe(2);
    expect(clockOf(8 * 60 + 5)).toBe("08:05");
    expect(clockOf(1440 + 23 * 60 + 59.9)).toBe("23:59");
  });

  it("counts down to the next cycle", () => {
    expect(minutesToNextCycle(480)).toBe(60);
    expect(minutesToNextCycle(500)).toBe(40);
    expect(formatDuration(98)).toBe("1h 38m");
    expect(formatDuration(7)).toBe("7m");
  });

  it("formats money", () => {
    expect(formatMoney(5000)).toBe("$5,000");
    expect(formatMoney(-200)).toBe("-$200");
    expect(formatMoney(12345, true)).toBe("$12.3K");
    expect(formatMoney(2_500_000, true)).toBe("$2.5M");
    expect(formatMoney(9999, true)).toBe("$9,999");
  });
});

describe("camera", () => {
  const view = { w: 390, h: 740 };
  const world = { w: WORLD_W, h: worldHeight(3) };

  it("round-trips screen and world coordinates", () => {
    const cam = { x: 100, y: 120, zoom: 2.5 };
    const w = screenToWorld(cam, view, 50, 600);
    const s = worldToScreen(cam, view, w.x, w.y);
    expect(s.x).toBeCloseTo(50);
    expect(s.y).toBeCloseTo(600);
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const cam = { x: 130, y: 200, zoom: 3 };
    const before = screenToWorld(cam, view, 200, 300);
    const next = zoomAt(cam, view, world, 1.5, 200, 300);
    const after = screenToWorld(next, view, 200, 300);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it("clamps zoom and position", () => {
    const tooFar = clampCamera({ x: 9999, y: -9999, zoom: 99 }, view, world);
    expect(tooFar.zoom).toBe(MAX_ZOOM);
    expect(tooFar.x).toBeLessThanOrEqual(world.w);
    expect(tooFar.y).toBeGreaterThanOrEqual(0);
    const tooSmall = clampCamera({ x: 0, y: 0, zoom: 0.01 }, view, world);
    expect(tooSmall.zoom).toBeCloseTo(minZoom(view, world));
  });

  it("pans opposite to the drag", () => {
    const cam = { x: 130, y: 200, zoom: 4 };
    const next = panBy(cam, view, world, 40, 0);
    expect(next.x).toBeCloseTo(120);
  });

  it("fits the building width on a phone", () => {
    const cam = initialCamera(view, world, buildingBand(3));
    expect(cam.zoom * (WORLD_W - 16)).toBeLessThanOrEqual(view.w + 0.001);
    expect(cam.zoom).toBeGreaterThan(1.4);
  });
});

describe("pixel art", () => {
  it("composes every frame at 12x16 for every crew look", () => {
    for (const seed of CREW_SEEDS) {
      for (const f of FRAME_NAMES) {
        const grid = composeFrame(seed.look, f);
        expect(grid).toHaveLength(FRAME_H);
        for (const row of grid) expect(row).toHaveLength(FRAME_W);
      }
    }
  });

  it("covers every sign character with the bitmap font", () => {
    for (const def of Object.values(ROOM_DEFS)) {
      for (const ch of def.sign) expect(hasGlyph(ch)).toBe(true);
    }
    expect(textWidth("AB")).toBe(7);
    expect(GLYPH_H).toBe(5);
  });
});
