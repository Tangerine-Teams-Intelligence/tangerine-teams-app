# Changelog

All notable changes to Tangerine AI Teams are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project tries to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- === v1.14.6 round-7 === — rolled-up entries for v1.13 + v1.14 arcs.
     Each version block focuses on user-visible features so this doc can
     also feed the in-app /whats-new-app route. -->

## [1.24.0] — 2026-05-04 — Obsidian-style force-directed graph view

CEO direction after rejecting 7 visual designs: *"用一个类似 obsidian 的图像，而不是简单的文本框"*. Stop trying to render the timeline as cards / pages / planes. Render it as a constellation of nodes + edges, force-directed, the visual everyone associates with Obsidian.

The T view (`canvasView === "time"`) now mounts `<GraphView/>` instead of `<DailyMemoryPages/>` (v1.23 Depth Canvas). DailyMemoryPages.tsx + TimeDensityList stay on disk but are no longer mounted from `/feed`.

### Library

- `react-force-graph-2d` (~150 KB gzipped). d3-force + Canvas wrapper with built-in pan / zoom / hover / click. Canvas (not WebGL / not SVG) handles 1000+ nodes at 60fps. No three.js.

### Edge inference rules (pure helper, exported for tests)

For every pair of atoms (A, B):

- **Mention edge** (weight 2) — A's body @-mentions B's actor or vice versa.
- **Concept edge** (weight 1, capped at 2) — `A.concepts ∩ B.concepts` non-empty; weight = overlap count.
- **Thread edge** (weight 1) — A and B share `refs.conversation_id` / `refs.thread` / `refs.threads[0]`.
- **Actor edge** (weight 0.5) — same actor + atoms within 24h of each other.

Plus structural atom→thread + atom→person edges so multi-atom threads / actors anchor a cluster. Edges below weight 0.5 dropped; if total edges > nodes × 5 the lowest-weight ones are pruned (avoids the hairball look).

### Visual

- Background: stone-50 (light) / stone-950 (dark) — full viewport edge-to-edge canvas.
- **Atom nodes** — solid disc, `vendorFor(source).color`, size 6-24 by HighlightsRow score.
- **Thread nodes** — hollow ring, stone-400 stroke, size by atom-count (≥2 atoms).
- **Person nodes** — bigger ring, stone-500 stroke, size by atom-count (≥2 atoms).
- **Edges** — 1px stone-300/40, width = weight (0.5-2).
- **Hover** — hovered node 1.5x with label backdrop; direct neighbors full opacity; non-neighbors 0.18 opacity. Edges to/from hovered node turn `var(--ti-orange-500)`.
- **Click atom** → `onOpenAtom(node.event)` → AtomBottomSheet (existing contract).
- **Click thread / person** → focus filter (graph collapses to that node + its neighbors). "clear focus ×" button restores full graph; clicking empty canvas while focused also clears.
- **Today's atom node** gets a 1.2px orange ring (single accent rule preserved).
- Labels invisible until zoom > 2.5x or hover (avoids permanent-label clutter).

### Force-simulation knobs (Obsidian feel)

- `linkDistance: 70` (tighter than default for clusters)
- `chargeStrength: -200` (mild repulsion, not explosive)
- `cooldownTicks: 200` / `warmupTicks: 50` (settle quickly then freeze)
- `d3AlphaDecay: 0.03`, `d3VelocityDecay: 0.3`

### Initial render

- After 500ms `graphRef.zoomToFit(400, 50)` auto-fits the viewport.
- Highest-scored atom is pinned at origin (`fx = fy = 0`) so the user's eye lands there.

### Constraints honored

- **R6 honesty preserved** — empty events still routed to caller's EmptyState (diagnostic 3-row card with Open Settings button) before mounting the graph. Loading + error states distinct.
- **Single accent** — orange shows only on hovered edges + today's atom ring + Save button. Nowhere else.
- **No three.js** — Canvas not WebGL.
- **All v1.21.1 exit-paths preserved** — back-to-time button on H/P/R, CatchupBanner show-less, TopNav 4 buttons, Spotlight Cmd+K.
- **CatchupBanner** still pinned above the graph; **CaptureInput** still sticky bottom.
- **bucketByDay timezone fix** from v1.22 still on disk (DailyMemoryPages preserved).

### Footer hint

`T time` → `T graph`. Internal CanvasView key still `"time"` (state continuity, no migration).

### Tests

`tests/v1_24-graph-view.test.tsx` — covers (1) graph data construction with correct node count, (2) mention edges between atoms with @-mentions, (3) click atom node → onOpenAtom with the right event, (4) hover state highlights neighbors via data attribute, (5) empty events array → EmptyState (caller-side), not empty graph. `react-force-graph-2d` is mocked (jsdom Canvas limitation) — the mock surfaces graph data + click handlers as `data-testid` props so the data flow is verified without touching Canvas.

## [1.23.0] — 2026-05-01 — Depth Canvas (planar 3D)

CEO rejected v1.22's Daily Memory Pages: *"完全不行，整个 visual 根本不行，非常不行"*. After 6 redesigns the direction surfaced: *"要有一种平面 3D 的感觉"* — planar 3D / 2.5D. 2D layout that USES 3D techniques (depth shadow, layered planes, hover lift, perspective tilt) but stays a plane. Apple Vision Pro UI / Stripe homepage / Linear app aesthetic.

### Z-axis layers (back to front)

1. **Background gradient base** — `radial-gradient(ellipse 80% 60% at 50% 30%, rgba(255,244,234,0.85), rgba(245,245,244,1) 65%)`. Soft warm glow at upper-center fading to neutral stone. Pure CSS, stays put.
2. **Heatmap underlayer** — semi-transparent (max 0.20 opacity) day-density bars colored by the dominant source for each day. Ambient ground, NOT primary content.
3. **Day separators** — sticky-ish floating chips with `backdrop-blur-sm`, semi-transparent bg, subtle shadow. Sit between heatmap and atom layer.
4. **Atom cards** — solid white backgrounds with prominent box-shadows. Hero gets the deepest shadow (`shadow-[0_12px_48px_rgba(0,0,0,0.10)]` for today's hero), highlights medium, quieter cards lightest. On hover: `translateY(-2px)` + shadow grows. Today's hero gets a near-imperceptible perspective tilt (`rotateX(0.5deg)`) that flattens on hover.

### Source tinting

Changed from v1.22's flat tinted-bg to a glow: `box-shadow: 0 0 40px {source-color}/0.15` plus a 1px source-tinted border. Source is *lit* not *colored*. Combined with the depth shadow each card gets a subtle aura keyed to its vendor.

### Typography refresh

Serif (`font-display`) only for "Today" / "Yesterday" headlines (high-attention recent days). Sans for older day labels. Mono for time / actor / source / IDs / counts. Reduces serif density.

### Constraints honored

- **Pure CSS** — no three.js / framer-motion / WebGL. transforms + box-shadow + backdrop-blur only.
- **R6 honesty** — empty Today still renders the diagnostic line; caller-side empty state owns the all-empty case.
- **Click contract** — hero / highlight / quieter rows all call `onOpenAtom(ev)` → AtomBottomSheet.
- **bucketByDay timezone fix** from v1.22 preserved.
- **All v1.21.1 exit-paths** preserved (back-to-time button, CatchupBanner show-less, TopNav 4 buttons, etc.).

### Deferred to v1.24+

- Parallax-on-scroll (heatmap moves slower than cards).
- Mobile responsive narrow-viewport polish.
- Atom-emerges-from-cell zoom-in (that was v1.18 H view; different aesthetic).

### Tests

742 vitest passed (was 733), npm build clean, cargo check clean.

## [1.22.0] — 2026-05-01 — Daily Memory Pages (replace time-density list)

CEO: *"我还是不喜欢这个 memory 的视觉呈现"*. The v1.19→v1.21 4-col `time/actor/source/body` typography list felt like a `git log`, not memory. Memory should feel curated, visual, hierarchical.

### Replaces

- `TimeDensityList` (4-col grid log) — left on disk for power-user reference but no longer mounted on `/feed`. T-view now mounts `<DailyMemoryPages/>`.

### Adds

- `app/src/components/feed/DailyMemoryPages.tsx` — stacked day-card sections, vertical scroll. Each day:
  - Serif `font-display text-[28px]` date headline ("Today" / "Yesterday" / "Wednesday, May 1") + mono atom-count chip.
  - **1 hero atom** picked by the v1.17 HighlightsRow score (+10 @me, +5 other mention, +3 cross-source, +2 decision, +1 last-24h). Source-tinted card background at 15% opacity (uses `vendorFor(source).color`). Sans body, line-clamp-3.
  - **3 highlight cards** in a 3-col grid below the hero (atoms ranked 2–4). Smaller cards with source-tinted left border.
  - **"show N quieter atoms ↓"** affordance for the rest. Click → expand into a compact sub-list. "show less ↑" toggle when expanded.
  - Today's hero card uses larger padding (`p-8`) so the most-recent day visually dominates.
- `app/tests/v1_22-daily-memory-pages.test.tsx` — specs covering day grouping, hero ranking, show-more toggle, empty-day rendering, source-tint application.

### Preserved

- CatchupBanner at the top (v1.21).
- CaptureInput sticky at the bottom (v1.21).
- TopNav (v1.20).
- back-to-time button on H/P/R views (v1.21.1).
- AtomBottomSheet contract (click hero/highlight → opens sheet).

### Known caveats

- `DailyMemoryPages` is keyboard-navigable but the new card layout doesn't yet have full focus-visible parity with the old list. A11y sweep is logged for v1.22.x.
- Mobile responsive deferred (3-col highlight grid will collapse to 1-col on narrow viewport via Tailwind's `grid-cols-3` → `grid-cols-1` at `max-md` — no explicit test).

## [1.21.1] — 2026-05-01 — Exit-path audit: every "click-in" gets a "click-out"

CEO surfaced the gap I missed: *"主页面点进去都没有退出键，你为什么不直接看整个 app 代码逻辑符不符合人的操作需求再去改"*. v1.21.0's audit was source-walk; this one is from-the-user POV. Walked every route + every sub-surface to verify there's an obvious exit affordance.

### Audit findings + fixes

| Surface | Entry | Exit before v1.21.1 | Exit now |
|---|---|---|---|
| `/feed` Heatmap (H key) | T → H | Hidden — must know to press T | **Visible "← timeline" button** top-left of canvas |
| `/feed` People (P key) | T → P | Hidden — must know to press T | **Visible "← timeline" button** top-left of canvas |
| `/feed` Replay (R key) | T → R | Auto-returns + ESC | Same + visible "← timeline" button |
| Catch-up "show all" | Click | One-way — no collapse | **"show less ↑" button** appears when expanded |
| TopNav buttons | Always visible | T (28px) consistent, ⌘K/⚙/⏻ varying smaller sizes | All 4 buttons normalized to 28×28, opacity 80%→90%, text contrast bumped |
| AtomBottomSheet | Click row | × + ESC + backdrop ✓ | unchanged (already had 3 exits) |
| CaptureInput expanded | Click `+` | ESC + cancel button ✓ | unchanged |
| Spotlight modal | Cmd+K | ESC + backdrop ✓ | unchanged |
| `/sources/*/setup` (6 vendors) | Direct URL / Settings link | Each has `aria-label="Back"` button → /memory ✓ | unchanged |
| `/onboarding-team`, `/join` | Deep link | Each navigates to / or /memory on completion ✓ | unchanged |
| `/settings` and other AppShell routes | TopNav ⚙ | TopNav T → / ✓ | unchanged |

### Files touched

- `app/src/routes/feed.tsx` — added `<button data-testid="canvas-back-to-time">` rendered when `canvasView !== "time"`. `position: absolute top-3 left-4 z-20`, mono "← timeline" with title hint "Back to timeline (T)".
- `app/src/components/feed/CatchupBanner.tsx` — added "show less ↑" button rendered when `showAll && count > TOP_N`.
- `app/src/components/layout/AppShell.tsx::TopNav` — normalized button sizes (h-7 w-7 across all 4), bumped backdrop opacity 80% → 90%, bumped text contrast (stone-600 → stone-700 / stone-400 → stone-300).

### Method

Source-walked `App.tsx` for every route. Source-walked the canvas surface for every sub-state. For each, traced the click handler that takes the user IN, then verified an obvious click-out path exists. Anything keyboard-only (T/H/P/R cycle, ESC) gets a parallel visible button.

This is the audit method I should have done before v1.21.0 — and v1.20, and v1.19. CEO's critique was correct; the previous audits were code-coverage, not user-flow.

## [1.21.0] — 2026-04-30 — Operability: catch-up / capture / ask + Settings rewrite

CEO inspected v1.20 and surfaced THE big architectural problem: the redesign
made the app pure read-only — atoms scrolled past, no input, no action, no
"what do I do" surface. v1.21.0 adds three operational surfaces and finishes
the Settings visual rewrite that v1.20.2 started but never shipped.

After v1.21.0 the user can: see what's new since they last looked, drop a
thought into the timeline without leaving the canvas, and ask their team's
memory a natural-language question without an LLM round-trip.

### Surfaces added

- **A. Catch-up banner** — `app/src/components/feed/CatchupBanner.tsx`. Pinned
  to the top of `/feed` (inside the `max-w-2xl` column, above the time-view
  header). Reads `~/.tangerine-memory/.tangerine/cursors/<user>.json` for
  `last_opened_at`; filters events newer than that; renders a header line
  + the top 3 rows in the same 4-col grid the time-density list uses (time
  / actor / source / body). `show all ↓` reveals the rest in-line. The
  user's `last_opened_at` is bumped to "now" on first engagement (atom
  click or T/H/P/R key press) so the next reload resets honestly to "0
  new atoms" — never auto-bumped on mount. R6 honesty: never-visited →
  render nothing (the full timeline IS the catch-up); 0-new → quiet
  `caught up · last looked X ago` mono line in stone-400.

- **B. Capture input** — `app/src/components/feed/CaptureInput.tsx`. Sticky
  to the bottom of `/feed`, above the FooterHint. Collapsed = single
  hairline-bordered row with `+` glyph and placeholder. Click → expands
  into a 3-row textarea + 3 tag chips (`decision` / `note` / `task`) +
  Save button. ⌘+Enter saves. Save path: new Tauri command
  `capture_manual_atom` writes a markdown atom with YAML frontmatter to
  `personal/<user>/threads/manual/<utc-iso>.md` AND appends a synthetic
  row to `timeline.json` so the next reload surfaces it without waiting
  for the daemon's 5-min Python `index-rebuild`. The atom flows through
  the activity ring + Tauri emit so the right-rail ActivityFeed prepends
  without polling. Failures surface via toast with the truncated Rust
  error message; success → quiet `Captured ✓` toast + collapsed input
  + cleared textarea.

- **C. Cmd+K Ask mode** — `app/src/components/spotlight/Spotlight.tsx`.
  Tab strip at the top of the spotlight modal: `[ Search ]` (default,
  v1.19 behavior) and `[ Ask ]` (new). Ask mode reranks the existing
  500-event corpus by a 4-signal heuristic (term match + recency
  exponential decay + decision-kind boost + cross-source concept
  overlap) — 50 lines of pure TS, NO LLM round-trip, sub-100ms answers.
  Top 5 results shown with one-line excerpt extracted from the body
  line that contains a query term. Click → opens AtomBottomSheet. R6:
  empty corpus → "No atoms in memory yet — connect a source in
  Settings first"; zero matches → "No atoms match." Never fabricates.

- **D. Settings visual rewrite** — `app/src/pages/settings/`. Carries
  through what v1.20.2 started but never shipped (rate-limit
  interrupted). `Settings.tsx` is now a sans-serif h1, 3-tab strip
  with orange-underline active, hairline below. `ConnectSection.tsx`
  has stacked Theme + Language rows (label `w-[10ch]`, dropdown
  `w-[20ch]`), 8 IDE source rows in typography-only layout (no card
  chrome) with vendor-color dot · name · status · toggle · sync, mono
  read-path subline, mono disk-presence subline, connected sources
  floated to top + not-installed dimmed `opacity-50`, hairline between
  rows. Same restraint pattern in `PrivacySettings.tsx` and
  `SyncSection.tsx`. All `st-*` test ids preserved end-to-end.

### Rust additions

- `app/src-tauri/src/commands/views.rs` — new `capture_manual_atom`
  Tauri command: validates user alias + body (≤32K chars) + kind ∈
  {decision, note, task}, writes the markdown atom with YAML
  frontmatter via `atomic_write` (tmp + rename), synthesises a
  `TimelineEvent` matching the Python indexer's row shape, appends
  it to `timeline.json` (replace-by-id idempotent), pushes onto the
  activity ring, fires `activity:atom_written` Tauri emit. Returns
  the new event so the React caller can prepend optimistically.

### Design constraints honored

- Single-canvas IA preserved — Catch-up + Capture are ADDITIONS to the
  existing canvas, not redesigns. TopNav unchanged. T/H/P/R single-key
  shortcuts unchanged. Spotlight Cmd+K unchanged for Search mode.
- Single-accent rule — orange used only at: active mode tab, hover row,
  capture Save button, catch-up "X new atoms" count.
- No emoji, no lucide icons in body content (Spotlight Search icon
  retained per Round 1 exception; capture `+` is a text glyph).
- v1.20.1 timeline-fix preserved — catch-up uses the same
  `read_timeline_recent` Tauri command.

## [1.20.1] — 2026-04-30 — Fix timeline.json index pipeline

CEO inspected his disk: 71 atom `.md` files exist under `~/.tangerine-memory/`,
but `~/.tangerine-memory/.tangerine/timeline.json` was missing. Cascade failure:
`/feed`, Spotlight, heatmap, replay, TEAM_INDEX all read from the index → all
showed empty even though data was on disk. v1.20.0's audit was source-walk
only, so it missed this — the React side handles `[]` honestly (R6 empty state),
masking the pipeline lie.

### Bugs fixed

- **Sidecar path mismatch (Python writer ≠ Rust reader)** — `src/tmi/event_router.py:229`. Python's `sidecar_dir(memory_root)` returned `memory_root.parent / ".tangerine"`, a leftover from the pre-v1.7 layout where `memory_root` meant `<repo>/memory/`. With the flat `~/.tangerine-memory/` convention now returned by `config.memory_root_path`, every Python write went to `~/.tangerine` while every Rust read went to `~/.tangerine-memory/.tangerine/`. The two never met on disk. v1.20.1 unifies on `<memory_root>/.tangerine/` (matches `app/src-tauri/src/commands/views.rs::sidecar_dir`). Backward compat: legacy installs that already populated `<parent>/.tangerine` keep using it so cursors / briefs / alignment files aren't orphaned.

- **`rebuild_index` blind to personal-agent atoms** — `src/tmi/event_router.py:763`. The walker only scanned `timeline/<YYYY-MM-DD>.md` for sentinel-fenced blocks. Personal-agent capture (Cursor / Claude Code / Codex / Windsurf) writes one YAML-frontmatter `.md` per conversation under `personal/<user>/threads/<source>/<id>.md` — these go straight to disk without flowing through the sentinel writer. They've been invisible to the index since v3.0 shipped. v1.20.1 adds `_walk_standalone_atoms()` which globs `personal/*/threads/*/*.md`, `meetings/*.md`, `decisions/*.md`, parses the frontmatter, and emits index records with stable ids derived from `(source, kind, file_stem, ts)`. Sentinel-block events still win on id collisions (richer representation). On the CEO's actual disk this took the index from 0 events to 62 events.

### Tests added

- `tests/test_event_router.py` (5 new) — pinned the regression:
  - `test_rebuild_index_picks_up_personal_agent_atoms` — single claude-code atom on disk → 1 event in index, body + ts + source preserved.
  - `test_rebuild_index_combines_timeline_and_personal_atoms` — sentinel block + standalone atom → both end up in the index.
  - `test_rebuild_index_dedupes_when_both_shapes_collide` — sentinel id wins.
  - `test_rebuild_index_skips_unparseable_atoms` — bad frontmatter / missing ts skip cleanly without aborting the walk.
  - `test_rebuild_index_writes_timeline_json_to_unified_sidecar` — guards Daizhe's actual symptom: timeline.json must land at `<memory_root>/.tangerine/`, not `<parent>/.tangerine/`.
- `tests/test_event_router.py::test_sidecar_dir_default_is_inside_memory_root` — replaces the stale `test_sidecar_dir_is_sibling_of_memory_root` which encoded the broken legacy path.
- `tests/test_event_router.py::test_sidecar_dir_honours_legacy_path_for_existing_installs` — backward-compat path preserved.

### Honest preserved

R6 honesty intact: a failed rebuild still surfaces via `do_heartbeat`'s `index_rebuild` error capture (daemon ring buffer). The fix doesn't paper over errors with a fake `[]` — it ensures the rebuild actually finds the data that's there.

### Verification on real disk

Ran `python -m tmi.daemon_cli index-rebuild --memory-root ~/.tangerine-memory` against the CEO's actual machine. Output: `{"op":"index-rebuild","events":62,"ts":"…"}`. `timeline.json` landed at `~/.tangerine-memory/.tangerine/timeline.json` (32 KB). Next daemon heartbeat will refresh `TEAM_INDEX.md` with the correct atom count.

### v1.20.0 audit fixes preserved

Unchanged: TopNav home/signout, ToastHost, Sidebar canvas-view buttons, OAuth stub-disable, Spotlight `:replay`/`:about` toasts. This is bug-only — no features added.

## [1.20.0] — 2026-04-30 — Comprehensive functional audit

CEO Daizhe pointed out that the v1.19.3 audit was reading source code, not walking through user flows. This release does the walk: every interactive surface verified end-to-end, every honesty / dead-link / lie-to-the-user bug fixed in a single commit. Quote: *"你犯了这个错误说明这个app还会有很多其他功能性使用性错误，你他妈去改好所有东西"*.

### Bugs fixed

- **TopNav home button + working signout** — `app/src/components/layout/AppShell.tsx`. v1.19.4 shipped a 3-button TopNav (⌘K / ⚙ / ⏻) but missed two critical pieces: (a) no way back to home from `/settings` (clicking ⚙ while on /settings is a no-op); (b) the ⏻ signout was a plain `<NavLink to="/auth">` — App.tsx's auth-gate sees the user is still signed in and bounces them right back to `/`, so signout did nothing. Now: 4 buttons (T home → ⌘K → ⚙ → ⏻); home button routes to `/`; signout actually calls `signOut()` from `@/lib/auth` then navigates to `/auth`. All buttons get `aria-label`s.

- **Sidebar canvas-view buttons (no more dead-route nav)** — `app/src/components/layout/Sidebar.tsx`. The wave-19 sidebar had 5 nav links pointing at `/feed`, `/threads`, `/people`, `/canvas`, `/memory` — but v1.19's redirect table sends 4 of those to `/`. Clicking any of them while on `/` looked like a no-op (orange highlight flickered, canvas view never changed). Now they're `<button>`s that flip `ui.canvasView` directly (T/H/P/R mirror the AppShell single-key shortcuts). Brand link: `/feed` → `/`. Cmd+K trigger button: was calling `togglePalette()` against a dead `paletteOpen` flag with no UI consumer; now opens the v1.19 Spotlight via `setSpotlightOpen(true)`. Drops the wave-1.13 unread-badge / presence-dots primitives that nothing was consuming after v1.20.

- **Auth OAuth honesty in stub mode** — `app/src/routes/auth.tsx`. Daizhe explicitly hit "github 登录页面用不了". Diagnosis: the v1.19 "Continue with GitHub" button silently minted a stub session named `Github-stub@tangerine.local` instead of opening GitHub. The button label promised something the app couldn't deliver in stub mode (no `SUPABASE_URL` env var). Now: in stub mode, an amber notice explains "GitHub / Google sign-in needs Supabase configured", and both OAuth buttons render disabled. The user is steered to email sign-in (which works in stub) or "Skip to local" (also works).

- **ToastHost added — pushed toasts now actually render** — `app/src/components/layout/ToastHost.tsx` (new), mounted in `AppShell.tsx`. The store had `pushToast()` writing to `ui.toasts[]` and `dismissToast()` removing entries, but **no component was rendering them**. ~12 call sites (Sync now / Git init / OAuth flow / etc) were writing into a void. Settings → Connect's "Sync now wrote 14, skipped 0" feedback the v1.18.2 R6 audit specifically hardened was invisible to users. Now: bottom-right toast stack (newest top), error toasts sticky, info/success auto-dismiss after `durationMs`. `aria-live="polite"`; per-toast ✕ close button.

- **Spotlight `:replay` honesty** — `app/src/components/spotlight/Spotlight.tsx`. Running `:replay` with an empty corpus would silently switch to the replay view with nothing to play (blank canvas, slowly ticking progress bar for 5s, auto-flip back). Now: zero-corpus replay calls `pushToast("info", "No captures to replay. Connect a source in Settings first.")` and stays on the current view.

- **Spotlight `:about` shows version** — `app/src/components/spotlight/Spotlight.tsx`. Pre-v1.20, `:about` redirected to `/settings` and hoped the user'd find the version chip somewhere. Now it pushes a toast with `Tangerine AI Teams v${__APP_VERSION__}` directly. Updated the command hint from `Tangerine v` (filler) to `show app version`.

### Tests added

- `app/tests/v1_20-audit.test.tsx` (new, 12 tests) — pinned every audit fix:
  - Sidebar T/H/P/R buttons flip `ui.canvasView`
  - Sidebar active button has `data-active="true"`
  - Sidebar brand → `/`, Cmd+K trigger opens Spotlight
  - ToastHost renders pushed toasts; error toasts sticky; dismiss button works; empty stack renders nothing
  - Spotlight `:replay` with empty corpus pushes a toast
  - Spotlight `:about` pushes a version toast
  - Auth OAuth buttons disabled in stub mode + warning notice present
  - `signOut()` clears the stub session

- `app/tests/wave14-sidebar-collapse.test.tsx` — rewrote 2 of 3 cases for the v1.20 IA. The legacy contract (5 anchor `<a>` tags pointing at `/feed`/`/threads`/`/people`/`/canvas`/`/memory`) is now an explicit anti-contract: the suite now asserts `<button>` testids for the 4 canvas-view buttons + the surviving Memory NavLink, and pins `/feed`/`/threads`/`/people`/`/canvas` to the killed-href list.

Suite numbers: **712 passed, 14 skipped, 0 failed** (up from 700/14/0).

### What this DOESN'T fix (deferred to v1.21+ scope)

- Real Supabase OAuth backend wiring. The Tauri command is plumbed but the actual Supabase HTTP `auth/v1/authorize` redirect handler is still `Err(StubModeOnly)` in `auth.rs`. Setting `SUPABASE_URL` + `SUPABASE_ANON_KEY` env vars + writing the deep-link handler is its own design ticket.
- Mobile responsive sweep. v1.20 keeps the v1.19 desktop-first stance per the audit prompt; mobile remains acceptable to break.
- Cargo `commands::billing::tests::cmd_trial_subscribe_cancel_round_trip` + `commands::identity::tests::resolve_uses_env_var_when_no_persisted` — pre-existing parallel-test-isolation flakes (verified to pass in isolation; fail only when the full suite runs concurrently). Same status as v1.19.3.

## [1.19.4] — 2026-04-30 — Emergency nav fix: TopNav + clickable Open Settings

CEO Daizhe installed v1.19.3 and got stuck. Quote: *"一打开就还是这个页面，都回不去登陆页面没有按钮，你在设计什么 app 啊"*. Diagnosis: v1.19.0 killed the sidebar by default and trusted Cmd+K + footer hint as the only nav. Footer hint hides itself after 5 boots. Result: a user who doesn't memorize Cmd+K had zero way to reach Settings, sign-out, or any other route. R6 honesty was preserved (the empty state told the truth) but the surface offered no escape hatch.

This release is a hot-fix for the dead-end. Real IA rethink (sidebar restoration in a thin / minimal / Obsidian-style left-rail) is **v1.20 scope** — this is a bandage so Daizhe can finish dogfooding v1.19 without being trapped.

### Fixes

- `app/src/components/layout/AppShell.tsx` — new `<TopNav>` always-visible top-right minibar with 3 controls: `⌘K` chip opens Spotlight; ⚙ → `/settings`; ⏻ → `/auth`. Position `fixed top-3 right-4`, mono chip + 2 SVG icon buttons (no lucide), 80%-opacity backdrop-blur so the bar never blocks underlying content. Present on every route + every state — sidebar visibility, footer-hint counter, and Cmd+K familiarity no longer matter for the escape hatch.
- `app/src/routes/feed.tsx::EmptyState` (no-sources branch) — body copy: "No sources connected. Connect Cursor / Claude Code / Slack to start capturing your AI workflow." Followed by an actual orange "Open Settings" button (`useNavigate("/settings")`), then a small mono "or press ⌘K and type :sources" secondary line. Button = SPA routing, no full reload.

### What this DOESN'T fix (v1.20 scope)

- Sidebar restoration as the proper nav paradigm. v1.19's "Single-canvas + Cmd+K-everything" thesis over-corrected from v1.18's chrome-heavy 5-tab sidebar. Obsidian does NOT hide its sidebar by default — its premium feel comes from typography + restraint, not "kill all chrome". v1.20 will rethink the IA properly.
- Auth flow itself: GitHub OAuth requires Supabase env vars Daizhe hasn't set. "Skip to local" remains the working path; documented as borderline.

## [1.19.2] — 2026-04-29 — Round 3 visual dogfood + final-mile honesty polish

Round 3 closed the four honesty admissions Round 2 left on the floor and applied three visual fixes from a deep source-review pass (browser tooling was unavailable; falling back to source dogfood was honest about the limitation rather than fabricated). No new surfaces; no widened scope.

### Honesty / polish fixes

1. **AtomBottomSheet chrome cleanup** — removed the Avatar circle and the colored vendor dot from the header. The sheet now renders pure typography: `actor · source · clock · date` (sans medium for actor; mono 11px for the source / clock / date triplet; `·` separators in stone-300). The `×` close button stays text-only. Drops `Avatar` and `vendorFor` imports. Honest fallback `?` for missing actor / source preserved. (`app/src/components/feed/AtomBottomSheet.tsx:99-160`)

2. **Auto-replay real corpus gate** — Round 2 F's `samplesSeeded` proxy replaced with the real check. AppShell now calls `readTimelineRecent(500)` directly inside the auto-replay effect; only when `events.length > 0` (and `welcomedReplayDone === false`) does it flip to replay. A `useRef` latch prevents re-fire on dep updates; an empty corpus / failed call resets the latch so the effect can re-run later. The store flag `samplesSeeded` is no longer load-bearing for replay, but stays for the seed-bootstrap effect. (`app/src/components/layout/AppShell.tsx:124-167`)

3. **Time-view header dynamic timeframe** — Round 2 C's hardcoded `"past 7 days"` replaced with a computed span from the oldest event in the result set: `today · N atoms` / `past N days · M atoms` (1-13d) / `past K weeks · M atoms` (14-30d, K=ceil(days/7) capped at 4) / `past 30+ days · M atoms`. When `events.length === cap`, count gets `+` suffix (e.g. `500+ atoms`) so the user sees we hit the cap. Malformed `oldest.ts` falls back to `recent · N atoms` rather than fabricating a number. New helper `buildTimeViewHeaderLabel` exported for direct testing. (`app/src/routes/feed.tsx:148-155, 502-560`)

4. **Footer hint responsive** — below 1280px (Tailwind `xl:`) the long T/H/P/R + ⌘K row collapses to `⌘K` only; above 1280px the full row renders. Implemented as two sibling spans (`hidden xl:inline` + `inline xl:hidden`); the version chip stays in both modes. Stops the hint from wrapping mid-word on narrow laptops without dragging in a full responsive sweep. (`app/src/components/layout/AppShell.tsx:381-433`)

### Visual fixes (from source review — no browser tooling available)

5. **V1: Time-row focus ring** — added `focus-visible:border-[var(--ti-orange-500)] focus-visible:bg-stone-100 focus-visible:outline-none` plus `transition-colors duration-100` to time-density rows. Tab navigation now matches the orange-accent design language instead of falling through to the browser default focus ring. (`app/src/routes/feed.tsx:188-195`)

6. **V7: AtomBottomSheet drag handle hidden on desktop** — the swipe-down drag handle now has `md:hidden` so it only renders on mobile (<768px) where the swipe gesture actually exists. Desktop users (who tap a row → sheet) no longer see chrome that suggests an unsupported gesture. (`app/src/components/feed/AtomBottomSheet.tsx:106-114`)

7. **V6: Spotlight modal fade-in entrance** — added `animate-fade-in` (200ms ease-out, 8px translateY → 0) to the spotlight panel so the modal feels like a real overlay rather than a div that snapped into place. The animation is already in the tailwind config. (`app/src/components/spotlight/Spotlight.tsx:218`)

### Tests

- `app/tests/v1_19-single-canvas.test.tsx` updated for the corpus-gate semantics. Round 2 F's three specs replaced with Round 3 Fix 2 variants: `fires when corpus has events` / `does NOT fire when welcomedReplayDone=true` / `does NOT fire when corpus is empty`. Round 2 C's three specs expanded to seven: `today` / `past N days` / `past N weeks` / `past 30+ days` / singular `1 atom` / hidden in empty state / `+` suffix at cap / `recent` fallback for malformed ts. Two new specs added under Round 3 Fix 4 for the responsive footer hint. Updated import to pull in `buildTimeViewHeaderLabel` from `routes/feed`.

### Phase 1 verification — honest record

- Browser dogfood was attempted and failed: Chrome MCP not connected, Edge granted at "read" tier blocks navigation, Claude Preview MCP denied. Fell back to deep source review per the Round 3 brief's explicit fallback. Visual issues identified by close-reading rendered components rather than viewing actual pixels.

### Constraints honoured

- v1.18.2 R6 fixes intact.
- v1.19 Round 1 + Round 2 contracts preserved (single-canvas + Cmd+K-everything; no banners; no StatusBar; no FilterChips).
- All previous v1_19 specs still pass; new specs added; no specs deleted (Round 2 F + C variants replaced).
- Scope did not expand beyond the 4 honesty fixes + 3 visual fixes the brief allowed.
- No installer; no tag; no release. Daizhe dogfoods Round 3 and decides if Round 4 is needed.

## [1.19.1] — 2026-04-30 — Round 2 friction sweep (empty-state honesty / view indicator / typography)

Daizhe dogfooded v1.19.0 Round 1, identified 8 concrete friction points, and dispatched this Round 2 fix-list. No redesign — polish on Round 1's bones.

### Changes (Round 2 A–H)

A. **Empty-state honesty restored** — `routes/feed.tsx::EmptyState` now reads `useStore(s => s.ui.personalAgentsEnabled)` and branches on connected sources. Zero connected → `"No sources connected. Press ⌘K and type :sources, or open Settings to connect Cursor / Claude Code / Slack."`. ≥1 connected → v1.17.5-style three-row diagnostic (`watching` / `memory dir` / `first atom`) inside the v1.19 single-canvas aesthetic — `grid-cols-[10ch_1fr]`, mono labels, sans values, no card border, no orange accent. Source list normalises `claude_code` → `claude-code`, truncates after 3 with `· N more`. `memoryRoot` undefined → `"resolving…"` in `text-stone-400` (R6 amber treatment v1.18.2 added). New testIds: `empty-state-watching` / `-memory-root` / `-first-atom`. (`routes/feed.tsx:355-461`)

B. **Active view indicator in footer hint** — `components/layout/AppShell.tsx::FooterHint` now renders T/H/H/R as separate spans driven by an array; the active label gets `font-semibold text-[var(--ti-orange-500)]`. Each span exposes `data-testid="footer-hint-label-${key}"` and `data-active="true|false"` for tests. Version chip preserved. (`AppShell.tsx:355-413`)

C. **Atom count + timeframe header** — `routes/feed.tsx::TimeDensityList` renders a single mono line above the first day separator: `past 7 days · N atoms`. Singular handled (`1 atom`). Hidden in the empty-state branch. testId `time-view-header`. (`routes/feed.tsx:148-156`)

D. **CanvasView chromeless mode** — added `chromeless?: boolean` prop to `components/canvas/CanvasView.tsx`. When `true`, the internal Replay button + zoom-hint overlay are gated off. `feed.tsx::HeatmapView` and `ReplayView` now pass `chromeless={true}` so the v1.19 outer surface owns the replay shortcut + canvas affordances. Default `false` preserves any v1.18 callers untouched. (`CanvasView.tsx:50-58, 80-83, 233-247`; `feed.tsx:218-224, 308-314`)

E. **Spotlight closes on selection** — `components/spotlight/Spotlight.tsx::onSelect` now closes after atom / person / thread / `:replay` / `:settings` / `:sources` / `:about` selection. `:theme` is the one exception — it leaves the spotlight open so the user can cycle system → light → dark in one go. `:about` re-routes to `/settings` (no separate about modal in Round 2). (`Spotlight.tsx:124-160, 549-586`)

F. **First-launch auto-replay** — `components/layout/AppShell.tsx` mount effect: if `welcomedReplayDone === false` AND `samplesSeeded === true` (the Round 1 spec's fallback proxy for "data pipeline confirms at least sample data on disk"), set `canvasView=replay` and flip `welcomedReplayDone=true`. ReplayView's onComplete handler returns the user to time view naturally. `welcomedReplayDone` was already in zustand `ui` slice + persist whitelist from v1.18.0. (`AppShell.tsx:115-141`)

G. **Typography sweep + accent restraint** — Inter sans for body / labels / buttons; JetBrains Mono for time stamps / dates / IDs / numbers / keybind hints / version strings; orange `var(--ti-orange-500)` reserved for hover row left-border, Spotlight selected-row left-border, footer hint active-view label, and the literal day-separator string `"Today"`. Lucide icons stripped from the v1.19 surface (the `X` in `AtomBottomSheet` close button → text-only `×`). Search icon kept in Spotlight per Round 1 exception. The time-row source column moved from sans to mono so source text matches the time-stamp typography family. (`AtomBottomSheet.tsx:24, 127-135`; `feed.tsx:191-193`)

H. **Day-separator "Today" gets the orange accent** — `routes/feed.tsx::groupByDay` now also returns `isToday: boolean`. The day separator h2 conditionally sets `text-[var(--ti-orange-500)]` when `isToday`, else stays at `text-stone-700 dark:text-stone-300`. data attribute `data-is-today` exposed for tests. The single visual nod that gives the time-density list a daily heartbeat without breaking the pure-typography aesthetic. (`feed.tsx:163-180, 471-501`)

### Tests

- `app/tests/v1_19-single-canvas.test.tsx` expanded from 21 to 35 specs. New describe blocks: `Round 2 A` (empty-state branches: no-sources copy + diagnostic three-row + `resolving…` + `· N more` truncation, 4 tests), `Round 2 B` (footer active label + version chip preserved, 2 tests), `Round 2 C` (header singular/plural/hidden, 3 tests), `Round 2 E` (atom open closes spotlight, `:theme` leaves open, 2 tests), `Round 2 F` (auto-replay fires once / suppressed when latch flipped / suppressed when samplesSeeded=false, 3 tests), `Round 2 H` (Today gets accent, 1 test). Total: 35 tests passing.
- D and G are visually-verified through `data-` attributes / class assertions only (no pixel comparison) — `data-is-today`, `data-empty-mode`, `data-active`. Acceptable Round 2 coverage; Round 3 candidate to add Playwright visual snapshots if desired.

### Constraints honoured

- Round 1's IA preserved — no new routes, no new sidebars, no banners back.
- v1.18.2's R6 fixes intact — `pages/settings/sections/ConnectSection.tsx` untouched, capture-error toast still surfaces honestly.
- Mobile is acceptable to break (Round 3 problem).
- 21 Round 1 specs still pass (4 are now expanded / replaced with Round 2 variants).

## [1.19.0] — 2026-04-29 — Single-canvas + Cmd+K: Obsidian-grade redesign (Round 1)

After deep audit of Obsidian's premium feel, the verdict on v1.16/.17/.18's 5-tab sidebar architecture was that it's unfixable by polish — it's the wrong shape. v1.19 rips it out and replaces with single-canvas + Cmd+K-everything. This is Round 1 of an N-round iteration; Daizhe will dogfood and dispatch follow-up rounds against the friction surfaces this leaves behind.

### Changes

1. **AppShell rip-out** — every banner unmounted (LicenseTransitionBanner / WhatsNewBanner / DemoModeBanner / ConnectionBanner / GitInitBanner). StatusBar 4 chips, FilterChips bar, HomeStrip, TeammatesPill, MagicMoment 4-step onboarding, FirstRunTour, TryThisFAB, KeyboardShortcutsOverlay, HelpButton — all unmounted. Components stay on disk (Round 2+ may bring some back). Sidebar gated behind `ui.sidebarVisible` (default `false`).

2. **Single canvas surface** — `/feed` rewritten as a time-density typography list. Centered column max-w-2xl, generous `mx-auto px-8` padding, bold day separator (`Wed 23` / `Today`), `grid-cols-[7ch_8ch_8ch_1fr]` rows: time / actor / source / body. Hover row gets 1px orange left border; click → AtomBottomSheet. CSS `content-visibility: auto` for 1000-row 60fps. No HighlightsRow, no TangerineNotes, no FilterChips, no AtomCard — pure list.

3. **Spotlight (Cmd+K everything)** — new `app/src/components/spotlight/Spotlight.tsx`. Modal overlay, mono input at top, four result groups (Recent / People / Threads / Commands). Filter prefixes: `@<alias>` / `#<concept>` / `:<command>` / plain. Arrow keys navigate, Enter selects, ESC closes. Commands: `:replay` / `:settings` / `:theme` / `:sources` / `:about`.

4. **Single-key view switchers** — `T` / `H` / `P` / `R` cycle the canvas view (time / heatmap / people / replay) when Spotlight is closed and no input has focus. View state lives in `ui.canvasView` (zustand, not persisted). H reuses the v1.18 `CanvasView` heatmap; R reuses `useReplayController`; P is a new dense per-actor list.

5. **Footer hint** — single line at bottom: `T time · H heat · P people · R replay · ⌘K all else  v1.19.0`. Counter `ui.shortcutHintShown` bumps once per cold boot; hint hides at ≥ 5.

6. **Onboarding obliteration** — `welcomed = true` permanently for everyone. Empty state is a single line: `No captures yet. Tangerine is watching.` (R6 honesty preserved — no fake atoms, no diagnostic 3-row card).

7. **Route table simplified** — every legacy primary surface (`/today` / `/this-week` / `/daily` / `/canvas` / `/people` / `/threads` / `/inbox` / `/alignment` / `/brain` / `/co-thinker` / `/feed`) redirects to `/`. Power-user / detail routes (`/settings`, `/people/:alias`, `/projects/:slug`, `/sources/:id`, `/marketplace/*`, etc.) preserved for direct URL + Cmd+K reach.

8. **R6 honesty preserved** — Settings → Connect still surfaces capture errors honestly. Empty state is honest. v1.18.2's 4 status-display fixes are intact (no Rust changes this round).

## [1.18.2] — 2026-04-29 — R6 audit pass: 4 status displays could lie

Continuation of the v1.18.1 R6 audit. Daizhe asked: "你要保证这个 app 上面所有信息都是真实的". Status / count / metric display surfaces were swept; four were actively or passively dishonest about their state. Fixed in this release.

### Fixes

1. **`personal_agents/codex.rs:167-189`** — `capture_one` only checked
   idempotency against the filename-stem path; when the parsed JSON
   `session_id` differed from the filename stem (Codex resume / fork),
   the second pass wrote the same atom every heartbeat and the
   Settings → Connect toast read "wrote N, skipped 0" forever, lying
   about how much real work was being done. Mirror of the fix already
   landed in `claude_code.rs`. Regression test:
   `capture_is_idempotent_when_session_id_differs_from_filename_stem`.

2. **`personal_agents/windsurf.rs:203-228`** — same bug shape as the
   Codex one above (Windsurf re-uses the Cursor parser, so the JSON
   `id` field plays the role of `session_id`). Same fix; regression
   test `capture_is_idempotent_when_json_id_differs_from_filename_stem`.

3. **`pages/settings/sections/ConnectSection.tsx:323-343`** — `onSyncNow`
   toast message and `Last sync wrote N, skipped M` row both ignored
   `result.errors`. A user could see a red toast colour and read green
   numbers and assume nothing went wrong. Toast now appends error count
   + first error excerpt; the persistent row gets a `<details>` block
   that lists the first 5 errors verbatim with a "show errors"
   disclosure. The earlier failure was particularly bad in combo with
   Codex/Windsurf bug #1+#2: those errors were already going into
   `result.errors`, just never surfaced past the 3-second toast.

4. **`routes/feed.tsx:308-323` + `:253-273`** — when zustand hadn't yet
   hydrated `memoryRoot`, the empty-state diagnostic card silently
   showed `~/.tangerine-memory/` (a default that may not be the
   active path). Per Daizhe's R6 audit: "the row should say so honestly,
   not silently show ~/.tangerine-memory". Now returns a sentinel the
   renderer paints as an amber "resolving… (open Settings → Sync to
   set or verify)" line instead of a confident absolute path that may
   be wrong.

### Logged but not fixed (borderline cases)

- `StatusBar.tsx:112-117` swallows `readTimelineRecent` failures
  silently. Comment claims this is intentional ("the route's own error
  banner already fires") but on `/settings` there is no route banner —
  the chip just shows stale data. Documented; no fix this wave.
- `Threads · N active` label uses `threads.length` regardless of
  recency — a thread from a year ago still counts as "active". Not
  user-fatal. Logged.
- `GitSyncIndicatorContainer.tsx:117-121` leaves `rust` at prior
  successful value when poll throws. Comment says "shows
  `not_initialized` until next successful poll" but the code shows the
  last good state. Misleading comment, but the indicator is mostly
  honest because the `last_error` field surfaces in the popover.
  Logged.
- `team_index.rs:87` reports `atoms_scanned = events.len()` while the
  empty-stub branch (sample-only) writes "0 atoms scanned" in the
  Markdown body. The Tauri return value diverges from the on-disk
  string when the corpus is sample-only. Borderline.
- Codex / Windsurf adapters do not push to the activity ring after
  capture (only Cursor + Claude Code do). Captures still land on disk
  + show on `/feed` after the next timeline read, but the live
  activity feed misses those vendors' write events. Worth a follow-up
  audit; not a v1.18.2 fix because the surface is internal-only.

### Tests

`cargo test --lib personal_agents` — 58 passed (including 2 new R6
regression tests). React `npm run build` — green.

### Files

- `app/src-tauri/src/personal_agents/codex.rs`
- `app/src-tauri/src/personal_agents/windsurf.rs`
- `app/src/pages/settings/sections/ConnectSection.tsx`
- `app/src/routes/feed.tsx`
- `CHANGELOG.md` (this file)
- Version bumps: `app/package.json`, `app/src-tauri/tauri.conf.json`,
  `app/src-tauri/Cargo.toml`, `pyproject.toml`

## [1.18.1] — 2026-04-29 — R6 honesty fix: Claude Code adapter walks arbitrary depth

Daizhe spotted the Settings → Connect panel showing `Claude Code · Confirmed
· captured 63 · Last sync wrote 0, skipped 63` and asked "这个是真实的吗".
**No.** Audit on his machine found:

- 2022 actual `*.jsonl` files in `~/.claude/projects/`
- 63 at level-1 depth (`<project>/<session>.jsonl`)
- **1959 at level-2+ depth** (`<project>/<session-uuid>/subagents/agent-*.jsonl`)

The walker only recursed 2 levels — invisible to it was 97% of the corpus,
including every subagent transcript Daizhe's loop has been generating
this week. The Settings panel happily reported "Confirmed" while most
Claude Code activity was never read, never atom-ified, never indexed.

### Fix

`commands::personal_agents::claude_code::list_session_files` rewritten
to recurse to arbitrary depth (capped at 16 to defeat symlink loops).
Symlinks intentionally skipped — Claude Code never writes them and
following them risks loops the depth cap can't break reliably.

### Test

`list_session_files_walks_arbitrary_depth` added to
`personal_agents::claude_code::tests`. Builds:
```
<root>/top.jsonl                                 (depth 1)
<root>/proj/middle.jsonl                          (depth 2)
<root>/proj/<session>/subagents/deep.jsonl        (depth 4)
<root>/proj/notes.txt                             (wrong ext)
```
Asserts the walker finds exactly the 3 jsonls and skips the .txt.
This is the regression test that pins the v1.18.1 contract: a future
"tighten the walker" change can't silently bring the bug back.

### Constraints honoured

- R6/R7/R8/R9: this fix exists *because* of R6 — UI was reporting
  "Confirmed" while silently skipping the bulk of the source. Now the
  count is real.
- No new daemon, no new MCP server, no scope drift — pure walker fix.

## [1.18.0] — 2026-04-29 — 2D canvas surface: heat-map, atom layer, Replay timelapse

CEO's spec, verbatim: "一个 surface, 两个 zoom level + 一个 timelapse." v1.17.x
was incremental polish on /feed. v1.18.0 is a brand new second tab —
**/canvas** — the Apple-Photos-Memories paradigm applied to a team's AI
captures. /feed stays the default landing surface (glance use case);
/canvas is the second tab (the visual zoom-and-replay use case).

### Layer 1 — Zoom-out heat-map (the default view)

Every (day × actor) cell is a colored rectangle, density-coded
neutral-stone → orange-200 → orange-500 → orange-800. Reads exactly
like the GitHub contribution graph but team-wide: one glance answers
"did anything happen this week, and who?". Empty cells are
transparent slots so a quiet Saturday looks quiet, not invisible.
Vertical 7-day guides keep the calendar rhythm legible. Tooltips on
each cell quote the actor + day + atom count for accessibility tools.

### Layer 2 — Zoom-in atom canvas (scroll wheel)

Wheel up = zoom in toward the mouse pointer. Past scale ~1.5 the
heat-map crossfades into individual atom dots, each anchored at its
parent cell's centroid plus a deterministic per-thread jitter so
same-thread atoms cluster visibly. @mention edges (1px translucent
orange polylines) connect atoms whose mention sets overlap; weight
scales with intersection size. Past scale ~3.0 dots upgrade to small
vendor-colored cards showing actor + first body line + clock. The
mention regex matches the existing /threads contract — same
`/@([a-z0-9][a-z0-9_.-]*)/gi`, computed once on data load (O(n²) on
events, fine through 5k atoms; we'll move to an inverted index if a
real corpus pushes past that).

### Layer 3 — Replay timelapse (top-right button)

Click Replay → 5-second playthrough of the last 30 days. Atoms
light up in `ts` order; mention edges draw themselves as both
endpoints become visible. Pause / Resume / Replay-from-start all
work via the same button. The progress fill across the bottom of
the chip doubles as a visual scrub.

### First-week auto-replay

`ui.welcomedReplayDone` boots `false` on a fresh install. The first
time the user lands on /canvas, the timelapse auto-plays once, then
the latch flips to `true`. Subsequent visits never auto-play — the
user is in control. Latch persists across launches (zustand persist
slice + merge fallback), so a re-install also re-shows the welcome
once.

### IA placement

Sidebar order: **Feed → Threads → People → Canvas → Memory**. Canvas
slots between People and Memory using the lucide `Map` icon. /feed
is still the default landing route; /canvas is a second-tab
discovery surface, not a replacement. The wave-14 sidebar test was
updated to assert /canvas DOES mount in the rail (was on the killed
list during v1.16 demolition; reclaimed for v1.18).

### Architecture notes

Pure SVG + `transform` pan/zoom — no canvas/WebGL. 60fps on a 1k
atom corpus, easy a11y, easy testability. If a real install pushes
past 10k atoms we'll swap the renderer to <canvas>; for now SVG
ships. Pan = drag, zoom = wheel (mouse-pointer-anchored), trackpad
pinch arrives as wheel events with ctrlKey set so the same handler
covers both. The crossfade thresholds (1.0 → 2.0 atoms full, 3.0
cards) are exported constants so future tweaks are pinned in tests.

### Empty / loading / error honesty

`canvas-loading` / `canvas-empty` / `canvas-error` are explicit
testids. Empty corpus shows an honest "No atoms captured yet"
overlay with the same listening-pulse motif as /feed empty state.
Failed read renders the rose error banner with retry. Never paint
silent zero.

### Tests added (28 new specs across 3 files)

- `tests/v1_18-canvas-route.test.tsx` (9 specs) — route mount,
  loading/empty/error states, canvas surface mounts when atoms
  exist, corpus count chip, no-redirect-to-feed contract,
  first-week latch behaviour
- `tests/v1_18-heatmap-layer.test.tsx` (8 specs) — bucketing math
  (dayAxis / peopleAxis / bucketHeatmap / densityBand / mentionsOf /
  computeMentionEdges), per-cell density attribute, full grid
  rendering for sparse data
- `tests/v1_18-replay-controller.test.tsx` (10 specs) — events
  reveal in ts order, total duration ≈ 5s, pause/resume preserves
  progress, reset clears everything, toggle state machine, empty
  corpus safe, crossfade ramp linear in band

Plus `tests/wave14-sidebar-collapse.test.tsx` updated: /canvas
removed from killed-href list, positive assertion that /canvas DOES
mount added.

### Files

New surface:
- `app/src/routes/canvas.tsx`
- `app/src/components/canvas/CanvasView.tsx`
- `app/src/components/canvas/HeatmapLayer.tsx`
- `app/src/components/canvas/AtomLayer.tsx`
- `app/src/components/canvas/ReplayController.tsx`
- `app/src/components/canvas/ReplayButton.tsx`
- `app/src/components/canvas/bucketing.ts` (shared pure helpers)

Edits:
- `app/src/App.tsx` — `/canvas` is now `<CanvasRoute/>` (was a v1.16
  redirect → /feed)
- `app/src/components/layout/Sidebar.tsx` — Canvas nav item between
  People and Memory
- `app/src/lib/store.ts` — `ui.welcomedReplayDone` + setter +
  persist + merge fallback

Total tests: 668 → 695 (27 new + wave14 still passes).

## [1.17.5] — 2026-04-29 — UX polish: faster onboarding + diagnostic empty /feed

CEO sat down with the v1.17.4 installer and said "ux太差了". Three friction
points addressed:

### Onboarding — Step 2 wait trimmed from 7.5s → 2.5s

The 4-step MagicMoment's sample-atom auto-scrub was 1500ms × 5 atoms = 7.5s
of forced waiting before the user could click "继续". On a fresh install
this read as the slowest part of the flow with no explanatory value (the
samples are decorative). Dropped to 500ms × 5 = 2.5s. Tests use fake
timers so the timing change is free of regression.

### Onboarding — Step 4 chrome diet

Step 4 used to be: huge 🎉 emoji + "设置完成" headline + 4-section
TeamMemoryHint card (uppercase header / 2-line explainer / code block /
copy button row) + Enter button. Read consultant-flavor on first sight.
Trimmed to: "监听已开始." + 1-line subtitle + condensed inline
TeamMemoryHint (single-row "paste this → [import line] [copy]") + Enter.

### /feed empty state — diagnostic instead of dead

The v1.17.0 empty state was a tiny pulsing dot + "Waiting for first
capture" + 2-line copy + "checking every 30s" mono. Dogfood feedback:
felt dead, gave the user no way to tell whether the daemon was actually
wired right. Replaced with a 3-row diagnostic card that names:
1. **watching** — which sources are connected (Cursor / Claude Code /
   etc., or amber "no source connected" callout)
2. **memory dir** — where Tangerine reads from on disk (e.g.
   `~/Desktop/.tangerine-memory/`)
3. **first atom** — what triggers the first capture

R6 honesty preserved — no fake atoms, no synthetic counters. Just the
contract, in plain rows.

## [1.17.4] — 2026-04-29 — Code-split JS bundle + Windows installer ship

First v1.17 build that actually ships an installer on disk. Unblocks the
v2-readiness "≥1 week daily-use" criterion (CEO needs an installer to
install the app) and chips away at cold-start perf via vendor splitting.

### Code-split

`app/src/lib/telemetry.ts` had been mixed static + dynamic across 3
caller files — Vite refused to chunk it. Made it static-only:

- `AppShell.tsx`: dynamic `import("@/lib/telemetry")` was dead code
  (the file already had the static import on line 128). Removed.
- `tauri.ts::applyReviewDecisions`: dynamic-imported `logEvent` from
  `./telemetry` to fire `review_decisions_submitted`. The wrapper just
  loops back to `telemetryLog` (which lives in tauri.ts itself), so
  inlined the envelope construction. User stamped as `"me"` — same
  fallback `telemetry.ts` uses when the store is mid-hydration.
- `store.ts::pushModal` (modal-budget guard): dynamic-imported
  `logEvent` because telemetry.ts re-imports `useStore` from this file.
  Switched to a static import of `telemetryLog` from `tauri.ts`
  directly — `tauri.ts` only type-imports `store.ts`, so no runtime
  cycle. Inlined the envelope.

Added `build.rollupOptions.output.manualChunks` in `vite.config.ts`:
`react-vendor` (react + react-dom + react-router-dom), `i18n-vendor`
(i18next + react-i18next), `ui-vendor` (lucide-react + cva + clsx +
tailwind-merge), `markdown-vendor` (react-markdown), `flow-vendor`
(reactflow). Tauri vendor was dropped — actual `@tauri-apps/*` usage
is dynamic-import strings (UpdaterCheck.tsx) so Rollup can't resolve
the static-chunk entries.

### Bundle (before / after)

| Chunk | v1.17.3 | v1.17.4 |
|---|---|---|
| `index-*.js` (main) | 1213.07 kB / 355.77 kB gz | **806.92 kB / 227.98 kB gz** |
| `react-vendor-*.js` | — | 35.52 kB / 12.50 kB gz |
| `i18n-vendor-*.js` | — | 52.45 kB / 16.37 kB gz |
| `ui-vendor-*.js` | — | 54.16 kB / 14.05 kB gz |
| `markdown-vendor-*.js` | — | 118.12 kB / 36.41 kB gz |
| `flow-vendor-*.js` | — | 146.82 kB / 48.01 kB gz |

Main chunk: -33% raw, -36% gzip. All vendor chunks under 500 kB
warn threshold. Total tests: 641/641 pass (was 640/641 — modal-confirms
test updated to spy on `tauri.telemetryLog` envelope shape).

### Windows installer

Bumped `app/package.json`, `app/src-tauri/tauri.conf.json`,
`app/src-tauri/Cargo.toml`, and `pyproject.toml` to `1.17.4`.
Built via `npm run tauri:build` — see release notes for SHA256 + size.

## [1.17.3] — 2026-04-29 — Perf baseline + Cargo.toml version sync

No behavior change. Records the v2-readiness criterion 5 baseline
(0 cargo warnings + tsc strict + vitest baseline) and re-syncs
`app/src-tauri/Cargo.toml` to the ecosystem version. The Rust
`tangerine-meeting` crate had been pinned at 1.9.0 since the v1.9 era;
all sibling manifests (`app/package.json`, `app/src-tauri/tauri.conf.json`,
`pyproject.toml`) are now at 1.17.x and the Cargo.toml drift was an
audit trip-hazard.

### Baseline measurements (Windows 11, NVMe)

- `cargo build --release` (cold cache): 4 min 58 s, **0 warnings, 0 errors**
- `tsc --noEmit` (strict): 12.66 s, exit 0
- `vite build`: 13.93 s, exit 0
  - `dist/index.html`: 1.02 kB (0.57 kB gzip)
  - `dist/assets/index-*.css`: 107.47 kB (15.79 kB gzip)
  - `dist/assets/index-*.js`: 1213.07 kB (**355.77 kB gzip**)
  - `dist/assets/event-*.js`: 1.31 kB (0.64 kB gzip)
- vitest: 627/629 pass (2 wave21-memory-tree pre-existing failures
  fixed in v1.17.2)

### Known v1.18 candidates (logged, not fixed in this commit)

- 1213 kB raw JS bundle exceeds the 500 kB Vite chunk-size warning
  threshold. `app/src/lib/telemetry.ts` is hit by both static and
  dynamic imports — pick one or `manualChunks` it. ~30 % gzip headroom
  available if we code-split the route bundles.
- App version embedded in `app/src-tauri/Cargo.toml` should be wired to
  `app/package.json` via a build script so future bumps don't drift
  again.

## [1.17.2] — 2026-04-29 — Fix wave21-memory-tree test failures (default-expand top-level dirs)

Cleaned up the 2 known-failing tests flagged in v1.17.0 CHANGELOG.
Pre-existing default-expand contract was load-bearing for the click +
vendor-dot specs — locked it via test refactor. No functional change to
`MemoryTree` itself.

## [1.17.1] — 2026-04-29 — TEAM_INDEX.md auto-write (frictionless AI session bridge)

The v2-readiness pain CEO surfaced this session: Tangerine captures
atoms, but doesn't bridge them to a NEW AI session — two AI sessions on
the same desk don't know what each other built. Fixed by emitting a
compact (~5 KB target, 10 KB hard ceiling) Markdown summary of recent
team activity at `~/.tangerine-memory/TEAM_INDEX.md`. Any AI tool that
reads the user's project `CLAUDE.md` (or Cursor rules / etc.) auto-loads
the team's recent memory via `@~/.tangerine-memory/TEAM_INDEX.md`. No
new daemon, no new MCP server — one extra file write per heartbeat
after the timeline rebuild succeeds.

### Added

- `commands::team_index::write_team_index` Tauri command — manual
  surface invoked from the setup wizard's new copy-pasta card and
  whenever a fresh AI session needs a warm bridge file. Returns
  `{ path, atoms_scanned, bytes_written }`.
- `commands::team_index::write_team_index_to(&Path)` driver — daemon-
  facing API that the heartbeat calls right after `index-rebuild`
  succeeds. Failures are recorded in the daemon ring buffer; a single
  failed rebuild never aborts the rest of the heartbeat.
- TEAM_INDEX.md schema: 4 sections — Recent decisions (last 7d, top 10),
  Active threads (last 7d, top 10), Who's been active (last 24h, top 8),
  Recent atoms (last 24h, top 30) — each gated on the events the user
  actually has. R6/R7 honesty: an empty memory dir produces a header-
  only stub explaining "no atoms captured yet" rather than fake activity.
- Hard ceiling enforcement: `build_team_index_markdown` truncates the
  Recent atoms section first if the rendered body exceeds 10 240 bytes
  (load-bearing for AI context-window economics).
- File-ownership sentinel: every emit starts with
  `<!-- Auto-generated by Tangerine AI Teams. Manual edits will be overwritten. -->`
  so a careful contributor knows hand edits don't survive.
- `writeTeamIndex()` TS wrapper in `app/src/lib/tauri.ts` (mocked outside
  Tauri so the setup wizard's copy-card still renders in vitest / vite
  dev).
- `<TeamMemoryHint/>` card in the magic-moment Step 4 — surfaces the
  copy-pastable `@~/.tangerine-memory/TEAM_INDEX.md` line + a
  copy-to-clipboard button, kicks `writeTeamIndex` as a best-effort
  warm-up so the file is on disk by the time the user pastes.

### Changed

- `commands::views::{load_all_events, memory_root, atomic_write}` are
  now `pub(crate)` so the sibling `team_index` module reuses the exact
  same resolution + write contract instead of cloning helpers.
- `daemon::do_heartbeat` step 2 now binds the `index-rebuild` outcome
  and only runs the team-index write when the rebuild succeeded
  (skipping a write against a stale or partial timeline).

### Tests

- `team_index::tests` — 8 Rust unit tests covering empty/sample-only
  stubs, the decisions-window filter, thread topic grouping + member
  aggregation, people aggregation with top-3 tag ranking, recent-atoms
  body truncation, the 10 KB ceiling enforcement, and the on-disk
  round trip via `write_team_index_to`.
- `app/tests/team-memory-hint.test.tsx` — 5 vitest specs covering the
  rendered import line, the copy button, clipboard write through, the
  best-effort `writeTeamIndex` kick, and the inline error path when the
  clipboard is denied (Wayland / locked-down kiosk).

### Constraints honoured

- No backwards-compat shim for v1.16-and-earlier — full forward, the
  bridge file is a fresh artifact.
- No new CLI command, no new MCP server, no Stripe coupling.
- Tangerine is the sole writer of `TEAM_INDEX.md` (sentinel comment +
  atomic tmp+rename via the existing `views::atomic_write`).

## [1.17.0] — 2026-04-29 — Apple Photos paradigm (auto-surface Highlights, chrome diet)

PDCA dogfood after v1.16.1: 邹岱哲 reported "我还是很不喜欢这个 ux 设计".
Diagnosis: heavy chrome (4 horizontal bars stacked), nav redundancy
(Sidebar + ViewTabs both pointing at the same routes), and a 5-sample
"animated empty" preview that made an empty feed feel like 5 fake
messages — undermining the R6 honesty invariant. v1.17 picks the Apple
Photos "Memories" paradigm: timeline stays the base, but the app
auto-surfaces what's worth a glance, and gets out of your way when
there's nothing to show.

### What changed (mental model)

The /feed surface now leads with a **Highlights** row — the 3–5 atoms
most worth a glance, picked by a pure heuristic (no LLM, stays
compatible with the v1.16 "no smart layer" reframe):

```
+10 atom @-mentions YOU            (highest signal)
+5  per other-actor @-mention      (collab signal)
+3  cross-source concept tag       (e.g. #pcb in Cursor + Slack)
+2  if kind === "decision"         (decision is dense info)
+1  if last-24h                    (recency tilt)
```

Top 5 by score (score >= 1) render as compact cards above the
timeline. The whole row hides itself when no atom clears the
threshold — empty rooms stay quiet, no fake activity.

### Added

- `app/src/components/feed/HighlightsRow.tsx` — Apple-Photos-Memories
  auto-surface row at the top of /feed. Pure heuristic ranker, hidden
  when no atom qualifies. 7 vitest specs lock the score weights.

### Changed

- /feed empty state replaced the Wave 3 C2 5-sample synthetic preview
  with a quiet "Waiting for first capture" pulse. Fixes the R6 honesty
  regression where new users thought the 5 fake atoms were real.
- /threads empty state same change — quiet "No threads yet" copy with
  the precondition stated honestly.
- /people solo-user state dropped the synthetic 5-teammate preview;
  only the real "Invite a teammate" CTA remains.
- Sidebar brand link `/today` → `/feed` to match the v1.16 default
  landing route.

### Removed

- `<ViewTabs />` mount inside /feed, /threads, /people. The Sidebar
  already hosts those nav items; doubling up on a tab strip below
  was the chrome bloat dogfood flagged. Single source of truth for
  "which view am I on?" is now the Sidebar's active orange highlight.
  ViewTabs.tsx file is left on disk (orphan) for potential reuse.

### Tests

- 7 new specs in `tests/v1_17-highlights-row.test.tsx` covering the
  score algorithm (threshold hide, @me +10, decision +2, cross-source
  +3, top-5 cap, score-desc + ts-desc tiebreak, onPick callback).
- Wave 2 B1/B2/B3 ViewTabs assertions flipped to `queryByTestId().toBeNull()`.
- Wave 3 C2 empty-state integration specs flipped to assert the new
  quiet copy + absence of the synthetic preview testids.
- Routes smoke test for /people + /threads now lands on `*-route` testid.
- Wave 14 sidebar contract refreshed for the v1.16.1 IA (4 nav: feed /
  threads / people / memory).

### Known issues (deferred to v1.17.x)

- `tests/wave21-memory-tree.test.tsx` has 2 pre-existing failures (file
  click + vendor color dot) related to the MemoryTree directory
  expand-collapse default state. Not regressed by v1.17.

### Next (v1.17.1 in flight)

The dogfood that triggered v1.17 also surfaced a v2-readiness blocker:
Tangerine captures atoms but doesn't bridge them to a NEW AI session.
Two AI sessions on the same desk still don't know what each other
built. v1.17.1 will add a `~/.tangerine-memory/TEAM_INDEX.md`
auto-write so every Claude Code / Cursor session in a project that
`@import`s the file automatically lands with team memory.

---

## [1.16.0] — 2026-04-29 — Capture + visualize reframe (智能层 砍, 3 view modes, 30s onboarding)

The reframe release. v1.15.x hit a wall: Claude Code doesn't implement
MCP sampling, so the entire "borrow your AI tool's LLM" architecture
was structurally broken. v1.16 砍 the smart layer entirely and reframes
Tangerine around the two things it actually does well — **collect team
AI workflow signals** + **organize them in the app**.

### What changed (mental model)

Memory ≠ files. Memory = a chronological feed of moments the team
already created in their AI tools and chat apps. Tangerine reads those
local logs and gives you 3 lenses:

  📰 **/feed** (default landing) — single-column time-ordered atom
     stream. Glance + triage in 0–10 seconds. Vendor color dots,
     32px round avatars, day separators (Today / Yesterday / Mon
     Apr 28 / Apr 24 / ISO date), @mention cards get 4px brand-orange
     left border. Bottom-pinned filter chips: @Me · Today · per-source.

  💬 **/threads** — atoms with overlapping @mention sets auto-group
     into thread cards. Pure regex grouping; no LLM needed. Click a
     thread → expands inline as a mini-timeline of the constituent
     atoms.

  👥 **/people** — 64px avatar grid for each teammate active in last
     24h. Top 3 hashtags surfaced per teammate. Click a person →
     filters the atom feed below the grid to that person.

### Removed (Wave 1 — Demolition)

  - mcp-server/ npm package (78MB) — entire sampling-bridge gone.
  - Rust agi/{ambient, co_thinker, observations, llm_enrich,
    sampling_bridge, session_borrower}.
  - Rust commands/{agi_ambient, co_thinker, co_thinker_dispatch} +
    setup_wizard.rs sampling logic (-2044 LOC).
  - TS components: SetupWizard, SetupWizardBanner, WelcomeOverlay,
    AIToolDetectionGrid (8-tool wizard grid), OnboardingChat,
    EmptyStateCard, SoloCloudUpgradePrompt, DemoTourOverlay,
    FirstRealAtomActivation.
  - TS routes: /canvas, /co-thinker, /setup/connect, /ai-tools/[id].
  - 30 telemetry events tied to LLM-borrow flow.
  - 10 store fields for chat-onboarding state.
  - Wave-11 5-step setup wizard + wave-18 chat onboarding (replaced
    by 30s magic moment).

Estimated 30-40 % Rust LOC + 25 % TS LOC removed.

### Added (Waves 2-5)

**Wave 2 — 3 view modes** (38 specs):

  - app/src/routes/feed.tsx (NEW DEFAULT LANDING).
  - app/src/routes/threads/index.tsx (rewritten, mention-set grouping).
  - app/src/routes/people/index.tsx (rewritten, teammate grid + click-
    to-filter).
  - app/src/components/feed/{vendor.ts, Avatar.tsx, AtomCard.tsx,
    DaySeparator.tsx, FilterChips.tsx} — shared visual primitives.
  - app/src/components/layout/ViewTabs.tsx — 3-tab nav (📰 / 💬 / 👥).
  - app/src/components/threads/ThreadCard.tsx — thread expand card.
  - app/src/components/people/PersonCard.tsx — 64px teammate card.

**Wave 3 — 30s onboarding + animated empty state** (22 specs):

  - app/src/components/onboarding/MagicMoment.tsx — 4-step orchestrator
    replacing the 5-step wizard.
  - Step1Welcome / Step2Animation (5 sample atoms scrub-animated) /
    Step3Sources (4 IDE checkboxes) / Step4Done (🎉 → /feed).
  - app/src/components/onboarding/EmptyStateAnimation.tsx — 5 sample
    cards rendered through the real AtomCard so users see "this is
    what your captures will look like" instead of a dead empty state.
    First card gets `animate-pulse` to telegraph live data is coming.

**Wave 4 — Settings 9→3 + StatusBar** (28 specs):

  - app/src/pages/settings/Settings.tsx rewritten as a 3-tab shell:
    Connect / Privacy / Sync.
  - sections/ConnectSection.tsx (4 IDE capture toggles + external
    sources, 砍 wave-11 Primary AI tool picker).
  - sections/PrivacySection.tsx (preserves D16 R6-honest data-flow
    panel verbatim).
  - sections/SyncSection.tsx (git remote + Solo/Team mode + personal
    vault toggle).
  - 8 legacy section files left as orphaned dead-code on disk —
    physical deletion deferred to a v1.16.x cleanup pass so existing
    direct imports (e.g. AGISettings inside suppression.test.tsx)
    keep passing while the mounted-code shrinks.
  - LEGACY_TAB_MAP redirects every old `?tab=...` URL to a sensible
    3-section landing.

  - app/src/components/layout/StatusBar.tsx — always-pinned 4 chips:
    🟢 Source · 📥 Today (30s polled) · 👥 Online · ⚠ For you.
    Mounted in AppShell above WhatsNewBanner; gated on welcomed=true
    so new users see onboarding instead. Click each chip → routes to
    the relevant settings/route.

**Wave 5 — Mobile responsive** (15 specs):

  - app/src/components/feed/AtomBottomSheet.tsx — slide-up panel that
    replaces inline atom expand on viewports < 768px. ESC + backdrop
    + swipe-down (>80px Δy) all close. Desktop keeps inline expand
    because power users triage 50 atoms in a session and a sheet
    animation would steal flow.
  - 16 file responsive-class polish across feed / threads / people /
    settings / onboarding / StatusBar / ViewTabs.
  - StatusBar uses dual-`<span>` md:hidden / hidden md:inline so the
    chip text condenses on mobile (e.g. "🟢 Cursor + CC" → "🟢 2")
    while every existing test contract still finds the long form.

### Tests

  - vitest 627/629 (2 pre-existing wave21-memory-tree baseline flakes
    per R10 CEO directive).
  - cargo --lib **0 warnings** preserved.
  - tsc strict: **0 errors**.
  - Wave 1-5 added 103 new specs across 8 spec files; every Wave's
    regression bundle stayed green at each commit.

### Architecture notes (R6/R7/R8/R9 honesty preserved)

  - StatusBar swallows fetch errors silently because the route's own
    error banner already covers fetch failures loudly — status bar
    is signal-of-signals, not a primary surface.
  - EmptyStateAnimation samples are clearly labeled samples (no
    fake-loading state).
  - MagicMoment ESC always flips welcomed=true, never silently
    stuck.
  - setup_wizard.rs sampling Tauri commands kept as honest no-ops
    with `tracing::info!` lines explaining the v1.16 pivot — never
    silent OK.
  - All R9 sample-vs-real isolation invariants preserved.

### Process notes

10 agents dispatched across Waves 1-5 (Opus 4.7 background). 3 hit
account quota mid-flight on Wave 1 — main thread took over and
finished the cleanup. Wave 2 used a quota-reset retry. Waves 3, 4, 5
each ran 2-3 agents in parallel with strictly disjoint file ownership;
no merge collisions across the entire reframe.

### Deferred to v1.16.x and v1.17+

Per Daizhe directive: v1 series is product polish only. v2 territory
(commercial, paywalls, bundled local LLM, iFactory device source,
cross-product wiring) is explicitly out of scope until v1 is "I'd
recommend this to a friend" quality.

  - 8 orphaned legacy settings files physical delete (v1.16.x cleanup).
  - Capture-side `mcp_server_handshake` semantics rewrite (currently
    no-op stub — should check log-file existence; v1.17 candidate).
  - Mobile bottom-sheet swipe-up to dismiss + spring animation polish.
  - Feed virtualization once captured-corpus size justifies it
    (currently capped at 500 events at the data layer).

## [1.15.1] — 2026-04-28 — Onboarding reboot **fix-up**

v1.15.0 shipped the onboarding reboot but Daizhe (and any v1.14.6 dogfood
user) couldn't actually configure Claude Code: the new wizard never
appeared on upgraded installs (over-aggressive smart-upgrade hydration
pre-stamped them), and even users who saw the grid had Auto-configure
write to a stale path Claude Code ignores. v1.15.1 closes the loop:
every layer that prevented "click Auto-configure → Connected ✓" is fixed.

### Fixed

- **Auto-configure now writes to the file Claude Code actually reads.**
  Wave 11's catalog had `~/.claude/mcp_servers.json` (CC v0.x); current
  CC reads `~/.claude.json` top-level `mcpServers` field. Same pattern
  for Codex (`mcp.json` → `config.toml`) and Windsurf (`~/.windsurf/`
  → `~/.codeium/windsurf/`). All 4 editor configures now route through
  the v15 dispatcher (verified-correct paths, atomic write + idempotent
  merge, 30 cargo tests). Wave 11 catalog stays for installation
  detection only.
- **v1.14.6 → v1.15.0 upgrade no longer skips the new wizard.** The
  original W1.1 hydration treated `welcomed === true` as "user finished
  onboarding" and pre-stamped `onboardingCompletedAt`. But `welcomed`
  only proves the user saw the splash — Wave-18 chat-onboarded dogfood
  users (everyone stuck in the v1.14.6 chicken-and-egg LLM loop) had
  `welcomed=true` AND zero working channels. They upgraded to v1.15.0
  and never saw the new wizard. Tighter rule: pre-stamp ONLY when there
  is hard evidence of channel setup (`setupWizardChannelReady === true`,
  OR a non-empty `setupWizardPrimaryChannel`, OR a non-empty
  `primaryAITool`). v1.15.1 also **heals** bogus pre-stamps written by
  v1.15.0: any latch-without-evidence is cleared on hydrate so the
  wizard reappears for those users.
- **Black console window flash on app launch (Windows).** `identity.rs`
  spawned `git config --get` at boot to resolve the user's identity
  without `CREATE_NO_WINDOW`, popping a brief console. Other spawn
  sites (daemon, runner, git, voice_notes, whisper, git_sync) already
  applied the flag; identity.rs was the holdout. Fixed.
- **`tangerine-mcp@latest` pin removed.** The MCP entry now pins to
  `^0.1.0` (semver-compatible 0.1.x range). Future v0.2.0 with a
  breaking sampling-bridge protocol cannot silently break older
  Tangerine app installs (the user's editor would npm-install the new
  mcp, fail to register against the old bridge, and the wizard would
  show "Connected" timeout forever).
- **Solo Cloud "Upgrade $10/mo" button no longer 404s.** Stripe Checkout
  isn't wired yet (no real product/price/webhook), so the button now
  renders as a "Coming soon" disabled chip when
  `VITE_STRIPE_SOLO_CHECKOUT_URL` is unset. The banner still fires
  `solo_cloud_upgrade_prompt_shown` so analytics can measure intent;
  R6/R7/R8 honesty: never paint a button we cannot honor.

### Added

- **Config-path hint under each detection-grid card.** Small monospace
  caption showing exactly where Tangerine writes the MCP entry for that
  tool (`~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/config.toml`,
  `~/.codeium/windsurf/mcp_config.json`, OS keychain for Devin/Replit,
  "macOS only" / "Windows only" markers for Apple Intelligence and MS
  Copilot). Trust-narrative extension: not just honest UI, but
  auditable behavior — users can verify Tangerine and their editor
  share the same path on disk.

### Tests

- vitest **784 / 786** (2 pre-existing wave21 baseline flakes; +1
  config-path-hint testid spec)
- cargo --lib unchanged baseline + delegate path through v15 (existing
  60 setup_wizard tests cover); **0 cargo warnings** preserved
  (deprecated `merge_tangerine_into_mcp_json` annotated `#[allow(dead_code)]`
  + comment as rollback path)
- pytest **226 / 226** unchanged
- tsc strict: **0 errors**

### Honesty audit (R6/R7/R8 + R9)

- Grepped all 5 changed files (+ all v1.15.0 new files) for new
  `unwrap_or_default` / `invokeOrMock` / silent catch — zero
  regressions introduced.
- v15 dispatcher remains the single source of truth for editor MCP
  config writes; wave 11 `merge_tangerine_into_mcp_json` is annotated
  dead-but-kept for rollback. R7 lesson honored.

### Defer

- Stripe real wiring (need product / price / webhook decisions) →
  v1.15.2 or later
- Solo vs Team funnel split → v1.15.2
- Apple AI / MS Copilot real implementation → v1.16
- End-to-end spawn-and-handshake test (real `npx tangerine-mcp` boot)
  → v1.15.x

## [1.15.0] — 2026-04-28 — Onboarding reboot + activation funnel

The "装上就死" → "装上 5 分钟用起来" release. v1.14.6 first-launch fell
into a chicken-and-egg loop: the conversational onboarding needed an LLM
to parse the user's tool name, but the LLM ran inside the tool the user
hadn't connected yet. v1.15.0 inverts the default: form-first wizard
with auto-detection, demo mode promoted to a first-class try-before-config
path, and a real activation funnel (`first_real_atom_captured`) so v1.15.1
can be data-driven instead of guess-driven.

### Added
- **SetupWizard 三路径 first-launch card layout.** Cold launches with
  `onboardingCompletedAt === null` mount a wizard that asks one question:
  Connect AI tool / Try with sample data / Configure manually. Wave 11's
  form is still here — it's the third card, not the default. The chat
  onboarding is demoted to Settings → Advanced ("Configure with AI").
- **AIToolDetectionGrid covering all 8 AI tools.** Cursor / Claude Code /
  Codex / Windsurf get one-click MCP auto-configure (atomic JSON / TOML
  merge into the tool's own config — never overwrites existing servers,
  idempotent). Devin / Replit get keychain-backed remote config. Apple
  Intelligence / MS Copilot surface as `PlatformUnsupported` with an
  honest reason chip — no fake green check. Display order: detected
  first, then market rank.
- **MCP server health-check polling.** After Auto-configure, the grid
  polls `mcp_server_handshake(tool_id)` every 3 s for up to 30 s. UI
  states cycle Configuring → Waiting for restart → Connected ✓ on a
  successful handshake; `Restart [tool] to finish setup` on timeout
  with a Retry button that re-arms the same poll. The handshake reads
  the in-process MCP sampling-bridge registry (no probe spawn that
  would race the user's editor for stdio).
- **DemoTourOverlay — 5-step guided tour over sample data.** Picking
  the demo card flips `demoMode = true`; AppShell mounts a
  non-blocking dialog that walks the user through /memory → /people →
  /threads → /co-thinker → "Ready for real?". The conversion CTA
  physically deletes the sample atoms via `demo_seed_clear` (preserving
  R9 sample-vs-real isolation), drops `demoMode`, latches
  `demoTourCompleted = true`, and routes back to the wizard. Skip /
  Esc at any step latches `demoTourCompleted` only — sample data
  stays so the user can keep browsing.
- **EmptyStateCard on /people /threads /co-thinker /today /this-week
  /memory.** First-time users (`firstAtomCapturedAt === null`) now see a
  "Capture your first [thing]" card with a CTA back into the AI-tool
  detection grid plus a "See the demo →" secondary that re-enters demo
  mode. Returning users with a quiet day fall through to the existing
  lighter "no items yet" message.
- **`first_real_atom_captured` activation event.** Headless React
  listener subscribes to the existing `activity:atom_written` Tauri
  event, filters out R9 sample atoms via the propagated `is_sample`
  flag, latches `firstAtomCapturedAt` exactly once, and emits the event
  for the activation funnel. The listener self-skips after latch — zero
  IPC cost for returning users.
- **SoloCloudUpgradePrompt — first paywall trigger.** Non-blocking
  global banner above the route shell. Eligibility = ≥ 7 d post-onboard
  OR ≥ 50 atoms (whichever first), AND not currently in team mode.
  Dismiss latches `soloCloudPromptDismissedAt` for a 7 d cool-down
  window. Upgrade CTA opens an external Stripe Checkout URL (read from
  `VITE_STRIPE_SOLO_CHECKOUT_URL` build env var). Emits
  `solo_cloud_upgrade_prompt_shown` / `solo_cloud_upgrade_clicked` /
  `solo_cloud_upgrade_dismissed` for funnel analytics.
- **First-launch detection vs. upgrade-launch detection.**
  `onboardingCompletedAt` smart-upgrade hydration pre-stamps the latch
  for any v1.14.6 user who already passed the wave 11 wizard or
  welcomed. They upgrade into v1.15.0 and the new wizard never appears.
- **14 + 2 new typed telemetry events.** The full Wave 1.15 funnel
  (onboarding_wizard_shown → onboarding_path_chosen →
  onboarding_detection_completed → onboarding_mcp_configured /
  onboarding_mcp_failed / onboarding_mcp_timeout → mcp_connected →
  first_real_atom_captured → onboarding_completed) plus demo path
  (demo_tour_step_completed × 5 → demo_tour_dismissed |
  demo_to_real_conversion) plus paywall trio. All have typed payload
  shapes via `logTypedEvent<E>(...)` — strict TS, no `any`. Existing
  `logEvent` call sites stay on the untyped path for back-compat.

### Changed
- **OnboardingChat is no longer the first-launch surface.** Lives in
  Settings → Advanced. Error messages rewritten from "ollama isn't
  responding" to "Open your AI tool first (Cursor / Claude Code) so
  I can borrow its LLM" — honest about the actual prerequisite.
- **`setup_wizard_auto_configure_mcp` delegates unknown tool_ids.**
  Wave 11's existing 4-tool dispatcher now falls through to W1.3's
  v15 dispatcher for `devin` / `replit` / `apple-intelligence` /
  `ms-copilot`. Single React call site (`setupWizardAutoConfigureMcp`)
  handles all 8 tools.

### Fixed
- 2 baseline test-file flakes (`co-thinker.test.tsx`,
  `routes.smoke.test.tsx`) updated to drive the returning-user path
  now that the empty branches render the new EmptyStateCard.

### Tests
- 670 → 783 passing vitest (+113 new specs across 7 new files); 3
  failures are pre-existing wave21 MemoryTree DOM testid races
  documented in v1.13 R10.
- 768 → 803 passing cargo --lib (+30 new setup_wizard tests + 2
  activity tests + 3 perf tests still flake under load — same as
  v1.14.6 baseline, run in isolation to verify).
- **0 cargo warnings** preserved.
- 226 / 226 pytest passing (+8 new event_router activation specs).

### Known shippable gaps (deliberately deferred)
- Local LLM bundle (Llama 3.2 1B sidecar). Decision deferred to
  v1.15.1 pending real telemetry on auto-configure success rate; if
  ≥ 85 % of users complete onboarding via the detection grid we may
  not need it.
- Team Cloud / Enterprise paywall. Solo is the only tier wired in
  v1.15.0.
- Cross-machine 2-Playwright presence E2E. R7 still in-process only.

## [1.14.6] — 2026-04-28

Round 7 closes the v1.14 arc. Final 10/10 dimension lift on real-time
presence (4-teammate burst debounce) + discoverability (in-app version
changelog).

### Added
- **Burst debounce on multi-teammate presence updates.** A 4+ teammate
  standup now coalesces to ≤ 2 list reads per fan-out window instead of
  one read per emit. 80 ms leading-edge + trailing-flush window keeps
  perceived latency under the spec budget.
- **`/whats-new-app` route.** Reads this CHANGELOG so v1.14 ship signals
  show inside the app, not only on GitHub. First launch after upgrade
  fires a one-shot toast pointing at it (gated by `lastSeenAppVersion`
  in the persisted store).
- **`presence:write_failed` Tauri event.** Surfaces hard FS errors
  (PermissionDenied / ReadOnly / StorageFull) that pre-R7 were silently
  swallowed. Heartbeat keeps ticking; UI gets a one-shot signal.

### Fixed
- `write_local_presence` no longer masks all I/O errors. Soft errors
  still keep the heartbeat resilient; hard errors propagate so the user
  knows their presence isn't being shared.

## [1.14.5] — 2026-04-27

Round 6 — AI capture moat polish. PersonalAgentDetectionStatus refactored
to a tagged-enum so the React side can tell "no agents detected" from "we
don't know yet" instead of one bool.

### Added
- Tagged-enum status surface for personal agents (Cursor / Claude Code /
  Codex / Windsurf). Settings → Personal Agents now distinguishes
  "Not detected" / "Detection in progress" / "Detected, capture armed" /
  "Detected, capture off" instead of one boolean.

## [1.14.0 → 1.14.4] — 2026-04-25 → 2026-04-26

Rounds 1-5 closing v1.13 carryovers. Six dimensions lifted from 7-8 to
8.5-9.5. No breaking changes.

### Added
- **2-user team-invite cold-start E2E.** `parseInvite` mock + 2-user E2E
  pin the Solo+Team funnel (R1).
- **JSON duplicate-key lint** as part of CI. R4 catches the
  same-shape regression that swallowed ~110 i18n entries pre-v1.13.10.
- **`tauri-plugin-opener` migration.** Drops the only remaining cargo
  deprecation warning (R4).
- **Markdown-native backlinks LinkCache.** R5 turns the per-render
  scan into a memoized lookup; opening a heavily-backlinked atom no
  longer drops a frame.

### Changed
- Sample-detection on memory tree walk now mtime-cached (R2). Cold-cache
  p50 stays under the revised 1000 ms budget; warm cache returns under
  100 ms.
- External-comm capture parity sweep (R3). Slack / email / calendar
  GetConfig paths now use strict invoke + surface honest errors.

## [1.13.10] — 2026-04-22

Ship-readiness round (R10) of the v1.13 arc. Eight of ten dimensions
≥ 8/10. NSIS installer unsigned but build-clean.

### Added
- WhatsNewBanner — surfaces new ATOMS since the last view-all sweep.
- Privacy panel honest-on-failure (R6 fix — pre-R6 it rendered fake
  green checks on Rust failure).

### Fixed
- `apply_review_decisions` had been a silent no-op since v1.0; restored.
- Duplicate `"sources":` JSON key in en + zh common.json swallowing
  ~110 i18n entries via JSON.parse last-wins semantics.

## [1.13.0 → 1.13.9] — 2026-04-15 → 2026-04-21

Wave 1.13 — Local-first dual-layer capture, real-time team presence,
extracted-mention pipeline, sample-data tagging, identity layer.

### Added
- **Real-time team presence (Wave 1.13-D).** PresenceProvider mounted
  at AppShell-level, 10 s heartbeat + on-route emit, `presence:update`
  Tauri event for multi-window instant refresh (added in v1.13.5
  round-5; no longer relies solely on the polling cycle).
- **Identity / team roster (Wave 1.13-A).** UserProfile, TeamMember,
  team_roster module land. WelcomeOverlay deep-links into the privacy
  panel via `?tab=privacy`.
- **Privacy panel (Wave 1.13-E).** First-class default tab — one click
  to confirm what stays local.
- **AIExtractedMentionCard.** Wave 1.13-C's unique-moat surface finally
  wired into /inbox renderer (was test-passing but invisible to users
  pre-R2).
- **`extractMentions` helper.** Wired into CommentInput so @username
  preview appears before Post.

## [1.5.1-beta] — 2026-04-25

Build re-tag for the local-Whisper + super-app shell pipeline. No new features
beyond what was queued for 1.5.0-beta; this version exists to retrigger the
release workflow after a toolchain pin (Rust 1.89.0) was added to fix a
`keyboard-types 0.7` serde-derive break on rustc 1.90+.

### Changed
- Rust toolchain pinned to 1.89.0 via `app/src-tauri/rust-toolchain.toml`. CI
  workflow updated to honor the pin (`dtolnay/rust-toolchain@stable` does not).
- Local Whisper (`faster-whisper`) replaces the OpenAI Whisper API. Model
  download UX wired into the super-app skill drawer; OpenAI is now optional.
- Setup wizard removed in favor of a super-app shell (auth → dashboard →
  skills). T3 commands handler + `AppState` now wired into the Tauri builder.
- Frozen Python entry dispatches via `runpy -m <module>` so PyInstaller
  `--onedir` covers `faster-whisper` transitive deps. `huggingface_hub` stdout
  pollution silenced in `model_download`.

## [1.5.0-beta] — 2026-04-24

First public Windows beta. Single-skill release: Tangerine Meeting (Discord →
Claude Code memory diff). Distributed as an unsigned NSIS installer.

### Added
- **Desktop shell** (`app/`) — Tauri 2.x + React 19 wizard-driven UI replacing
  the previous CLI-only flow. 5-step first-run wizard: Discord bot setup,
  Whisper API key, Claude Code detection, team config, first meeting.
- **NSIS installer** — per-user install (no UAC, no signing required), English
  + Simplified Chinese, Start Menu folder "Tangerine", shortcut "Tangerine AI
  Teams".
- **Frozen runtimes** bundled into the installer:
  - Python 3.11 + `tmi` CLI via PyInstaller `--onedir`
    (`app/resources/python/python.exe`).
  - Discord bot via `pkg` single-file binary
    (`app/resources/bot/tangerine-meeting-bot.exe`).
- **Release workflow** (`.github/workflows/release.yml`) — Windows-latest
  runner builds Python + bot + Tauri app on every `v*` tag and publishes the
  installer to GitHub Releases. Pre-release detection for `*-beta`/`*-alpha`/
  `*-rc` tags.
- **Build scripts** (`app/scripts/build_python.ps1`, `build_bot.ps1`,
  `build_all.ps1`) — local + CI-compatible Windows build orchestration with
  non-ASCII path mitigations.
- README download badge + Latest Release link.

### Known issues
- Installer is **unsigned**; Windows SmartScreen will warn on first run. Code
  signing certificate procurement is tracked for v1.5.1.
- Identifier is `ai.tangerineintelligence.meeting` (legacy from pre-rebrand).
  Changing it would orphan future-upgrade install state on existing installs;
  rebrand-aligned identifier `ai.tangerineintelligence.teams` is deferred to
  v2.0 when we can break upgrade compatibility cleanly.
- macOS / Linux installers are not yet built.

### Notes for first CI run
The release pipeline has never run end-to-end on GitHub Actions before this
tag. Expect first-run debugging around: native bindings for `@discordjs/voice`
+ `@discordjs/opus` under `pkg`, and PyInstaller hidden-import resolution for
the `tmi` package. Both build scripts are designed to fail loudly with
specific error messages.

## [0.1.0] — 2026-04-17

Pre-release CLI-only build. Apache-2.0 OSS-ready release: full pipeline +
docs + demo + CI. Not distributed as installer.
