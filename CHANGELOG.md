# Changelog

## Polish pass

The audit that drove this pass is in `AUDIT.md`; before/after screenshots are in `docs/audit/`.

### Fixed
- Task progress bars moved again for everyone, not only workers on a mission.
- Operations workers are credited the revenue lift they create.
- Name tags push apart when two workers share a desk.
- The economy no longer snowballs: audience growth saturates, late costs rise with crew size and floors, reckless play can go bankrupt. A sensible 30-day run ends around $300K, a passive one around $75K.
- The first $1,000 arrives in under three minutes at 1x (launch hype).
- Default phone zoom shows workers at 40 px or taller; the HUD floats over the building.
- A live meeting takes the whole War Room panel.
- Events are logged once, with their outcome, and the popup shows a pixel icon per kind.

### Removed
- Every "Phase 3", "Phase 4", "coming soon", "scripted/live" and debug-style string. One About line remains.
- The "wiped out" log spam, the double thank-you texts after approvals, and the toast pile-up (toasts group per worker and cap at three).

### Design
- One token file (`src/ui/tokens.ts` + CSS variables), a 12 px panel / 10 px button radius scale, a 11/13/15/18/24 type scale, AA contrast everywhere.
- A pixel icon set drawn in code replaces emoji in the bottom bar, business tabs, factory lines, panel headers and the event popup.
- Panels: icon header, 44 px close, sticky action footer, inner glow and noise, spring slide-in, staggered lists, press state on every button.
- Designed empty states for Log, Messages, Memories, Missions, Factory columns and Hire.
- Rooms grow with their level: a plant at 2, a framed print at 3, LED strip and rug at 4, trophy shelf and neon underglow at 5.
- Wall screens are alive: breathing bar charts, a scanning map, a stock ticker, a pulsing dollar and a beating heart.

### Animation
- Six-frame walk cycle with spring-smoothed motion, breathing, blinking and look-around, a stretch when tired, a stomp when angry, high-fives on cheers, typing glow on monitors.
- Elevator doors slide per floor; the pod eases.
- Coins fly to the HUD on revenue with "+$X" floaters; bonuses fly back out with "-$X". The HUD counts up smoothly.
- Screen flash on viral hits, shake on outages, confetti on milestones. All of it honours `prefers-reduced-motion`.

### Gameplay feel
- Milestone track in the Command room (first $1K, first launch, first meeting, $10K, crew of 10, viral hit, five floors, 10K fans, $100K, $1M) with cash rewards and a celebration banner.
- A report card at the end of every game day: revenue, spent, net, crew mood, best business, trend, launches and milestones.
- Workers comment on resolved events by name, text about yesterday's real numbers each morning, and gossip at the Chill Bar depending on who they sit with.
- Tutorial steps point at the actual control with a pulsing ring and arrow.

### Chat
- Messenger look: avatars on bubbles, timestamps, read ticks, system chips for actions, quick-reply chips that fit the screen, a sticky input footer.
- Replies arrive after 1 to 3 seconds and split into separate bubbles.

### Sound
- New effects: tap, panel open, cash register, level up. Separate music and effects sliders.

### Mobile, accessibility, performance
- Every tap target is 44 px or larger.
- Layout checked at 360x780, 390x844, 412x915, 430x932, 844x390, 768x1024 and 1440x900 with a clean console.
- Panels and chat load on first open; the game chunk shrank from 176 KB to 80 KB.
- The API key never reaches the client bundle (`npm run check:bundle`).

## Earlier
- 2.5D world: neon city, room depth, day/night, weather, camera inertia.
- Bigger building: four rooms per floor, up to eight floors, room catalog.
- Phases 1 to 4: canvas building, economy, AI workers and meetings, build/hire/fire, sound, tutorial, performance work, deploy setup.
