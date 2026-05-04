/**
 * v1.24.0 — Obsidian-style force-directed graph view specs.
 *
 * Two layers exercised:
 *   1. Pure helpers (`buildGraph`, `filterToNeighbors`) — unit tests with
 *      no render. Cover edge inference + node construction.
 *   2. Render contract — `GraphView` mounted with a mocked
 *      `react-force-graph-2d` (the real one needs Canvas + ResizeObserver
 *      backing that jsdom doesn't fully give us). The mock surfaces the
 *      `graphData` it receives + the `onNodeClick` / `onNodeHover`
 *      handlers as `data-testid` props so we verify the data flow
 *      without touching Canvas.
 *
 * NB: Empty corpus is handled by the caller (FeedRoute mounts EmptyState
 * before mounting GraphView), so the "events.length === 0" spec asserts
 * GraphView's *own* behavior — it renders 0 nodes/edges and a status
 * line, no fake clusters. The caller-side EmptyState already has its own
 * test in v1_20-audit and earlier.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";

import type { TimelineEvent } from "../src/lib/views";

// ----------------------------------------------------------------------
// Mock react-force-graph-2d before importing GraphView. The mock renders
// the data + click handlers as DOM so the test can poke them.
// ----------------------------------------------------------------------

interface MockForceGraphProps {
  graphData?: { nodes: unknown[]; links: unknown[] };
  onNodeClick?: (node: unknown) => void;
  onNodeHover?: (node: unknown | null) => void;
  onBackgroundClick?: () => void;
  width?: number;
  height?: number;
  children?: ReactNode;
}

vi.mock("react-force-graph-2d", () => {
  const MockGraph = (props: MockForceGraphProps) => {
    const nodes = props.graphData?.nodes ?? [];
    const links = props.graphData?.links ?? [];
    return (
      <div
        data-testid="mock-force-graph"
        data-node-count={nodes.length}
        data-edge-count={links.length}
        data-width={props.width ?? 0}
        data-height={props.height ?? 0}
      >
        {nodes.map((rawNode, idx) => {
          const n = rawNode as { id: string; kind?: string; label?: string };
          return (
            <button
              key={n.id ?? idx}
              type="button"
              data-testid={`mock-node-${n.id}`}
              data-kind={n.kind ?? ""}
              data-label={n.label ?? ""}
              onClick={() => props.onNodeClick?.(rawNode)}
              onMouseEnter={() => props.onNodeHover?.(rawNode)}
              onMouseLeave={() => props.onNodeHover?.(null)}
            >
              {n.label ?? n.id}
            </button>
          );
        })}
        {links.map((rawLink, idx) => {
          const l = rawLink as {
            source: string | { id?: string };
            target: string | { id?: string };
            kind?: string;
            weight?: number;
          };
          const srcId =
            typeof l.source === "string"
              ? l.source
              : (l.source?.id ?? "");
          const tgtId =
            typeof l.target === "string"
              ? l.target
              : (l.target?.id ?? "");
          return (
            <span
              key={`${srcId}-${tgtId}-${idx}`}
              data-testid={`mock-edge-${srcId}-${tgtId}`}
              data-kind={l.kind ?? ""}
              data-weight={l.weight ?? 0}
            />
          );
        })}
        <button
          type="button"
          data-testid="mock-background"
          onClick={() => props.onBackgroundClick?.()}
        >
          background
        </button>
      </div>
    );
  };
  return { default: MockGraph };
});

// ----------------------------------------------------------------------
// Now import GraphView (pulls the mocked dep) + the helpers under test.
// ----------------------------------------------------------------------

import {
  GraphView,
  buildGraph,
  filterToNeighbors,
  type GraphEdge,
  type GraphNode,
} from "../src/components/feed/GraphView";

// ----------------------------------------------------------------------
// Fixture builder — same shape as v1.22 / v1.23.
// ----------------------------------------------------------------------

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
// 1. Pure helper specs — buildGraph
// ----------------------------------------------------------------------

describe("v1.24 buildGraph — node construction", () => {
  it("returns empty nodes/edges for an empty events array", () => {
    const g = buildGraph([], "me");
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it("produces one atom node per event", () => {
    const events = [
      makeEvent({ id: "a", body: "first" }),
      makeEvent({ id: "b", body: "second" }),
      makeEvent({ id: "c", body: "third" }),
    ];
    const g = buildGraph(events, "me");
    const atomNodes = g.nodes.filter((n) => n.kind === "atom");
    expect(atomNodes.length).toBe(3);
    expect(atomNodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("creates a thread node only when ≥2 atoms share a thread key", () => {
    const events = [
      makeEvent({
        id: "a",
        refs: { conversation_id: "T1" } as unknown as TimelineEvent["refs"],
      }),
      makeEvent({
        id: "b",
        refs: { conversation_id: "T1" } as unknown as TimelineEvent["refs"],
      }),
      // Single-atom thread T2 → no thread node, would be noise.
      makeEvent({
        id: "c",
        refs: { conversation_id: "T2" } as unknown as TimelineEvent["refs"],
      }),
    ];
    const g = buildGraph(events, "me");
    const threadNodes = g.nodes.filter((n) => n.kind === "thread");
    expect(threadNodes.length).toBe(1);
    expect(threadNodes[0].id).toBe("thread:t1");
  });

  it("creates a person node only when an actor has ≥2 atoms", () => {
    const events = [
      makeEvent({ id: "a", actor: "alice" }),
      makeEvent({ id: "b", actor: "alice" }),
      makeEvent({ id: "c", actor: "bob" }), // single-atom actor → no person node
    ];
    const g = buildGraph(events, "me");
    const personNodes = g.nodes.filter((n) => n.kind === "person");
    expect(personNodes.length).toBe(1);
    expect(personNodes[0].id).toBe("person:alice");
  });

  it("scales atom node size by score (max-scoring atom is largest)", () => {
    const events = [
      makeEvent({ id: "low", body: "no signal" }),
      makeEvent({ id: "high", body: "@me you should see this" }),
    ];
    const g = buildGraph(events, "me");
    const lowNode = g.nodes.find((n) => n.id === "low") as GraphNode;
    const highNode = g.nodes.find((n) => n.id === "high") as GraphNode;
    expect(highNode.size).toBeGreaterThan(lowNode.size);
  });
});

describe("v1.24 buildGraph — edge inference", () => {
  it("creates a mention edge when atom A's body @-mentions atom B's actor", () => {
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        body: "@bob can you check this",
      }),
      makeEvent({
        id: "b",
        actor: "bob",
        body: "looking now",
      }),
    ];
    const g = buildGraph(events, "me");
    const mentionEdges = g.edges.filter(
      (e) => e.kind === "mention" && hasEdge(e, "a", "b"),
    );
    expect(mentionEdges.length).toBe(1);
    expect(mentionEdges[0].weight).toBe(2);
  });

  it("creates a concept edge when two atoms share a concept", () => {
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        concepts: ["pcb", "supplychain"],
      }),
      makeEvent({
        id: "b",
        actor: "bob",
        concepts: ["pcb", "pricing"],
      }),
    ];
    const g = buildGraph(events, "me");
    const conceptEdges = g.edges.filter(
      (e) => e.kind === "concept" && hasEdge(e, "a", "b"),
    );
    expect(conceptEdges.length).toBe(1);
    expect(conceptEdges[0].weight).toBe(1);
  });

  it("creates a thread edge between atoms sharing a conversation_id", () => {
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        refs: { conversation_id: "T9" } as unknown as TimelineEvent["refs"],
      }),
      makeEvent({
        id: "b",
        actor: "bob",
        refs: { conversation_id: "T9" } as unknown as TimelineEvent["refs"],
      }),
    ];
    const g = buildGraph(events, "me");
    const threadEdges = g.edges.filter(
      (e) => e.kind === "thread" && hasEdge(e, "a", "b"),
    );
    expect(threadEdges.length).toBe(1);
  });

  it("creates an actor edge between same-actor atoms within 24h", () => {
    const now = Date.now();
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        ts: new Date(now).toISOString(),
        body: "morning",
      }),
      makeEvent({
        id: "b",
        actor: "alice",
        ts: new Date(now - 60 * 60 * 1000).toISOString(),
        body: "afternoon",
      }),
    ];
    const g = buildGraph(events, "me");
    // Same-actor edges only — the test fixture uses no mentions/concepts.
    const actorEdges = g.edges.filter(
      (e) => e.kind === "actor" && hasEdge(e, "a", "b"),
    );
    expect(actorEdges.length).toBe(1);
  });

  it("does NOT create an actor edge when same-actor atoms are >24h apart", () => {
    const now = Date.now();
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        ts: new Date(now).toISOString(),
      }),
      makeEvent({
        id: "b",
        actor: "alice",
        ts: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    const g = buildGraph(events, "me");
    const directActorEdge = g.edges.find(
      (e) => e.kind === "actor" && hasEdge(e, "a", "b"),
    );
    expect(directActorEdge).toBeUndefined();
  });

  it("drops zero-weight edges", () => {
    // A standalone atom with no relations.
    const events = [
      makeEvent({ id: "lonely", body: "no mentions, no concepts" }),
    ];
    const g = buildGraph(events, "me");
    expect(g.edges.length).toBe(0);
  });
});

describe("v1.24 filterToNeighbors", () => {
  it("restricts the graph to the focus node + its direct neighbors", () => {
    const nodes: GraphNode[] = [
      { id: "a", kind: "atom", label: "a", size: 8, color: "#0f0" },
      { id: "b", kind: "atom", label: "b", size: 8, color: "#0f0" },
      { id: "c", kind: "atom", label: "c", size: 8, color: "#0f0" },
      { id: "d", kind: "atom", label: "d", size: 8, color: "#0f0" },
    ];
    const edges: GraphEdge[] = [
      { source: "a", target: "b", kind: "mention", weight: 2 },
      { source: "a", target: "c", kind: "concept", weight: 1 },
      // d not connected to a — should fall out.
      { source: "b", target: "d", kind: "actor", weight: 0.5 },
    ];
    const filtered = filterToNeighbors({ nodes, edges }, "a");
    const ids = filtered.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["a", "b", "c"]);
    expect(filtered.edges.length).toBe(2);
  });
});

// ----------------------------------------------------------------------
// 2. Render contract — GraphView with the mocked force-graph
// ----------------------------------------------------------------------

describe("v1.24 GraphView render contract", () => {
  it("mounts the canvas with the inferred node + edge counts", () => {
    const events = [
      makeEvent({
        id: "a",
        actor: "alice",
        body: "@bob ping",
      }),
      makeEvent({
        id: "b",
        actor: "bob",
        body: "@alice pong",
      }),
    ];
    render(
      <GraphView events={events} currentUser="me" onOpenAtom={() => {}} />,
    );
    const view = screen.getByTestId("graph-view");
    expect(view.getAttribute("data-atom-count")).toBe("2");
    // Node count = 2 atoms + 1 person node (actor "alice" or "bob"
    // appears twice — only one of them has 2+ atoms because each has 1
    // atom. Actually each actor has 1 atom in this fixture, so no
    // person node. Both with 1 atom each.)
    expect(view.getAttribute("data-node-count")).toBe("2");
    // Edge count = 1 mention edge between a and b.
    expect(view.getAttribute("data-edge-count")).toBe("1");
  });

  it("renders 0 nodes when given 0 events (caller still owns EmptyState)", () => {
    render(
      <GraphView events={[]} currentUser="me" onOpenAtom={() => {}} />,
    );
    const view = screen.getByTestId("graph-view");
    expect(view.getAttribute("data-node-count")).toBe("0");
    expect(view.getAttribute("data-edge-count")).toBe("0");
    // Status chip says "0 nodes · 0 edges" — diagnostic, not a fake graph.
    expect(screen.getByTestId("graph-status").textContent).toContain(
      "0 nodes",
    );
  });

  it("clicking an atom node calls onOpenAtom with the underlying event", () => {
    const onOpenAtom = vi.fn();
    const events = [
      makeEvent({ id: "a", actor: "alice" }),
      makeEvent({ id: "b", actor: "bob", body: "@alice hi" }),
    ];
    render(
      <GraphView
        events={events}
        currentUser="me"
        onOpenAtom={onOpenAtom}
      />,
    );
    fireEvent.click(screen.getByTestId("mock-node-a"));
    expect(onOpenAtom).toHaveBeenCalledTimes(1);
    expect(onOpenAtom.mock.calls[0][0].id).toBe("a");
  });

  it("hover on a node updates the graph-view data-hovered attribute", () => {
    const events = [
      makeEvent({ id: "a", actor: "alice" }),
      makeEvent({ id: "b", actor: "bob", body: "@alice hi" }),
    ];
    render(
      <GraphView events={events} currentUser="me" onOpenAtom={() => {}} />,
    );
    const view = screen.getByTestId("graph-view");
    expect(view.getAttribute("data-hovered")).toBe("");
    fireEvent.mouseEnter(screen.getByTestId("mock-node-a"));
    expect(view.getAttribute("data-hovered")).toBe("a");
    fireEvent.mouseLeave(screen.getByTestId("mock-node-a"));
    expect(view.getAttribute("data-hovered")).toBe("");
  });

  it("clicking a thread node sets the focus filter", () => {
    const events = [
      makeEvent({
        id: "a",
        refs: { conversation_id: "T1" } as unknown as TimelineEvent["refs"],
      }),
      makeEvent({
        id: "b",
        refs: { conversation_id: "T1" } as unknown as TimelineEvent["refs"],
      }),
    ];
    render(
      <GraphView events={events} currentUser="me" onOpenAtom={() => {}} />,
    );
    const view = screen.getByTestId("graph-view");
    expect(view.getAttribute("data-focused")).toBe("");
    fireEvent.click(screen.getByTestId("mock-node-thread:t1"));
    expect(view.getAttribute("data-focused")).toBe("thread:t1");
    // "clear focus ×" affordance now visible.
    expect(screen.getByTestId("graph-clear-focus")).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// helpers local to this file
// ----------------------------------------------------------------------

function hasEdge(e: GraphEdge, x: string, y: string): boolean {
  return (
    (e.source === x && e.target === y) ||
    (e.source === y && e.target === x)
  );
}
