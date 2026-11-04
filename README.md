# NEON HQ

A mobile-first startup tycoon game. You own a neon pixel-art warehouse full of AI workers: pay them, give them orders, chat with them, and grow a business empire.

> NEON HQ is a game. All money and workers are fictional.

## Stack

- Next.js (App Router) + TypeScript (strict) + Tailwind CSS 4
- HTML5 canvas for the building (pixel-perfect, all art generated in code), React for HUD and panels
- Zustand store, saves to IndexedDB with a localStorage fallback
- Vitest (logic) and Playwright (mobile smoke test, 390x844)
- Google Gemini via a server route in Phase 3 (`GEMINI_API_KEY`, see `.env.example`)

## Scripts

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # typecheck + lint + unit tests
npm run build
npm run test:e2e     # builds must exist: runs `next start` on :3100 and the mobile smoke test
```

## Project layout

```
src/app/                 layout (fonts, viewport), page, global styles
src/game/                pure game logic, no DOM
  constants.ts           palette, world geometry, timing
  types.ts               GameState, Worker, RoomSlot …
  building.ts            room definitions, floor/room/shaft geometry, hit tests
  pathfinding.ts         walk → elevator → walk routes
  crew.ts                the starting seven
  sim.ts                 world step: clock, cycles, worker brains, movement
  time.ts                clock and money formatting
  save.ts                IndexedDB/localStorage, validation, migration
  store.ts               Zustand store + UI state
src/render/              canvas side
  sprites.ts             worker sprites composed from pixel grids
  font.ts                3x5 bitmap font for neon signs
  scene.ts               static scene: sky, skyline, building, rooms, props
  renderer.ts            low-res world buffer → upscaled + bloom + name tags
  camera.ts              pan / pinch / wheel zoom math
  hit.ts                 worker hit testing
src/components/          HUD, bottom bar, canvas + input, panels, intro
tests/unit/              Vitest
tests/e2e/               Playwright
```

## Economy (Phase 2)

- One **cycle** = 1 game hour = 1 real minute at 1x. A day is 24 cycles.
- Each cycle, every business earns from the workers focused on it. Output = time actually worked × skill × mood × task-budget boost, then × department budget (diminishing returns), × social demand, × Matt's operations bonus, × research efficiency, × event modifiers, × a random 0.8–1.2.
  - **Shop**: every live Factory product sells a little; older products sell less.
  - **Freelance**: gig payouts, with occasional client refunds.
  - **Music**: fans stream; released songs and viral hits grow the fanbase.
  - **Social**: followers bring sponsorships and lift demand for everything.
  - **Research**: consulting income plus points that unlock candles, posters, then +5% efficiency steps.
- **Costs**: AI compute and department budgets every cycle; salaries and rent at midnight.
- **Factory**: Pending → Approval (you ship or reject) → Delivered → Done. Auto-approve is optional.
- **Loyalty** drifts with pay vs. a fair wage (60 + 2 × skill) and mood. Under 20 for 3 days → threats; under 10 → they quit.
- **Events** (~2 per day): viral hit, refund wave, investor offer, poaching, server outage, worker drama. Unanswered events resolve with their default choice after 12 game hours.
- **Offline**: on return the world catches up at 1x, capped at 3 game days, events take their default choice and products auto-approve. A "While you were away" summary shows the numbers.

## Rendering

The world is drawn at art resolution (260 px wide) into an offscreen buffer and scaled up with nearest-neighbour filtering. Neon parts are also drawn into an emissive buffer that is shrunk and re-expanded with bilinear filtering for a cheap two-level bloom. Name tags and emoji bubbles are drawn in screen space so they stay readable at any zoom. The static scene is cached and only rebuilt when the building or theme changes.

## Roadmap

- [x] **Phase 1**: project setup, canvas building with 3 floors and rooms, pixel sprites, walking and elevators, HUD, save and load
- [x] **Phase 2**: economy, cycles, businesses, Treasury, Revenue Bay chart, Factory kanban, events, offline progress, tests
- [ ] **Phase 3**: AI chat, actions, memories, meetings, worker-initiated messages
- [ ] **Phase 4**: build/upgrade system, hire and fire, polish, sound, tutorial, performance, mobile QA, deploy
