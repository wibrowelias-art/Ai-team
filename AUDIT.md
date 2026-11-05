# NEON HQ polish audit

How it was done: a scripted 10‑day playthrough through the real simulation (approve designs, answer events, hire, build, upgrade), a 30‑day balance run with three player styles, a code search for placeholder words, and a browser pass at 390×844 and 1440×900 that opened every panel, room, worker, chat, meeting, build menu, hire list, settings and event, checking console output, tap-target sizes, overlaps and text. Screenshots are in `docs/audit/before/`.

Items are ordered by impact. Ticked = fixed.

## A. Bugs (things that are wrong)

- [x] A1. **Task progress is stuck at 0** for everyone except workers on a mission. `updateStats` stopped advancing `taskProgress` when cycle work tracking was added. Worker panel shows "TASK 0" forever.
- [x] A2. **Operations workers earn $0.** Matt's "Earned" is $0 after 10 days even though ops boosts every business. Credit ops a share of revenue.
- [x] A3. **Name tags overlap** when two workers share a desk area ("MATTDENNIS", "FINZIGGY", "MAVERICKBUNC"). Tags need to push apart.
- [x] A4. **Economy snowballs**: 30‑day run ends at $1.16M for a sensible player, $739K for a reckless one (huge bonuses, pay cuts, hiring everyone, floors on day 1) and $120K for a player who never touches anything. Nothing can go bankrupt. Fan/follower growth is proportional to itself (exponential). Needs saturation, higher late costs and real downside for reckless play.
- [x] A5. **Early game too slow**: at 1x the first $1,000 of revenue takes ~10 real minutes. Target is under 3.
- [ ] A6. **Event modal blocks the whole screen** including speed/pause while it waits. Acceptable, but the modal must then be obviously an event (it has no icon or color coding per kind) and show up on the log with its outcome exactly once (currently "Event: Worker drama 💢" and then "Worker drama: Sort it out…" as two lines).
- [x] A7. **Default phone zoom shows workers ~25 px tall.** Spec says ≥ 40 px. Frame the building taller (crop the sky) and let the HUD float.
- [x] A8. Meeting room panel shows the room blurb, floor, level and upgrade button **above** a live meeting. The live meeting should take the whole panel.
- [x] A9. Mission progress bar: checked, `StatBar` already clamps to 100. Not a bug.

## B. Placeholder / leftover text

- [x] B1. Worker panel memories: "…they will remember it (Phase 3)."
- [x] B2. Server Room panel: "Server upgrades arrive in Phase 4."
- [x] B3. The `Soon` component (dashed "coming soon" box) still exists; remove it and every use.
- [x] B4. Meeting header shows "scripted" / "live" badge. It exposes the fallback. Remove.
- [x] B5. Log: "Viral hit!: Celebrate with the crew." (double punctuation from stripping emoji). Format event outcomes properly.
- [x] B6. Room name "Chill / Bar" vs sign "CHILL BAR" vs blurb. Use "Chill Bar" everywhere.
- [x] B7. Factory: "Lines unlocked: 👕 🎵 🎬 🕯️ 🖼️ · Research unlocks more." reads like debug output. Make it a proper row with labels.
- [x] B8. Treasury multiplier "X1.13" (uppercase X from the pixel font). Use "×1.13" in the sans font.
- [x] B9. Treasury "Budget left $167 today" is unclear. Replace with "Budgets today: $83 of $250".
- [x] B10. Empty states have no design: Log (fresh game), Messages ("No messages yet."), Memories, Missions ("No missions running."), Factory columns ("Empty"), Hire ("No candidates left today.").
- [x] B11. Greyed buttons: none left that do nothing (Build/Hire/Chat all work now), but disabled money buttons give no reason. Add a tooltip-style note ("Not enough cash").

## C. Spam and noise

- [x] C1. **Log is flooded** with "X is wiped out and heads to the Chill / Bar." (10 workers × several times a day). Drop it from the log; keep the 💤 bubble.
- [x] C2. **Chat spam**: Bunc texts "design done!!! pls approve (…)" and then "LETS GOOO 🚀🚀" on every approval. Vary the lines, skip the thank-you when auto-approving, and group repeats.
- [x] C3. **Toast stack**: every worker text becomes a toast; with 10 workers they pile up over the tutorial card. Group repeats ("Bunc: 3 designs ready") and cap at 3.
- [x] C4. Log shows "Event: …" and the chosen outcome as two entries; merge into one line when resolved.

## D. Visual design

- [x] D1. No single colour token file; hex values are scattered across components, canvas code and CSS. Create `src/ui/tokens.ts` + CSS variables and use them everywhere.
- [x] D2. Surfaces are inconsistent: `bg-black/20`, `bg-black/30`, `bg-ink2`, `bg-panel/95` mixed. Use surface / raised / border tokens.
- [x] D3. Radii vary (rounded, rounded-lg, rounded-xl, rounded-full chips). Panels 12 px, buttons 10 px.
- [x] D4. Type sizes are ad hoc (`text-[11px]`, `[13px]`, `[14px]`, `[15px]`, `text-base`, `text-lg`, `text-xl`). Fix to 11/13/15/18/24, pixel font only for HUD, signs, tags and big numbers.
- [x] D5. Contrast: `text-white/40` (≈3:1) and `text-white/50` on dark surfaces fail AA for small text. Map to secondary (#a0a0c0) and muted (#6a6a88, only for 13 px+ non-essential).
- [x] D6. Icons are emoji (bottom bar, business tabs, factory lines). Replace with one pixel icon set drawn in code.
- [x] D7. Panel header: no icon, inconsistent close button (36×36). Add icon + 44 px close. Sticky action footer for panels with a primary action (Hire, Build, Meeting, Fire confirm, Chat input).
- [x] D8. Panel border has no inner glow or texture; add subtle inner glow + noise.
- [ ] D9. Upgrades don't change a room's look (only a pip column). Add furniture per level.
- [ ] D10. Monitors are static; add moving screen content (ticker, bars, typing glow).
- [x] D11. Event modal title in pixel font renders emoji badly ("Worker drama 💢"). Use a pixel icon per event kind.

## E. Animation and feel

- [ ] E1. Walk cycle is 4 frames; no acceleration, no blink/look-around, no stretch when tired, no high-five, no stomp.
- [ ] E2. Elevator has no doors and no ease; pod moves linearly.
- [ ] E3. No coin fly-in to the HUD when revenue arrives, no "+$240" floaters. (HUD numbers now count smoothly.)
- [x] E4. Panels slide with a plain CSS ease, no spring; list items don't stagger; buttons have no press state.
- [ ] E5. No screen flash / shake on viral hit or outage, no confetti on milestones.
- [ ] E6. `prefers-reduced-motion` only disables CSS animations, not canvas camera easing or floaters.
- [x] E7. No feedback sound on taps and panel opens.

## F. Gameplay feel

- [ ] F1. No milestone track (first $10k, 10 workers, 5 floors, first viral hit, $1M revenue).
- [ ] F2. No daily report card at the end of each game day.
- [ ] F3. Workers never comment on events or celebrate wins together; Chill Bar has no gossip.
- [ ] F4. Worker-initiated texts rarely mention concrete game things (a sale, a refund). Add real-data templates.
- [ ] F5. Tutorial card sits over the view with no arrow pointing at the real control; add an arrow/pulse on the target.

## G. Chat polish

- [x] G1. Chat has no avatars on bubbles, no timestamps, no read ticks, no system chips for actions ("Luke moved to Factory" only appears as a toast).
- [x] G2. Quick-reply chips are cut off at the right edge and don't match the spec set.
- [x] G3. Multi-line replies arrive as one block; split into bubbles with short delays.

## H. Sound

- [x] H1. One master volume; no separate music / effects sliders.
- [x] H2. Missing effects: tap, panel open, cash register, level up.

## I. Mobile, accessibility, performance

- [x] I1. **Tap targets under 44 px**: speed buttons 36×32, fullscreen/mute/settings 36×32, panel close 36×36, tutorial Skip 23×17, HUD cells 65×35, intro "Open the doors" 40 px tall, "Ship" 28 px, sliders 16 px tall, chat chips 30 px.
- [ ] I2. Not yet checked at 360×780 and 412×915 (checked 360×640, 390×844, 430×932).
- [ ] I3. Panels, chat and sound are in the main game chunk; lazy-load them.
- [ ] I4. Lighthouse mobile performance 94 after the 2.5D world; keep ≥ 90 after polish, accessibility ≥ 95.
- [ ] I5. Console is clean (0 errors / warnings) at both sizes. Keep it that way.

## J. Final checks

- [ ] J1. Full Playwright run: name a company, pay a bonus, chat, meeting, build, reload survives.
- [ ] J2. No API key in client bundle (`npm run check:bundle`).
- [ ] J3. Deploy to Vercel.
- [ ] J4. Before/after screenshots of main, Treasury, Factory, chat, meeting.
- [ ] J5. CHANGELOG.md.
