/** Camera math. The camera stores the world point at the center of the view and a zoom (screen px per world px). */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface View {
  w: number;
  h: number;
}

export interface WorldSize {
  w: number;
  h: number;
}

export const MAX_ZOOM = 10;

export function screenToWorld(cam: Camera, view: View, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.x + (sx - view.w / 2) / cam.zoom, y: cam.y + (sy - view.h / 2) / cam.zoom };
}

export function worldToScreen(cam: Camera, view: View, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.zoom + view.w / 2, y: (wy - cam.y) * cam.zoom + view.h / 2 };
}

/** Smallest zoom: the whole world fits in the view with a little margin. */
export function minZoom(view: View, world: WorldSize): number {
  return Math.min(view.w / world.w, view.h / world.h) * 0.9;
}

/** Default zoom: the building fills the view's width (or height on wide screens). */
export function fitZoom(view: View, world: WorldSize): number {
  return Math.min(view.w / (world.w - 16), view.h / world.h);
}

export function clampCamera(cam: Camera, view: View, world: WorldSize): Camera {
  const zoom = Math.max(minZoom(view, world), Math.min(MAX_ZOOM, cam.zoom));
  const halfW = view.w / 2 / zoom;
  const halfH = view.h / 2 / zoom;
  // When the view is bigger than the world on an axis, lock to the center.
  const x = halfW * 2 >= world.w ? world.w / 2 : Math.max(halfW, Math.min(world.w - halfW, cam.x));
  const y = halfH * 2 >= world.h ? world.h / 2 : Math.max(halfH, Math.min(world.h - halfH, cam.y));
  return { x, y, zoom };
}

/** Zoom by a factor while keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(cam: Camera, view: View, world: WorldSize, factor: number, sx: number, sy: number): Camera {
  const before = screenToWorld(cam, view, sx, sy);
  const zoom = Math.max(minZoom(view, world), Math.min(MAX_ZOOM, cam.zoom * factor));
  const next = { ...cam, zoom };
  const after = screenToWorld(next, view, sx, sy);
  return clampCamera({ x: cam.x + (before.x - after.x), y: cam.y + (before.y - after.y), zoom }, view, world);
}

export function panBy(cam: Camera, view: View, world: WorldSize, dxScreen: number, dyScreen: number): Camera {
  return clampCamera({ ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom }, view, world);
}

/** Start view: fit a focus band (the building) instead of the whole world, centered on it. */
export function initialCamera(view: View, world: WorldSize, focus?: { y0: number; y1: number }): Camera {
  if (!focus) return clampCamera({ x: world.w / 2, y: world.h / 2, zoom: fitZoom(view, world) }, view, world);
  const h = focus.y1 - focus.y0;
  const zoom = Math.min(view.w / (world.w - 16), view.h / h);
  return clampCamera({ x: world.w / 2, y: (focus.y0 + focus.y1) / 2, zoom }, view, world);
}
