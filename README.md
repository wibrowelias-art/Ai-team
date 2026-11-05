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
npm run test:e2e     # needs a build: runs `next start` on :3100 (AI disabled) and the mobile tests
npm run check:bundle # needs a build: fails if the Gemini key or endpoint is in client code
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
  economy.ts             per-cycle revenue/costs, daily payroll, loyalty
  products.ts            Factory pipeline
  missions.ts, events.ts missions and random events
  actions.ts             player actions (pay, raise, focus, budgets, approvals)
  build.ts, upgrades.ts  rooms, floors, room levels, shop upgrades and their effects
  hiring.ts              candidates, hire, fire
  offline.ts             "While you were away" catch-up
  ai/                    AI contract, prompts, validation, scripted fallback, applying results
  aiStore.ts             async chat / meeting / worker-text flows
src/server/              Gemini client, /api/chat handler, rate limiter (server only)
src/lib/                 browser helpers: AI client, Web Audio sound
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

## AI workers (Phase 3)

Set `GEMINI_API_KEY` in `.env.local` (see `.env.example`). Without it, every worker still talks, using scripted replies in their own voice.

- **`POST /api/chat`** handles three kinds of request: `chat`, `meeting` and `initiate` (a worker texting first). The key is only read on the server; `npm run check:bundle` scans the client build for it.
- **Models**: `gemini-flash-latest` first (6 s cap), then `gemini-flash-lite-latest`, all inside a 12 s budget. JSON mode (`responseMimeType: application/json`). If the primary returns 429/503 or times out, it is skipped for 60 s. If both fail, the client uses a scripted reply. Override with `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL`.
- **Limits**: 30 calls/minute per IP on the server (in memory, per instance), 400 calls per browser session on the client, payload size caps.
- **Validation**: the server validates the request and the model's JSON (allowed actions only, known speakers only, no "as an AI" replies). The client validates again, then checks each action against the live game state (locked rooms, loyalty before quitting, cash) before applying it.
- **Chat output**: `{ reply, action, newMemory, moodDelta }`. Actions: `assignTask`, `goTo`, `takeBreak`, `askRaise` (becomes an Approve/Decline card for you), `quit` (only below 20 loyalty).
- **Memories**: up to 30 facts per worker, saved with the game. A local extractor catches obvious facts ("my favorite color is green") even if the model forgets.
- **Meetings**: one call returns 6–12 lines and 1–3 decisions (`assignTask`, `setBudget`, `assignMission`). Lines appear one at a time in the War Room; you can type in at any point and the crew reacts. Decisions are applied when the meeting ends.
- **Workers texting first**: about one text per game hour across the crew, at most one per worker every 30 game minutes. 20% of these use the AI; the rest are scripted.
- **Tests**: unit tests mock `fetch`. The Playwright server runs with `AI_DISABLED=1`, so e2e tests are deterministic and cost nothing.

## Building, hiring and polish (Phase 4)

- **Build** (Build panel or a room's panel):
  - Locked rooms: Marketing Lab and Recording Studio ($2,500 each).
  - A 4th floor ($6,000), added on top, with a Rooftop Lounge ($3,500), Trading Desk ($5,000) and Vault ($4,000).
  - Room upgrades from level 1 to 5 (+8% output per level for the workers based there).
- **Shop upgrades** (3 levels each):
  - Coffee machine: energy drains slower.
  - Better PCs: more output.
  - Pool table: faster recovery on breaks.
  - Server rack: AI speed and research.
  - Neon sign: social growth.
- **Room effects**:
  - Studio and Marketing Lab boost Music and Social.
  - Vault halves event costs.
  - Rooftop Lounge adds daily mood and loyalty.
  - Trading Desk pays interest on idle cash.
- **Hire**: 3 candidates a day (name, role, skill, salary ask, bio); $100 for a new shortlist; signing bonus = one day's salary; crew cap 12.
- **Fire**: there is a confirm step and one day's severance. The crew's loyalty drops and a friend of the fired worker texts you about it.
- **Sound**: Web Audio chiptune effects (coin, notification, elevator ding, door, cheer, build, alert) and a quiet synth pad. Mute button next to Settings; audio starts on the first tap.
- **Tutorial**: 5 steps (tap a worker, pay a bonus, open the Treasury, call a meeting, build a room). Each step advances when you do it and can be skipped.
- **Graphics**: Auto / High / Low. Auto starts at High (DPR 2, two-level bloom) and steps down to DPR 1.5 with one bloom pass, then DPR 1 with no bloom, if frames average over 24 ms.

## Performance

- **Lighthouse (mobile, production build)**: Performance 99, Accessibility 100, Best Practices 100, SEO 100. FCP/LCP 0.8 s, TBT ~125 ms, CLS 0.
- **Fast intro**: the intro is server-rendered. The in-game UI is a separate chunk, prefetched while you read the intro. An inline script shows returning players a splash before first paint instead of flashing the intro.
- **Frame rate under 4x CPU throttling** (headless Chromium, software rendering, 390x844 @2.6x): 236+ fps on Low, which Auto picks there. Unthrottled, High is capped at 60 fps by the display. JavaScript is under 1% of frame time; the cost is pixel fill, which the quality levels control.
- **Layout QA**: automated checks at 360x640, 390x844, 430x932, 844x390, 768x1024 and 1440x900: no horizontal scroll, panels stay between the HUD and the bottom bar.

## Deploy (Vercel)

1. Push the repo to GitHub (CI in `.github/workflows/ci.yml` runs typecheck, lint, unit tests, build, the secret-leak check and the Playwright suite).
2. On [vercel.com](https://vercel.com/new), import the repository. Framework: Next.js (auto-detected). No `vercel.json` is needed.
3. In **Project → Settings → Environment Variables**, add `GEMINI_API_KEY` for Production (and Preview if you want AI there). Optional: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`.
4. Deploy. Without a key the game still works with scripted replies.

The per-IP rate limit is in memory, so on Vercel each function instance counts separately. For a hard global limit, put it in a shared store (e.g. Vercel KV / Upstash).

## Rendering

The world is drawn at art resolution (260 px wide) into an offscreen buffer and scaled up with nearest-neighbour filtering. Neon parts are also drawn into an emissive buffer that is shrunk and re-expanded with bilinear filtering for a cheap two-level bloom. Name tags and emoji bubbles are drawn in screen space so they stay readable at any zoom. The static scene is cached and only rebuilt when the building or theme changes.

## Roadmap

- [x] **Phase 1**: project setup, canvas building with 3 floors and rooms, pixel sprites, walking and elevators, HUD, save and load
- [x] **Phase 2**: economy, cycles, businesses, Treasury, Revenue Bay chart, Factory kanban, events, offline progress, tests
- [x] **Phase 3**: AI chat, actions, memories, meetings, worker-initiated messages
- [x] **Phase 4**: build/upgrade system, hire and fire, polish, sound, tutorial, performance, mobile QA, deploy setup
