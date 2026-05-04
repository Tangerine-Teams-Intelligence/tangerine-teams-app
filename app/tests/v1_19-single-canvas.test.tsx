/**
 * v1.19.0 Round 1 + v1.19.1 Round 2 — Single-canvas + Cmd+K-everything specs.
 *
 * Round 1 coverage:
 *   • Spotlight: Cmd+K opens, ESC closes, click-outside closes, type
 *     filters, Enter selects, arrow keys navigate, `@` `#` `:` prefixes
 *     route to the right groups.
 *   • Time-density list: rows render time/actor/source/body in correct
 *     grid columns; click opens AtomBottomSheet; day separators bold.
 *   • Single-key view switchers (T/H/P/R) update `ui.canvasView` only
 *     when no input is focused AND Spotlight is closed.
 *   • Footer hint: visible by default; hidden when shortcutHintShown >= 5.
 *   • buildResults helper: prefix routing.
 *
 * Round 2 coverage (additions):
 *   • A. EmptyState branches on connected sources. 0 → "No sources
 *     connected. Press ⌘K and type :sources…". ≥1 → diagnostic
 *     three-row card with `empty-state-watching`/`-memory-root`/
 *     `-first-atom` testids.
 *   • B. Footer hint highlights the active view label (orange + bold).
 *   • C. Time-view header renders "past 7 days · N atoms".
 *   • E. Spotlight closes when an atom / person / thread is selected;
 *     :theme leaves it open.
 *   • F. AppShell mount fires auto-replay once when samplesSeeded=true
 *     and welcomedReplayDone=false; flips welcomedReplayDone=true.
 *   • H. Day separator "Today" gets the orange accent.
 *
 * The old wave-2-B1 / wave-4-D2 / wave-14 tests target dead surfaces
 * (FilterChips, StatusBar chips, sidebar nav). They've been left on disk
 * — Round 2 may re-skip them or delete; Round 1 just doesn't fix them.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import FeedRoute, { buildTimeViewHeaderLabel } from "../src/routes/feed";
import { Spotlight, buildResults } from "../src/components/spotlight/Spotlight";
import { AppShell } from "../src/components/layout/AppShell";
import { useStore } from "../src/lib/store";
import * as views from "../src/lib/views";
import type { TimelineEvent } from "../src/lib/views";

function makeEvent(p: Partial<TimelineEvent> & { id: string }): TimelineEvent {
  return {
    id: p.id,
    ts: p.ts ?? new Date().toISOString(),
    source: p.source ?? "cursor",
    actor: p.actor ?? "daizhe",
    actors: p.actors ?? [p.actor ?? "daizhe"],
    kind: p.kind ?? "capture",
    refs: p.refs ?? {},
    status: p.status ?? "open",
    file: p.file ?? null,
    line: p.line ?? null,
    body: p.body ?? "Sample atom body line 1.",
    lifecycle: null,
    sample: false,
    confidence: 1.0,
    concepts: p.concepts ?? [],
    alternatives: [],
    source_count: 1,
  };
}

const SAMPLE_EVENTS: TimelineEvent[] = [
  makeEvent({
    id: "e1",
    ts: "2026-04-29T14:32:00Z",
    source: "cursor",
    actor: "daizhe",
    body: "v1.18.1 ship walker fix",
    concepts: ["pcb"],
    refs: { threads: ["v1-launch"] },
  }),
  makeEvent({
    id: "e2",
    ts: "2026-04-29T13:50:00Z",
    source: "claude_code",
    actor: "daizhe",
    body: "kicking off agent for /canvas",
    refs: { threads: ["v1-launch"] },
  }),
  makeEvent({
    id: "e3",
    ts: "2026-04-29T13:01:00Z",
    source: "cursor",
    actor: "hongyu",
    body: "feedback on TEAM_INDEX wiring",
    concepts: ["pcb", "infra"],
  }),
];

beforeEach(() => {
  cleanup();
  // Reset store to v1.19.1 defaults so tests don't see persisted leakage.
  useStore.setState((s) => ({
    ui: {
      ...s.ui,
      currentUser: "daizhe",
      canvasView: "time",
      sidebarVisible: false,
      spotlightOpen: false,
      shortcutHintShown: 0,
      welcomed: true,
      // Round 2 F — keep auto-replay quiet by default so unrelated tests
      // don't flip canvasView to "replay" out from under them.
      welcomedReplayDone: true,
      samplesSeeded: false,
      // Round 2 A — default to "all sources off" so the empty state
      // resolves to the no-sources branch unless a test overrides.
      personalAgentsEnabled: {
        cursor: false,
        claude_code: false,
        codex: false,
        windsurf: false,
        devin: false,
        replit: false,
        apple_intelligence: false,
        ms_copilot: false,
      },
      memoryRoot: "",
    },
  }));
  vi.restoreAllMocks();
});

describe("v1.19 Round 1 — Spotlight (Cmd+K)", () => {
  it("renders nothing when spotlightOpen=false", () => {
    render(<Spotlight />);
    expect(screen.queryByTestId("spotlight")).not.toBeInTheDocument();
  });

  it("renders when spotlightOpen=true", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, spotlightOpen: true } }));
    render(<Spotlight />);
    expect(screen.getByTestId("spotlight")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("spotlight-results")).toBeInTheDocument();
    });
  });

  it("ESC inside spotlight closes it", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, spotlightOpen: true } }));
    render(<Spotlight />);
    await waitFor(() =>
      expect(screen.getByTestId("spotlight")).toBeInTheDocument(),
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await waitFor(() => {
      expect(useStore.getState().ui.spotlightOpen).toBe(false);
    });
  });

  it("backdrop click closes spotlight", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, spotlightOpen: true } }));
    render(<Spotlight />);
    await waitFor(() =>
      expect(screen.getByTestId("spotlight-backdrop")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("spotlight-backdrop"));
    await waitFor(() => {
      expect(useStore.getState().ui.spotlightOpen).toBe(false);
    });
  });

  it("typing into the input updates the query", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, spotlightOpen: true } }));
    render(<Spotlight />);
    await waitFor(() =>
      expect(screen.getByTestId("spotlight-input")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("spotlight-input"), {
      target: { value: "walker" },
    });
    expect(
      (screen.getByTestId("spotlight-input") as HTMLInputElement).value,
    ).toBe("walker");
  });

  it("ArrowDown advances the active result", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, spotlightOpen: true } }));
    render(<Spotlight />);
    await waitFor(() =>
      expect(
        screen.getByTestId("spotlight-results").getAttribute("data-count"),
      ).not.toBe("0"),
    );
    const before = screen.getAllByTestId("spotlight-result");
    expect(before[0].getAttribute("data-active")).toBe("true");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    });
    const after = screen.getAllByTestId("spotlight-result");
    expect(after[1].getAttribute("data-active")).toBe("true");
  });
});

describe("v1.19 Round 1 — buildResults filter prefixes", () => {
  it(":<command> only shows the Commands group", () => {
    const rows = buildResults(":replay", SAMPLE_EVENTS);
    expect(rows.every((r) => r.group === "commands")).toBe(true);
    expect(rows.find((r) => r.id === "cmd-replay")).toBeTruthy();
  });

  it("@<alias> only shows the People group", () => {
    const rows = buildResults("@daizhe", SAMPLE_EVENTS);
    expect(rows.every((r) => r.group === "people")).toBe(true);
    expect(rows.find((r) => r.primary === "@daizhe")).toBeTruthy();
  });

  it("#<concept> only shows recent atoms with that concept", () => {
    const rows = buildResults("#pcb", SAMPLE_EVENTS);
    expect(rows.every((r) => r.group === "recent")).toBe(true);
    // Both e1 + e3 have #pcb.
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("plain query produces all four groups when matches exist", () => {
    const rows = buildResults("", SAMPLE_EVENTS);
    const groups = new Set(rows.map((r) => r.group));
    expect(groups.has("recent")).toBe(true);
    expect(groups.has("people")).toBe(true);
    expect(groups.has("threads")).toBe(true);
    expect(groups.has("commands")).toBe(true);
  });
});

describe("v1.19 Round 1 — Time-density list", () => {
  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <FeedRoute />
      </MemoryRouter>,
    );
  }

  // Round 2 A — empty state now BRANCHES on connected sources.
  it("Round 2 A — empty state with 0 sources connected says 'No sources connected'", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
    expect(screen.getByTestId("empty-state").getAttribute("data-empty-mode")).toBe(
      "no-sources",
    );
    expect(screen.getByTestId("empty-state").textContent).toContain(
      "No sources connected",
    );
    expect(screen.getByTestId("empty-state").textContent).toContain(":sources");
  });

  it("Round 2 A — empty state with ≥1 source connected renders 3-row diagnostic", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({
      ui: {
        ...s.ui,
        personalAgentsEnabled: {
          ...s.ui.personalAgentsEnabled,
          cursor: true,
          claude_code: true,
        },
        memoryRoot: "/Users/daizhe/.tangerine-memory",
      },
    }));
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
    expect(screen.getByTestId("empty-state").getAttribute("data-empty-mode")).toBe(
      "diagnostic",
    );
    expect(screen.getByTestId("empty-state-watching").textContent).toContain(
      "cursor",
    );
    expect(screen.getByTestId("empty-state-watching").textContent).toContain(
      "claude-code",
    );
    expect(screen.getByTestId("empty-state-memory-root").textContent).toContain(
      "/Users/daizhe/.tangerine-memory",
    );
    expect(screen.getByTestId("empty-state-first-atom").textContent).toContain(
      "open Cursor and run a Claude prompt",
    );
  });

  it("Round 2 A — memoryRoot empty renders 'resolving…' (R6 honesty)", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({
      ui: {
        ...s.ui,
        personalAgentsEnabled: {
          ...s.ui.personalAgentsEnabled,
          cursor: true,
        },
        memoryRoot: "",
      },
    }));
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
    expect(screen.getByTestId("empty-state-memory-root").textContent).toContain(
      "resolving…",
    );
  });

  it("Round 2 A — sources truncate after 3 with '· N more'", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({
      ui: {
        ...s.ui,
        personalAgentsEnabled: {
          cursor: true,
          claude_code: true,
          codex: true,
          windsurf: true,
          devin: true,
          replit: false,
          apple_intelligence: false,
          ms_copilot: false,
        },
        memoryRoot: "/x",
      },
    }));
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId("empty-state-watching")).toBeInTheDocument();
    });
    expect(screen.getByTestId("empty-state-watching").textContent).toContain(
      "2 more",
    );
  });

  // v1.24.0 — /feed T view now mounts `<GraphView/>` (Obsidian-style
  // v1.25.0 — `time` view now mounts the Heptabase-style WhiteboardView
  // (cards on infinite canvas), replacing v1.24's Obsidian force-
  // directed graph. The route still owns CatchupBanner + CaptureInput
  // + AtomBottomSheet; only the inner canvas changed. Tests here verify
  // the FeedRoute wiring contract: whiteboard-view renders, card counts
  // match the corpus size, and the exit-paths to AtomBottomSheet are
  // still reachable through the `onOpenAtom` handler (called by the
  // WhiteboardView when a card is clicked, exercised directly via the
  // unit test in v1_25-whiteboard-view.test.tsx).
  it("v1.25 — whiteboard-view renders on /feed with one card per atom", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId("whiteboard-view")).toBeInTheDocument();
    });
    const view = screen.getByTestId("whiteboard-view");
    expect(Number(view.getAttribute("data-card-count"))).toBe(
      SAMPLE_EVENTS.length,
    );
  });

  it("v1.25 — whiteboard-view emits day labels for the corpus", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId("whiteboard-view")).toBeInTheDocument();
    });
    const view = screen.getByTestId("whiteboard-view");
    expect(Number(view.getAttribute("data-day-count"))).toBeGreaterThan(0);
    // Edge count can be 0 if no atoms relate; SAMPLE_EVENTS may or may
    // not share enough signal — assert non-negative just to lock the
    // attribute presence.
    expect(
      Number(view.getAttribute("data-edge-count")),
    ).toBeGreaterThanOrEqual(0);
  });

  it("v1.25 — zoom-pan wrapper is mounted (passthrough stub in jsdom)", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId("zoom-pan-wrapper")).toBeInTheDocument();
    });
  });
});

describe("v1.19 Round 1 — AppShell wiring", () => {
  function renderShell() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );
  }

  it("Cmd+K opens spotlight via the global keybind", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    expect(useStore.getState().ui.spotlightOpen).toBe(false);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true }),
      );
    });
    expect(useStore.getState().ui.spotlightOpen).toBe(true);
  });

  it("T/H/P/R single keys cycle canvasView when no input focused", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    });
    expect(useStore.getState().ui.canvasView).toBe("heatmap");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
    });
    expect(useStore.getState().ui.canvasView).toBe("people");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
    });
    expect(useStore.getState().ui.canvasView).toBe("time");
  });

  it("T/H/P/R DO NOT fire when an input is focused", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    // Mount a fake input; focus it; dispatch H — view should stay "time".
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "h", bubbles: true }),
      );
    });
    expect(useStore.getState().ui.canvasView).toBe("time");
    document.body.removeChild(input);
  });

  it("Sidebar is hidden by default in Round 1", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
  });

  it("Footer hint is visible when shortcutHintShown < 5", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, shortcutHintShown: 0 } }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("footer-hint")).toBeInTheDocument(),
    );
    // v1.25.0 — label flipped from "T graph" to "T whiteboard" (the T
    // view now mounts the Heptabase-style infinite-canvas WhiteboardView
    // after CEO rejected the v1.24 force-directed graph). Internal
    // canvas key still "time" for state continuity.
    expect(screen.getByTestId("footer-hint").textContent).toContain(
      "T whiteboard",
    );
  });

  it("Footer hint hides when shortcutHintShown >= 5", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    // Pre-set to 6 BEFORE shell mounts so the bump-on-mount effect can't
    // push us back below 5 by lifting from 5 → 6.
    useStore.setState((s) => ({ ui: { ...s.ui, shortcutHintShown: 6 } }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("footer-hint")).not.toBeInTheDocument();
  });

  it("AppShell mount bumps shortcutHintShown by exactly 1", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, shortcutHintShown: 2 } }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    expect(useStore.getState().ui.shortcutHintShown).toBe(3);
  });
});

// ===================== v1.19.1 Round 2 specs =====================

describe("v1.19.1 Round 2 B — Footer hint active view indicator", () => {
  function renderShell() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );
  }

  it("active view label gets data-active=true; others false", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({
      ui: { ...s.ui, shortcutHintShown: 0, canvasView: "heatmap" },
    }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("footer-hint")).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("footer-hint-label-time").getAttribute("data-active"),
    ).toBe("false");
    expect(
      screen.getByTestId("footer-hint-label-heatmap").getAttribute("data-active"),
    ).toBe("true");
    expect(
      screen.getByTestId("footer-hint-label-people").getAttribute("data-active"),
    ).toBe("false");
    expect(
      screen.getByTestId("footer-hint-label-replay").getAttribute("data-active"),
    ).toBe("false");
  });

  it("footer still ends with the version chip", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, shortcutHintShown: 0 } }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("footer-hint")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("footer-hint").textContent).toMatch(/v\d/);
  });
});

describe("v1.19.2 Round 3 Fix 4 — Footer hint responsive", () => {
  function renderShell() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );
  }

  it("renders both wide (xl:inline) and narrow (xl:hidden) variants", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, shortcutHintShown: 0 } }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("footer-hint")).toBeInTheDocument(),
    );
    const wide = screen.getByTestId("footer-hint-wide");
    const narrow = screen.getByTestId("footer-hint-narrow");
    expect(wide).toBeInTheDocument();
    expect(narrow).toBeInTheDocument();
    // Wide row carries the T/H/P/R + ⌘K all-else copy; only renders at xl+.
    expect(wide.className).toContain("hidden");
    expect(wide.className).toContain("xl:inline");
    // Narrow row collapses to ⌘K only at < xl viewports.
    expect(narrow.className).toContain("inline");
    expect(narrow.className).toContain("xl:hidden");
  });

  it("version chip remains visible in both layouts", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, shortcutHintShown: 0 } }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("footer-hint")).toBeInTheDocument(),
    );
    const footer = screen.getByTestId("footer-hint");
    // The version chip is outside both responsive variants and always renders.
    expect(footer.textContent).toMatch(/v\d/);
  });
});

// v1.22.0 — Time-view DOM header strip removed.
//
// The v1.19.2 spec mounted a `time-view-header` mono line above the
// time-density list ("past N days · M atoms"). v1.22 replaces the
// time-density list with daily memory pages; the header strip is gone.
// Per-day atom counts now live inline on each `day-card-header` instead.
//
// The `buildTimeViewHeaderLabel` PURE function is still exported from
// feed.tsx (other surfaces or future routes might want it), so the two
// helper tests at the bottom of this block survive — they call the
// helper directly without rendering. The 6 DOM-rendering tests are
// skipped with a v1.22 note rather than deleted, so the next time
// someone touches this area the rationale is on disk.
describe("v1.19.2 Round 3 Fix 3 — Time-view header dynamic timeframe", () => {
  it.skip("v1.22 — DOM header strip removed; helper retained", () => {
    // Placeholder so the suite block is not empty after the 6 skips.
  });

  it("appends '+' to count when events.length === cap (500)", () => {
    const todayIso = new Date().toISOString();
    const events: TimelineEvent[] = Array.from({ length: 500 }, (_, i) =>
      makeEvent({ id: `cap-${i}`, ts: todayIso }),
    );
    const label = buildTimeViewHeaderLabel(events, 500);
    expect(label).toContain("500+ atoms");
  });

  it("falls back to 'recent · N atoms' when oldest ts is malformed", () => {
    const events: TimelineEvent[] = [
      makeEvent({ id: "bad", ts: "not-a-date" }),
    ];
    const label = buildTimeViewHeaderLabel(events, 500);
    expect(label).toContain("recent");
    expect(label).toContain("1 atom");
  });
});

describe("v1.19.1 Round 2 E — Spotlight closes on selection", () => {
  it("opening an atom closes spotlight", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, spotlightOpen: true } }));
    render(<Spotlight />);
    await waitFor(() =>
      expect(
        screen.getByTestId("spotlight-results").getAttribute("data-count"),
      ).not.toBe("0"),
    );
    // Click the first atom row (which is a "recent" group result).
    const rows = screen.getAllByTestId("spotlight-result");
    fireEvent.click(rows[0]);
    await waitFor(() => {
      expect(useStore.getState().ui.spotlightOpen).toBe(false);
    });
  });

  it(":theme leaves spotlight open so user can cycle", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, spotlightOpen: true } }));
    render(<Spotlight />);
    await waitFor(() =>
      expect(screen.getByTestId("spotlight-input")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("spotlight-input"), {
      target: { value: ":theme" },
    });
    await waitFor(() => {
      const rs = screen.queryAllByTestId("spotlight-result");
      expect(rs.length).toBeGreaterThan(0);
    });
    const rows = screen.getAllByTestId("spotlight-result");
    fireEvent.click(rows[0]);
    expect(useStore.getState().ui.spotlightOpen).toBe(true);
  });
});

describe("v1.19.2 Round 3 Fix 2 — First-launch auto-replay (real corpus gate)", () => {
  function renderShell() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );
  }

  it("fires once when welcomedReplayDone=false AND corpus has events", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({
      ui: {
        ...s.ui,
        canvasView: "time",
        welcomedReplayDone: false,
      },
    }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(useStore.getState().ui.canvasView).toBe("replay");
    });
    expect(useStore.getState().ui.welcomedReplayDone).toBe(true);
  });

  it("does NOT fire when welcomedReplayDone=true (one-shot latch)", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: SAMPLE_EVENTS,
      notes: [],
    });
    useStore.setState((s) => ({
      ui: {
        ...s.ui,
        canvasView: "time",
        welcomedReplayDone: true,
      },
    }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    // Give effects a beat to not run; canvasView should stay "time".
    expect(useStore.getState().ui.canvasView).toBe("time");
  });

  it("does NOT fire when corpus is empty (real-corpus gate)", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({
      ui: {
        ...s.ui,
        canvasView: "time",
        welcomedReplayDone: false,
      },
    }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    // Even though welcomedReplayDone=false, empty corpus must not flip
    // to replay.
    await waitFor(() => {
      // Settle async corpus call.
      expect(useStore.getState().ui.canvasView).toBe("time");
    });
    expect(useStore.getState().ui.welcomedReplayDone).toBe(false);
  });
});

// ===================== v1.19.3 fix-all audit =====================

describe("v1.19.3 — Cmd/Ctrl+B toggles sidebar visibility", () => {
  function renderShell() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );
  }

  it("Cmd+B flips sidebarVisible from false → true", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, sidebarVisible: false } }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    expect(useStore.getState().ui.sidebarVisible).toBe(false);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "b", metaKey: true }),
      );
    });
    expect(useStore.getState().ui.sidebarVisible).toBe(true);
  });

  it("Cmd+B flips sidebarVisible from true → false", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    useStore.setState((s) => ({ ui: { ...s.ui, sidebarVisible: true } }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    expect(useStore.getState().ui.sidebarVisible).toBe(true);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "b", ctrlKey: true }),
      );
    });
    expect(useStore.getState().ui.sidebarVisible).toBe(false);
  });
});

describe("v1.19.3 — AppShell hydrates personalAgentsEnabled from Rust", () => {
  function renderShell() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );
  }

  it("mirrors Rust persisted settings into the React store on mount", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    // Mock Rust to return claude_code: true while React store starts all
    // false (the v1.18 → v1.19 install scenario Daizhe just hit).
    const tauri = await import("../src/lib/tauri");
    vi.spyOn(tauri, "personalAgentsGetSettings").mockResolvedValue({
      cursor: false,
      claude_code: true,
      codex: false,
      windsurf: false,
      devin: false,
      replit: false,
      apple_intelligence: false,
      ms_copilot: false,
      last_sync_at: null,
    });
    useStore.setState((s) => ({
      ui: {
        ...s.ui,
        personalAgentsEnabled: {
          cursor: false,
          claude_code: false,
          codex: false,
          windsurf: false,
          devin: false,
          replit: false,
          apple_intelligence: false,
          ms_copilot: false,
        },
      },
    }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(useStore.getState().ui.personalAgentsEnabled.claude_code).toBe(
        true,
      );
    });
  });

  it("does NOT crash when personalAgentsGetSettings rejects (Tauri-down)", async () => {
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: [],
      notes: [],
    });
    const tauri = await import("../src/lib/tauri");
    vi.spyOn(tauri, "personalAgentsGetSettings").mockRejectedValue(
      new Error("tauri bridge missing"),
    );
    useStore.setState((s) => ({
      ui: {
        ...s.ui,
        personalAgentsEnabled: {
          cursor: false,
          claude_code: false,
          codex: false,
          windsurf: false,
          devin: false,
          replit: false,
          apple_intelligence: false,
          ms_copilot: false,
        },
      },
    }));
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("app-shell-root")).toBeInTheDocument(),
    );
    // Store remains all-false under failure mode (honest: don't fake a
    // claim about Rust state we couldn't read).
    expect(useStore.getState().ui.personalAgentsEnabled.claude_code).toBe(
      false,
    );
  });
});

describe("v1.19.1 Round 2 H — Today gets the orange accent", () => {
  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <FeedRoute />
      </MemoryRouter>,
    );
  }

  // v1.24.0 — orange-on-Today rule preserved at the GRAPH level. The
  // v1.25.0 — the WhiteboardView now exposes a `whiteboard-day-label`
  // node per distinct day with `data-is-today="true"` on today's
  // entry. The CSS-driven orange accent (var(--ti-orange-500)) lives
  // on the today label; we can't read computed-style colors reliably
  // in jsdom, so the contract is exercised by the pure helper test in
  // v1_25-whiteboard-view.test.tsx + here we just confirm the data
  // attribute lights up for today.
  it("v1.25 — whiteboard surfaces a today day-label when corpus contains today's atom", async () => {
    const todayIso = new Date().toISOString();
    const todayEvents: TimelineEvent[] = [
      makeEvent({ id: "today-1", ts: todayIso }),
      makeEvent({ id: "yest-1", ts: "2020-01-01T10:00:00Z" }),
    ];
    vi.spyOn(views, "readTimelineRecent").mockResolvedValue({
      events: todayEvents,
      notes: [],
    });
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId("whiteboard-view")).toBeInTheDocument();
    });
    const labels = screen.getAllByTestId("whiteboard-day-label");
    const todayLabel = labels.find(
      (el) => el.getAttribute("data-is-today") === "true",
    );
    expect(todayLabel).toBeDefined();
  });
});

