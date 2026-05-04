/**
 * v1.25.0 — Heptabase-style whiteboard view specs.
 *
 * Two layers exercised:
 *   1. Pure layout helper (`buildLayout`) — unit tests with no render.
 *      Cover day grouping, actor lane assignment, hero detection, and
 *      edge inference.
 *   2. Render contract — `WhiteboardView` mounted with the global test
 *      setup's `react-zoom-pan-pinch` stub (which just renders children
 *      so jsdom doesn't choke on zoom internals). Verifies card-per-
 *      event, click-out, hover state, and the "T whiteboard" footer
 *      hint label.
 *
 * NB: Empty corpus (events.length === 0) is handled by the caller —
 * FeedRoute mounts EmptyState before WhiteboardView. The "0 events"
 * spec asserts WhiteboardView's *own* behavior: 0 cards, 0 edges, no
 * fake clusters.
 */

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";

import type { TimelineEvent } from "../src/lib/views";
import {
  WhiteboardView,
  buildLayout,
  assignActorLanes,
} from "../src/components/feed/WhiteboardView";

// The global stub in `tests/setup.ts` already mocks
// `react-zoom-pan-pinch` to a passthrough; the layout assertions below
// hit `buildLayout` directly so they don't need the wrapper at all.

function makeEvent(
  p: Partial<TimelineEvent> & { id: string },
): TimelineEvent {
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

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

// ----------------------------------------------------------------------
// 1. Pure layout helper
// ----------------------------------------------------------------------

describe("v1.25 buildLayout — empty handling", () => {
  it("returns empty layout for an empty events array", () => {
    const out = buildLayout([]);
    expect(out.cards).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.dayLabels).toEqual([]);
  });
});

describe("v1.25 buildLayout — cards", () => {
  it("produces one card per event", () => {
    const events = [
      makeEvent({ id: "a" }),
      makeEvent({ id: "b" }),
      makeEvent({ id: "c" }),
    ];
    const out = buildLayout(events);
    expect(out.cards.length).toBe(3);
    expect(out.cards.map((c) => c.event.id).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("groups cards by day on the Y axis (newer day above older day)", () => {
    const todayIso = new Date().toISOString();
    const twoDaysAgoIso = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const events = [
      makeEvent({ id: "old", ts: twoDaysAgoIso }),
      makeEvent({ id: "new", ts: todayIso }),
    ];
    const out = buildLayout(events);
    const newCard = out.cards.find((c) => c.event.id === "new")!;
    const oldCard = out.cards.find((c) => c.event.id === "old")!;
    expect(newCard.y).toBeLessThan(oldCard.y);
  });

  it("groups cards by actor into separate lanes on the X axis", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({ id: "a1", actor: "alice", ts }),
      makeEvent({ id: "a2", actor: "alice", ts }),
      makeEvent({ id: "b1", actor: "bob", ts }),
      makeEvent({ id: "b2", actor: "bob", ts }),
    ];
    const out = buildLayout(events);
    const alice1 = out.cards.find((c) => c.event.id === "a1")!;
    const bob1 = out.cards.find((c) => c.event.id === "b1")!;
    // Different actors → different X lanes.
    expect(alice1.x).not.toBe(bob1.x);
  });

  it("marks the highest-scored atom of the day as the hero", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({ id: "low", body: "no signal", ts }),
      makeEvent({
        id: "high",
        body: "@alice @bob big decision land",
        kind: "decision",
        ts,
      }),
    ];
    const out = buildLayout(events);
    const high = out.cards.find((c) => c.event.id === "high")!;
    const low = out.cards.find((c) => c.event.id === "low")!;
    expect(high.isHero).toBe(true);
    expect(low.isHero).toBe(false);
  });

  it("emits a day label per distinct day with isToday flagged correctly", () => {
    const todayIso = new Date().toISOString();
    const fourDaysAgoIso = new Date(
      Date.now() - 4 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const events = [
      makeEvent({ id: "a", ts: todayIso }),
      makeEvent({ id: "b", ts: fourDaysAgoIso }),
    ];
    const out = buildLayout(events);
    expect(out.dayLabels.length).toBe(2);
    const today = out.dayLabels.find((d) => d.isToday);
    expect(today).toBeDefined();
    expect(today?.label).toBe("Today");
  });
});

describe("v1.25 buildLayout — edges (connection lines)", () => {
  it("draws a mention edge between cards where one body @-mentions the other actor", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        body: "@bob can you look at this",
        ts,
      }),
      makeEvent({
        id: "b",
        actor: "bob",
        body: "looking now",
        ts,
      }),
    ];
    const out = buildLayout(events);
    const mention = out.edges.find(
      (e) =>
        e.kind === "mention" &&
        ((e.fromId === "a" && e.toId === "b") ||
          (e.fromId === "b" && e.toId === "a")),
    );
    expect(mention).toBeDefined();
  });

  it("draws a concept edge between cards sharing a concept", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        concepts: ["pcb", "supplychain"],
        ts,
      }),
      makeEvent({
        id: "b",
        actor: "bob",
        concepts: ["pcb", "pricing"],
        ts,
      }),
    ];
    const out = buildLayout(events);
    const concept = out.edges.find(
      (e) =>
        e.kind === "concept" &&
        ((e.fromId === "a" && e.toId === "b") ||
          (e.fromId === "b" && e.toId === "a")),
    );
    expect(concept).toBeDefined();
  });

  it("draws a thread edge between cards sharing a conversation_id", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        refs: {
          conversation_id: "T9",
        } as unknown as TimelineEvent["refs"],
        ts,
      }),
      makeEvent({
        id: "b",
        actor: "bob",
        refs: {
          conversation_id: "T9",
        } as unknown as TimelineEvent["refs"],
        ts,
      }),
    ];
    const out = buildLayout(events);
    const thread = out.edges.find(
      (e) =>
        e.kind === "thread" &&
        ((e.fromId === "a" && e.toId === "b") ||
          (e.fromId === "b" && e.toId === "a")),
    );
    expect(thread).toBeDefined();
  });

  it("does not draw edges between unrelated cards", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({ id: "a", actor: "alice", body: "morning" }),
      makeEvent({ id: "b", actor: "bob", body: "evening" }),
    ];
    void ts;
    const out = buildLayout(events);
    expect(out.edges.length).toBe(0);
  });
});

describe("v1.25 assignActorLanes", () => {
  it("assigns the heaviest actor to lane 0", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({ id: "a1", actor: "alice", ts }),
      makeEvent({ id: "a2", actor: "alice", ts }),
      makeEvent({ id: "a3", actor: "alice", ts }),
      makeEvent({ id: "b1", actor: "bob", ts }),
    ];
    const lanes = assignActorLanes(events);
    expect(lanes.get("alice")).toBe(0);
    expect(lanes.get("bob")).toBe(1);
  });
});

// ----------------------------------------------------------------------
// 2. Render contract
// ----------------------------------------------------------------------

describe("v1.25 WhiteboardView render contract", () => {
  it("renders one card per event", () => {
    const events = [
      makeEvent({ id: "a", actor: "alice" }),
      makeEvent({ id: "b", actor: "bob" }),
      makeEvent({ id: "c", actor: "carol" }),
    ];
    render(<WhiteboardView events={events} onOpenAtom={() => {}} />);
    const cards = screen.getAllByTestId("whiteboard-card");
    expect(cards.length).toBe(3);
  });

  it("renders 0 cards when given 0 events (caller still owns EmptyState)", () => {
    render(<WhiteboardView events={[]} onOpenAtom={() => {}} />);
    const view = screen.getByTestId("whiteboard-view");
    expect(view.getAttribute("data-card-count")).toBe("0");
    expect(view.getAttribute("data-edge-count")).toBe("0");
  });

  it("hovering a card sets data-hovered on the whiteboard root", () => {
    const events = [
      makeEvent({ id: "a", actor: "alice" }),
      makeEvent({ id: "b", actor: "bob", body: "@alice hi" }),
    ];
    render(<WhiteboardView events={events} onOpenAtom={() => {}} />);
    const view = screen.getByTestId("whiteboard-view");
    expect(view.getAttribute("data-hovered")).toBe("");
    const cards = screen.getAllByTestId("whiteboard-card");
    fireEvent.mouseEnter(cards[0]);
    expect(view.getAttribute("data-hovered")).not.toBe("");
    fireEvent.mouseLeave(cards[0]);
    expect(view.getAttribute("data-hovered")).toBe("");
  });

  it("clicking a card calls onOpenAtom with the underlying event", () => {
    const onOpenAtom = vi.fn();
    const events = [makeEvent({ id: "a", actor: "alice" })];
    render(<WhiteboardView events={events} onOpenAtom={onOpenAtom} />);
    const card = screen.getByTestId("whiteboard-card");
    fireEvent.click(card);
    expect(onOpenAtom).toHaveBeenCalledTimes(1);
    expect(onOpenAtom.mock.calls[0][0].id).toBe("a");
  });

  it("renders a connection line between mention-related cards as an SVG path", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({ id: "a", actor: "alice", body: "@bob ping", ts }),
      makeEvent({ id: "b", actor: "bob", body: "@alice pong", ts }),
    ];
    render(<WhiteboardView events={events} onOpenAtom={() => {}} />);
    // The path test id is `whiteboard-edge-{from}-{to}` — at least one
    // direction renders (a→b or b→a depending on iteration order).
    const edgeAB = screen.queryByTestId("whiteboard-edge-a-b");
    const edgeBA = screen.queryByTestId("whiteboard-edge-b-a");
    expect(edgeAB ?? edgeBA).not.toBeNull();
  });

  it("renders a day label with isToday=true for today's atoms", () => {
    const events = [
      makeEvent({ id: "a", ts: new Date().toISOString() }),
    ];
    render(<WhiteboardView events={events} onOpenAtom={() => {}} />);
    const labels = screen.getAllByTestId("whiteboard-day-label");
    expect(labels.length).toBeGreaterThan(0);
    const todayLabel = labels.find(
      (el) => el.getAttribute("data-is-today") === "true",
    );
    expect(todayLabel).toBeDefined();
    expect(todayLabel?.textContent).toContain("Today");
  });

  it("status footer reports card and edge counts", () => {
    const ts = new Date().toISOString();
    const events = [
      makeEvent({ id: "a", actor: "alice", body: "@bob hi", ts }),
      makeEvent({ id: "b", actor: "bob", ts }),
    ];
    render(<WhiteboardView events={events} onOpenAtom={() => {}} />);
    const status = screen.getByTestId("whiteboard-status");
    expect(status.textContent).toContain("2 cards");
  });

  it("pan/zoom wrapper is mounted (TransformWrapper passthrough)", () => {
    const events = [makeEvent({ id: "a" })];
    render(<WhiteboardView events={events} onOpenAtom={() => {}} />);
    expect(screen.getByTestId("zoom-pan-wrapper")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-pan-content")).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// 3. Footer hint label
// ----------------------------------------------------------------------

describe("v1.25 footer hint label", () => {
  it("shows 'T whiteboard' instead of 'T graph'", async () => {
    // The label text is in AppShell.tsx — read source to assert at the
    // string level. Done as a static assertion so we don't have to
    // mount the full router stack.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const srcPath = path.resolve(
      __dirname,
      "../src/components/layout/AppShell.tsx",
    );
    const src = fs.readFileSync(srcPath, "utf8");
    expect(src).toContain('"T whiteboard"');
    expect(src).not.toMatch(/text:\s*"T graph"/);
  });
});
